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
const ATTENDANCE_BASE = path.join(STORAGE_BASE, 'worker-attendance');

if (!fs.existsSync(ATTENDANCE_BASE)) fs.mkdirSync(ATTENDANCE_BASE, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('File attendance harus berupa gambar'));
  },
});

export const attendanceUploadMiddleware = upload.fields([
  { name: 'full_body_photo', maxCount: 1 },
  { name: 'side_photo', maxCount: 1 },
  { name: 'back_photo', maxCount: 1 },
  { name: 'hand_photo', maxCount: 1 },
  { name: 'check_out_photo', maxCount: 1 },
]);

const REQUIRED_FIELDS = ['full_body_photo', 'side_photo', 'back_photo', 'hand_photo'];

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

async function savePhoto(workerId, attendanceDate, fieldName, file) {
  const workerSlug = sanitizeName(workerId);
  const dateSlug = sanitizeName(attendanceDate);
  const fileName = `${workerSlug}_${dateSlug}_${fieldName}.jpg`;
  const filePath = path.join(ATTENDANCE_BASE, fileName);
  const buffer = await compressToJpg(file.buffer);
  fs.writeFileSync(filePath, buffer);
  return {
    file: fileName,
    path: `/mobile-attendance/file/${fileName}`,
  };
}

export const serveAttendanceFile = (req, res) => {
  const safeFileName = path.basename(req.params.filename);
  const fullPath = path.join(ATTENDANCE_BASE, safeFileName);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ message: 'File attendance tidak ditemukan' });
  }

  return res.sendFile(fullPath);
};

export const getTodayAttendanceStatus = async (req, res) => {
  const workerId = req.user?.id;
  const today = todayDateString();

  try {
    const [[row]] = await cleanoxPool.query(
      `SELECT *
       FROM tr_worker_attendance
       WHERE worker_id = ? AND attendance_date = ?`,
      [workerId, today]
    );

    return res.json({
      attendance: row || null,
      required_photos: REQUIRED_FIELDS,
    });
  } catch (error) {
    console.error('[mobileAttendance/getTodayAttendanceStatus]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil status attendance hari ini' });
  }
};

export const checkInAttendance = async (req, res) => {
  const workerId = req.user?.id;
  const today = todayDateString();
  const files = req.files || {};

  for (const fieldName of REQUIRED_FIELDS) {
    if (!files[fieldName]?.[0]) {
      return res.status(400).json({ message: `Foto ${fieldName} wajib diunggah` });
    }
  }

  const connection = await cleanoxPool.getConnection();
  try {
    const [[existing]] = await connection.query(
      `SELECT id, check_in_at
       FROM tr_worker_attendance
       WHERE worker_id = ? AND attendance_date = ?`,
      [workerId, today]
    );

    if (existing?.check_in_at) {
      return res.status(409).json({ message: 'Attendance check-in hari ini sudah ada' });
    }

    const fullBody = await savePhoto(workerId, today, 'full_body', files.full_body_photo[0]);
    const side = await savePhoto(workerId, today, 'side', files.side_photo[0]);
    const back = await savePhoto(workerId, today, 'back', files.back_photo[0]);
    const hand = await savePhoto(workerId, today, 'hand', files.hand_photo[0]);

    const latitude = req.body.latitude ? Number(req.body.latitude) : null;
    const longitude = req.body.longitude ? Number(req.body.longitude) : null;
    const locationName = req.body.location_name || null;

    if (existing) {
      await connection.query(
        `UPDATE tr_worker_attendance
         SET check_in_at = NOW(),
             check_in_latitude = ?,
             check_in_longitude = ?,
             check_in_location_name = ?,
             full_body_photo_file = ?,
             full_body_photo_path = ?,
             side_photo_file = ?,
             side_photo_path = ?,
             back_photo_file = ?,
             back_photo_path = ?,
             hand_photo_file = ?,
             hand_photo_path = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [
          latitude,
          longitude,
          locationName,
          fullBody.file,
          fullBody.path,
          side.file,
          side.path,
          back.file,
          back.path,
          hand.file,
          hand.path,
          existing.id,
        ]
      );
    } else {
      await connection.query(
        `INSERT INTO tr_worker_attendance
          (worker_id, attendance_date, check_in_at, check_in_latitude, check_in_longitude,
           check_in_location_name, full_body_photo_file, full_body_photo_path,
           side_photo_file, side_photo_path, back_photo_file, back_photo_path,
           hand_photo_file, hand_photo_path)
         VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          workerId,
          today,
          latitude,
          longitude,
          locationName,
          fullBody.file,
          fullBody.path,
          side.file,
          side.path,
          back.file,
          back.path,
          hand.file,
          hand.path,
        ]
      );
    }

    return res.status(201).json({ message: 'Check-in attendance berhasil disimpan' });
  } catch (error) {
    console.error('[mobileAttendance/checkInAttendance]', error.message);
    return res.status(500).json({ message: 'Gagal menyimpan check-in attendance' });
  } finally {
    connection.release();
  }
};

export const checkOutAttendance = async (req, res) => {
  const workerId = req.user?.id;
  const today = todayDateString();
  const files = req.files || {};
  const latitude = req.body.latitude ? Number(req.body.latitude) : null;
  const longitude = req.body.longitude ? Number(req.body.longitude) : null;
  const locationName = req.body.location_name || null;

  try {
    if (!files.check_out_photo?.[0]) {
      return res.status(400).json({ message: 'Foto bukti checkout wajib diunggah' });
    }

    const checkoutPhoto = await savePhoto(workerId, today, 'check_out', files.check_out_photo[0]);

    const [result] = await cleanoxPool.query(
      `UPDATE tr_worker_attendance
       SET check_out_at = NOW(),
           check_out_latitude = ?,
           check_out_longitude = ?,
           check_out_location_name = ?,
           check_out_photo_file = ?,
           check_out_photo_path = ?,
           updated_at = NOW()
       WHERE worker_id = ? AND attendance_date = ? AND check_in_at IS NOT NULL`,
      [latitude, longitude, locationName, checkoutPhoto.file, checkoutPhoto.path, workerId, today]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Check-in hari ini belum ditemukan' });
    }

    return res.json({ message: 'Check-out attendance berhasil disimpan' });
  } catch (error) {
    console.error('[mobileAttendance/checkOutAttendance]', error.message);
    return res.status(500).json({ message: 'Gagal menyimpan check-out attendance' });
  }
};
