import fs from 'fs';
import path from 'path';
import multer from 'multer';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import cleanoxPool, { aloraPool } from '../../shared/db/cleanox.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_BASE = process.env.UPLOAD_BASE_DIR
  ? path.resolve(process.env.UPLOAD_BASE_DIR)
  : path.resolve(__dirname, '../../../src/assets');
const KEBERSIHAN_BASE = path.join(STORAGE_BASE, 'worker-kebersihan');

if (!fs.existsSync(KEBERSIHAN_BASE)) fs.mkdirSync(KEBERSIHAN_BASE, { recursive: true });

const ALLOWED_SESSIONS = new Set(['pagi', 'sore']);
const PAGI_MIN_MINUTE = 7 * 60; // 07:00 inclusive
const PAGI_MAX_MINUTE = 9 * 60; // 09:00 inclusive
const SORE_MIN_MINUTE = 9 * 60 + 1; // 09:01
const SORE_MAX_MINUTE = 19 * 60; // 19:00 inclusive

/** TEMP: bypass jam + syarat grooming untuk sesi pagi (uji upload). Set false untuk lock kembali. */
const TEMP_BYPASS_KEBERSIHAN_PAGI_LOCK = false;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('File kebersihan harus berupa gambar'));
  },
});

export const kebersihanUploadMiddleware = upload.single('photo');

function jakartaNow() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 7 * 60 * 60000);
}

function todayDateString() {
  return jakartaNow().toISOString().slice(0, 10);
}

function jakartaMinuteOfDay() {
  const j = jakartaNow();
  return j.getHours() * 60 + j.getMinutes();
}

function normalizeSession(value) {
  const s = String(value || 'pagi').toLowerCase().trim();
  return ALLOWED_SESSIONS.has(s) ? s : null;
}

async function getTodayGroomingComplete(workerId) {
  const today = todayDateString();
  const [[row]] = await cleanoxPool.query(
    `SELECT full_body_photo_file, side_photo_file, back_photo_file, hand_photo_file
     FROM tr_worker_attendance
     WHERE worker_id = ? AND attendance_date = ?
     LIMIT 1`,
    [workerId, today]
  );
  if (!row) return false;
  return Boolean(
    row.full_body_photo_file &&
      row.side_photo_file &&
      row.back_photo_file &&
      row.hand_photo_file
  );
}

function resolveSessionWindow(session) {
  const minute = jakartaMinuteOfDay();
  if (session === 'pagi') {
    if (TEMP_BYPASS_KEBERSIHAN_PAGI_LOCK) {
      return {
        allowed: true,
        label: '07:00 – 09:00 WIB',
        closes_at: '09:00',
        reason: null,
      };
    }
    if (minute < PAGI_MIN_MINUTE) {
      return {
        allowed: false,
        label: '07:00 – 09:00 WIB',
        closes_at: '09:00',
        reason: 'Kebersihan pagi baru bisa diisi mulai pukul 07:00 WIB',
      };
    }
    const allowed = minute <= PAGI_MAX_MINUTE;
    return {
      allowed,
      label: '07:00 – 09:00 WIB',
      closes_at: '09:00',
      reason: allowed ? null : 'Batas pengambilan foto kebersihan sampai pukul 09:00 WIB',
    };
  }
  if (session === 'sore') {
    if (minute < SORE_MIN_MINUTE) {
      return {
        allowed: false,
        label: '09:01 – 19:00 WIB',
        closes_at: '19:00',
        reason: 'Kebersihan sore baru bisa diisi setelah 09:00 WIB',
      };
    }
    const allowed = minute <= SORE_MAX_MINUTE;
    return {
      allowed,
      label: '09:01 – 19:00 WIB',
      closes_at: '19:00',
      reason: allowed ? null : 'Batas kebersihan sore sudah lewat (maksimal 19:00 WIB)',
    };
  }
  return {
    allowed: false,
    label: '-',
    closes_at: null,
    reason: 'Sesi tidak valid',
  };
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

async function savePhoto(reportDate, session, areaCode, file) {
  const dateSlug = sanitizeName(reportDate);
  const sessionSlug = sanitizeName(session);
  const areaSlug = sanitizeName(areaCode);
  const fileName = `${dateSlug}_${sessionSlug}_${areaSlug}.jpg`;
  const filePath = path.join(KEBERSIHAN_BASE, fileName);
  const buffer = await compressToJpg(file.buffer);
  fs.writeFileSync(filePath, buffer);
  return {
    file: fileName,
    path: `/mobile-kebersihan/file/${fileName}`,
  };
}

async function getSubmitterMeta(workerId) {
  const id = Number(workerId);
  if (!id) return null;
  try {
    const [[emp]] = await aloraPool.query(
      `SELECT employee_id, employee_code, full_name
       FROM mst_employee
       WHERE employee_id = ?
       LIMIT 1`,
      [id]
    );
    if (emp) {
      return {
        worker_id: Number(emp.employee_id),
        employee_code: emp.employee_code || null,
        full_name: emp.full_name || null,
      };
    }
  } catch {
    // fallback below
  }
  return { worker_id: id, employee_code: null, full_name: null };
}

async function getSharedReport(db, reportDate, session, { forUpdate = false } = {}) {
  const sql = `
    SELECT *
    FROM tr_worker_kebersihan_reports
    WHERE report_date = ? AND session = ?
    LIMIT 1
    ${forUpdate ? 'FOR UPDATE' : ''}
  `;
  const [[report]] = await db.query(sql, [reportDate, session]);
  return report || null;
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
  const session = normalizeSession(req.query.session || 'pagi');

  if (!session) {
    return res.status(400).json({ message: 'session harus pagi atau sore' });
  }

  const window = resolveSessionWindow(session);

  try {
    const [areas] = await cleanoxPool.query(
      `SELECT id, code, name, sort_order
       FROM mst_kebersihan_areas
       WHERE is_active = 1
       ORDER BY sort_order ASC, id ASC`
    );

    const report = await getSharedReport(cleanoxPool, today, session);

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
    const groomingComplete = await getTodayGroomingComplete(workerId);
    const groomingLocked =
      session === 'pagi' && !groomingComplete && !TEMP_BYPASS_KEBERSIHAN_PAGI_LOCK;
    const groomingLock = {
      locked: groomingLocked,
      reason: groomingLocked
        ? 'Silakan lengkapi foto grooming terlebih dahulu untuk mengakses kebersihan pagi.'
        : null,
    };

    const submittedBy = report?.worker_id ? await getSubmitterMeta(report.worker_id) : null;

    return res.json({
      report_date: today,
      session,
      status: report?.status || null,
      completed_at: report?.completed_at || null,
      required_count: areas.length,
      uploaded_count: uploadedCount,
      areas: areasPayload,
      window,
      grooming_complete: groomingComplete,
      grooming_lock: groomingLock,
      is_shared: true,
      submitted_by: submittedBy,
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
  const session = normalizeSession(req.body?.session);
  const file = req.file;

  if (!session) {
    return res.status(400).json({ message: 'session harus pagi atau sore' });
  }
  if (!areaId) {
    return res.status(400).json({ message: 'area_id wajib diisi' });
  }
  if (!file) {
    return res.status(400).json({ message: 'Foto wajib diunggah' });
  }

  const window = resolveSessionWindow(session);
  if (!window.allowed) {
    return res.status(403).json({ message: window.reason || 'Di luar jam kebersihan sesi ini' });
  }

  if (session === 'pagi' && !TEMP_BYPASS_KEBERSIHAN_PAGI_LOCK) {
    const groomingComplete = await getTodayGroomingComplete(workerId);
    if (!groomingComplete) {
      return res.status(403).json({
        message: 'Lengkapi foto grooming terlebih dahulu sebelum mengunggah kebersihan pagi.',
      });
    }
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

    let report = await getSharedReport(connection, today, session, { forUpdate: true });

    if (!report) {
      try {
        const [insertResult] = await connection.query(
          `INSERT INTO tr_worker_kebersihan_reports
            (worker_id, report_date, session, status)
           VALUES (?, ?, ?, 'In_Progress')`,
          [workerId, today, session]
        );
        report = await getSharedReport(connection, today, session, { forUpdate: true });
        if (!report && insertResult?.insertId) {
          const [[byId]] = await connection.query(
            `SELECT * FROM tr_worker_kebersihan_reports WHERE id = ?`,
            [insertResult.insertId]
          );
          report = byId;
        }
      } catch (insertErr) {
        // Race: another worker created the shared row
        report = await getSharedReport(connection, today, session, { forUpdate: true });
        if (!report) throw insertErr;
      }
    }

    const saved = await savePhoto(today, session, area.code, file);

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
         SET worker_id = ?,
             status = 'Completed',
             completed_at = COALESCE(completed_at, NOW()),
             updated_at = NOW()
         WHERE id = ?`,
        [workerId, report.id]
      );
    } else {
      status = 'In_Progress';
      await connection.query(
        `UPDATE tr_worker_kebersihan_reports
         SET worker_id = ?,
             status = 'In_Progress',
             updated_at = NOW()
         WHERE id = ?`,
        [workerId, report.id]
      );
    }

    await connection.commit();
    return res.status(201).json({
      message: 'Foto kebersihan berhasil disimpan',
      session,
      status,
      uploaded_count: uploadedCount,
      area_id: areaId,
      photo_path: saved.path,
      submitted_by: await getSubmitterMeta(workerId),
    });
  } catch (error) {
    await connection.rollback();
    console.error('[mobileKebersihan/uploadKebersihanPhoto]', error.message);
    return res.status(500).json({ message: 'Gagal menyimpan foto kebersihan' });
  } finally {
    connection.release();
  }
};

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

function isValidMonthKey(value) {
  return /^\d{4}-\d{2}$/.test(String(value || ''));
}

function isValidDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function monthDateBounds(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const startDate = `${monthKey}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${monthKey}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

function mapAreaScoreStatus(score) {
  const n = Number(score);
  if (n === 1) return { score: 1, status: 'sesuai', reason: null };
  if (n === 0.5) return { score: 0.5, status: 'cukup', reason: null };
  if (n === 0) return { score: 0, status: 'tidak_sesuai' };
  return { score: null, status: 'belum_dinilai', reason: null };
}

export const getRekapMonth = async (req, res) => {
  const month = String(req.query.month || '').trim();
  if (!isValidMonthKey(month)) {
    return res.status(400).json({ message: 'Parameter month wajib format YYYY-MM' });
  }
  const { startDate, endDate } = monthDateBounds(month);

  try {
    const [areaRows] = await cleanoxPool.query(
      `SELECT COUNT(*) AS cnt FROM mst_kebersihan_areas WHERE is_active = 1`
    );
    const requiredCount = Number(areaRows?.[0]?.cnt) || 4;

    const [rows] = await cleanoxPool.query(
      `
        SELECT
          r.id AS report_id,
          r.report_date,
          r.session,
          r.status,
          r.worker_id,
          COUNT(v.id) AS reviewed_count
        FROM tr_worker_kebersihan_reports r
        LEFT JOIN tr_worker_kebersihan_area_reviews v ON v.report_id = r.id
        WHERE r.report_date >= ?
          AND r.report_date <= ?
        GROUP BY r.id, r.report_date, r.session, r.status, r.worker_id
        ORDER BY r.report_date ASC, r.session ASC
      `,
      [startDate, endDate]
    );

    const days = {};
    for (const row of rows || []) {
      const dateKey = toDateOnly(row.report_date);
      if (!dateKey) continue;
      const session = row.session || 'pagi';
      const key = `${dateKey}_${session}`;
      const reviewedCount = Number(row.reviewed_count) || 0;
      days[key] = {
        report_id: Number(row.report_id),
        report_date: dateKey,
        session,
        status: row.status,
        submitted_by_worker_id: row.worker_id != null ? Number(row.worker_id) : null,
        reviewed_count: reviewedCount,
        review_status: reviewedCount >= requiredCount ? 'sudah' : 'belum',
      };
    }
    return res.json({ month, days, required_area_count: requiredCount });
  } catch (error) {
    console.error('[mobileKebersihan/getRekapMonth]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil rekap kebersihan bulanan' });
  }
};

export const getRekapDay = async (req, res) => {
  const date = String(req.query.date || '').trim();
  const session = normalizeSession(req.query.session || 'pagi');
  if (!isValidDateKey(date)) {
    return res.status(400).json({ message: 'Parameter date wajib format YYYY-MM-DD' });
  }
  if (!session) {
    return res.status(400).json({ message: 'session harus pagi atau sore' });
  }

  try {
    const report = await getSharedReport(cleanoxPool, date, session);
    if (!report) {
      return res.status(404).json({ message: 'Laporan kebersihan pada tanggal/sesi ini tidak ditemukan' });
    }

    const [areas] = await cleanoxPool.query(
      `SELECT id, code, name, sort_order FROM mst_kebersihan_areas WHERE is_active = 1 ORDER BY sort_order ASC, id ASC`
    );
    const [reviewRows] = await cleanoxPool.query(
      `SELECT area_id, score, reason FROM tr_worker_kebersihan_area_reviews WHERE report_id = ?`,
      [report.id]
    );
    const reviewMap = {};
    for (const rev of reviewRows || []) {
      reviewMap[Number(rev.area_id)] = rev;
    }

    const areasPayload = (areas || []).map((area) => {
      const rev = reviewMap[Number(area.id)];
      if (!rev) {
        return {
          area_id: Number(area.id),
          code: area.code,
          name: area.name,
          score: null,
          status: 'belum_dinilai',
          reason: null,
        };
      }
      const mapped = mapAreaScoreStatus(rev.score);
      return {
        area_id: Number(area.id),
        code: area.code,
        name: area.name,
        score: mapped.score,
        status: mapped.status,
        reason: mapped.status === 'tidak_sesuai' ? (String(rev.reason || '').trim() || null) : null,
      };
    });

    const reviewedCount = areasPayload.filter((a) => a.score === 0 || a.score === 0.5 || a.score === 1).length;
    const requiredCount = areasPayload.length || 4;
    const submittedBy = report.worker_id ? await getSubmitterMeta(report.worker_id) : null;

    return res.json({
      report_id: Number(report.id),
      report_date: toDateOnly(report.report_date),
      session: report.session || session,
      status: report.status,
      submitted_by: submittedBy,
      reviewed_count: reviewedCount,
      review_status: reviewedCount >= requiredCount ? 'sudah' : 'belum',
      areas: areasPayload,
    });
  } catch (error) {
    console.error('[mobileKebersihan/getRekapDay]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil detail rekap kebersihan' });
  }
};
