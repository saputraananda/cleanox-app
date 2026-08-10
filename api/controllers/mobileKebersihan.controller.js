import fs from 'fs';
import path from 'path';
import multer from 'multer';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import cleanoxPool from '../db/cleanox.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_BASE = process.env.UPLOAD_BASE_DIR
  ? path.resolve(process.env.UPLOAD_BASE_DIR)
  : path.resolve(__dirname, '../../src/assets');
const KEBERSIHAN_BASE = path.join(STORAGE_BASE, 'worker-kebersihan');

if (!fs.existsSync(KEBERSIHAN_BASE)) fs.mkdirSync(KEBERSIHAN_BASE, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('File kebersihan harus berupa gambar'));
  },
});

export const kebersihanUploadMiddleware = upload.single('photo');

function todayDateString() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const jakarta = new Date(utc + 7 * 60 * 60000);
  return jakarta.toISOString().slice(0, 10);
}

function sanitizeName(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

async function compressToJpg(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

async function savePhoto(workerId, reportDate, areaCode, file) {
  const workerSlug = sanitizeName(workerId);
  const dateSlug = sanitizeName(reportDate);
  const areaSlug = sanitizeName(areaCode);
  const fileName = `${workerSlug}_${dateSlug}_${areaSlug}.jpg`;
  const filePath = path.join(KEBERSIHAN_BASE, fileName);
  const buffer = await compressToJpg(file.buffer);
  fs.writeFileSync(filePath, buffer);
  return {
    file: fileName,
    path: `/mobile-kebersihan/file/${fileName}`,
  };
}

export const serveKebersihanFile = (req, res) => {
  const safeFileName = path.basename(req.params.filename);
  const fullPath = path.join(KEBERSIHAN_BASE, safeFileName);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ message: 'File kebersihan tidak ditemukan' });
  }

  return res.sendFile(fullPath);
};

export const getTodayKebersihanStatus = async (req, res) => {
  const workerId = req.user?.id;
  const today = todayDateString();

  try {
    const [areas] = await cleanoxPool.query(
      `SELECT id, code, name, sort_order
       FROM mst_kebersihan_areas
       WHERE is_active = 1
       ORDER BY sort_order ASC, id ASC`
    );

    const [[report]] = await cleanoxPool.query(
      `SELECT *
       FROM tr_worker_kebersihan_reports
       WHERE worker_id = ? AND report_date = ?`,
      [workerId, today]
    );

    let photosByArea = new Map();
    if (report) {
      const [photos] = await cleanoxPool.query(
        `SELECT area_id, photo_file, photo_path, uploaded_at
         FROM tr_worker_kebersihan_photos
         WHERE report_id = ?`,
        [report.id]
      );
      photosByArea = new Map(photos.map((row) => [Number(row.area_id), row]));
    }

    const areasPayload = areas.map((area) => {
      const photo = photosByArea.get(Number(area.id));
      return {
        area_id: area.id,
        code: area.code,
        name: area.name,
        sort_order: area.sort_order,
        photo: photo
          ? {
              photo_file: photo.photo_file,
              photo_path: photo.photo_path,
              uploaded_at: photo.uploaded_at,
            }
          : null,
      };
    });

    const uploadedCount = areasPayload.filter((area) => area.photo).length;

    return res.json({
      report_date: today,
      status: report?.status || null,
      completed_at: report?.completed_at || null,
      required_count: areas.length,
      uploaded_count: uploadedCount,
      areas: areasPayload,
    });
  } catch (error) {
    console.error('[mobileKebersihan/getTodayKebersihanStatus]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil status kebersihan hari ini' });
  }
};

export const uploadKebersihanPhoto = async (req, res) => {
  const workerId = req.user?.id;
  const today = todayDateString();
  const areaId = Number(req.body?.area_id);
  const file = req.file;

  if (!areaId) {
    return res.status(400).json({ message: 'area_id wajib diisi' });
  }
  if (!file) {
    return res.status(400).json({ message: 'Foto wajib diunggah' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [activeAreas] = await connection.query(
      `SELECT id, code, name
       FROM mst_kebersihan_areas
       WHERE is_active = 1
       ORDER BY sort_order ASC, id ASC`
    );

    if (activeAreas.length !== 4) {
      await connection.rollback();
      return res.status(500).json({ message: 'Konfigurasi area kebersihan tidak valid (harus 4 area aktif)' });
    }

    const area = activeAreas.find((row) => Number(row.id) === areaId);
    if (!area) {
      await connection.rollback();
      return res.status(400).json({ message: 'Area kebersihan tidak valid' });
    }

    let [[report]] = await connection.query(
      `SELECT *
       FROM tr_worker_kebersihan_reports
       WHERE worker_id = ? AND report_date = ?
       FOR UPDATE`,
      [workerId, today]
    );

    if (!report) {
      const [insertResult] = await connection.query(
        `INSERT INTO tr_worker_kebersihan_reports
          (worker_id, report_date, status)
         VALUES (?, ?, 'In_Progress')`,
        [workerId, today]
      );
      [[report]] = await connection.query(
        `SELECT * FROM tr_worker_kebersihan_reports WHERE id = ?`,
        [insertResult.insertId]
      );
    }

    const saved = await savePhoto(workerId, today, area.code, file);

    const [[existingPhoto]] = await connection.query(
      `SELECT id FROM tr_worker_kebersihan_photos
       WHERE report_id = ? AND area_id = ?`,
      [report.id, areaId]
    );

    if (existingPhoto) {
      await connection.query(
        `UPDATE tr_worker_kebersihan_photos
         SET photo_file = ?,
             photo_path = ?,
             uploaded_at = NOW(),
             updated_at = NOW()
         WHERE id = ?`,
        [saved.file, saved.path, existingPhoto.id]
      );
    } else {
      await connection.query(
        `INSERT INTO tr_worker_kebersihan_photos
          (report_id, area_id, photo_file, photo_path, uploaded_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [report.id, areaId, saved.file, saved.path]
      );
    }

    const [[countRow]] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM tr_worker_kebersihan_photos
       WHERE report_id = ?`,
      [report.id]
    );
    const uploadedCount = Number(countRow?.total || 0);
    let status = report.status;

    if (uploadedCount >= activeAreas.length) {
      status = 'Completed';
      await connection.query(
        `UPDATE tr_worker_kebersihan_reports
         SET status = 'Completed',
             completed_at = COALESCE(completed_at, NOW()),
             updated_at = NOW()
         WHERE id = ?`,
        [report.id]
      );
    } else {
      status = 'In_Progress';
      await connection.query(
        `UPDATE tr_worker_kebersihan_reports
         SET status = 'In_Progress',
             updated_at = NOW()
         WHERE id = ?`,
        [report.id]
      );
    }

    await connection.commit();
    return res.status(201).json({
      message: 'Foto kebersihan berhasil disimpan',
      status,
      uploaded_count: uploadedCount,
      area_id: areaId,
      photo_path: saved.path,
    });
  } catch (error) {
    await connection.rollback();
    console.error('[mobileKebersihan/uploadKebersihanPhoto]', error.message);
    return res.status(500).json({ message: 'Gagal menyimpan foto kebersihan' });
  } finally {
    connection.release();
  }
};
