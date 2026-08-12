import fs from 'fs';
import path from 'path';
import multer from 'multer';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import cleanoxPool from '../../shared/db/cleanox.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_BASE = process.env.UPLOAD_BASE_DIR
  ? path.resolve(process.env.UPLOAD_BASE_DIR)
  : path.resolve(__dirname, '../../../src/assets');
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
  { name: 'check_in_photo', maxCount: 1 },
  { name: 'full_body_photo', maxCount: 1 },
  { name: 'side_photo', maxCount: 1 },
  { name: 'back_photo', maxCount: 1 },
  { name: 'hand_photo', maxCount: 1 },
  { name: 'check_out_photo', maxCount: 1 },
]);

const GROOMING_FIELDS = ['full_body_photo', 'side_photo', 'back_photo', 'hand_photo'];
const REQUIRED_CHECK_IN_PHOTOS = ['check_in_photo'];
const REQUIRED_GROOMING_PHOTOS = GROOMING_FIELDS;

const PHOTO_TYPE_META = [
  { photo_type: 'full_body', label: 'Foto Satu Badan', field: 'full_body_photo', fileCol: 'full_body_photo_file', pathCol: 'full_body_photo_path' },
  { photo_type: 'side', label: 'Foto Samping', field: 'side_photo', fileCol: 'side_photo_file', pathCol: 'side_photo_path' },
  { photo_type: 'back', label: 'Foto Belakang', field: 'back_photo', fileCol: 'back_photo_file', pathCol: 'back_photo_path' },
  { photo_type: 'hand', label: 'Foto Tangan', field: 'hand_photo', fileCol: 'hand_photo_file', pathCol: 'hand_photo_path' },
];

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

function isGroomingComplete(row) {
  if (!row) return false;
  return PHOTO_TYPE_META.every((meta) => Boolean(row[meta.fileCol]));
}

function buildGroomingPhotos(row) {
  return PHOTO_TYPE_META.map((meta) => ({
    photo_type: meta.photo_type,
    label: meta.label,
    file: row?.[meta.fileCol] || null,
    path: row?.[meta.pathCol] || null,
    present: Boolean(row?.[meta.fileCol]),
  }));
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

    const groomingComplete = isGroomingComplete(row);
    const checkInPhoto = row?.check_in_photo_file
      ? { file: row.check_in_photo_file, path: row.check_in_photo_path }
      : null;

    return res.json({
      attendance: row || null,
      check_in_photo: checkInPhoto,
      grooming_complete: groomingComplete,
      grooming_photos: buildGroomingPhotos(row),
      required_check_in_photos: REQUIRED_CHECK_IN_PHOTOS,
      required_grooming_photos: REQUIRED_GROOMING_PHOTOS,
      required_photos: REQUIRED_CHECK_IN_PHOTOS,
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

  if (!files.check_in_photo?.[0]) {
    return res.status(400).json({ message: 'Foto In wajib diunggah' });
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

    const checkInPhoto = await savePhoto(workerId, today, 'check_in', files.check_in_photo[0]);
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
             check_in_photo_file = ?,
             check_in_photo_path = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [
          latitude,
          longitude,
          locationName,
          checkInPhoto.file,
          checkInPhoto.path,
          existing.id,
        ]
      );
    } else {
      await connection.query(
        `INSERT INTO tr_worker_attendance
          (worker_id, attendance_date, check_in_at, check_in_latitude, check_in_longitude,
           check_in_location_name, check_in_photo_file, check_in_photo_path)
         VALUES (?, ?, NOW(), ?, ?, ?, ?, ?)`,
        [
          workerId,
          today,
          latitude,
          longitude,
          locationName,
          checkInPhoto.file,
          checkInPhoto.path,
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

export const submitGroomingPhotos = async (req, res) => {
  const workerId = req.user?.id;
  const today = todayDateString();
  const files = req.files || {};

  for (const fieldName of GROOMING_FIELDS) {
    if (!files[fieldName]?.[0]) {
      return res.status(400).json({ message: `Foto ${fieldName} wajib diunggah` });
    }
  }

  try {
    const [[existing]] = await cleanoxPool.query(
      `SELECT id, check_in_at
       FROM tr_worker_attendance
       WHERE worker_id = ? AND attendance_date = ?`,
      [workerId, today]
    );

    if (!existing?.check_in_at) {
      return res.status(400).json({ message: 'Lakukan Foto In / check-in terlebih dahulu sebelum foto grooming' });
    }

    const fullBody = await savePhoto(workerId, today, 'full_body', files.full_body_photo[0]);
    const side = await savePhoto(workerId, today, 'side', files.side_photo[0]);
    const back = await savePhoto(workerId, today, 'back', files.back_photo[0]);
    const hand = await savePhoto(workerId, today, 'hand', files.hand_photo[0]);

    await cleanoxPool.query(
      `UPDATE tr_worker_attendance
       SET full_body_photo_file = ?,
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

    return res.json({ message: 'Foto grooming berhasil disimpan' });
  } catch (error) {
    console.error('[mobileAttendance/submitGroomingPhotos]', error.message);
    return res.status(500).json({ message: 'Gagal menyimpan foto grooming' });
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

function reviewStatusFromCount(count) {
  return Number(count) >= 4 ? 'sudah' : 'belum';
}

function mapPhotoReviewStatus(score) {
  if (score === 1 || score === '1') {
    return { score: 1, status: 'sesuai', reason: null };
  }
  if (score === 0 || score === '0') {
    return { score: 0, status: 'tidak_sesuai' };
  }
  return { score: null, status: 'belum_dinilai', reason: null };
}

export const getRekapMonth = async (req, res) => {
  const workerId = req.user?.id;
  const month = String(req.query.month || '').trim();

  if (!isValidMonthKey(month)) {
    return res.status(400).json({ message: 'Parameter month wajib format YYYY-MM' });
  }

  const { startDate, endDate } = monthDateBounds(month);

  try {
    const [rows] = await cleanoxPool.query(
      `
        SELECT
          a.id AS attendance_id,
          a.attendance_date,
          a.check_in_at,
          a.check_out_at,
          COUNT(r.id) AS reviewed_count
        FROM tr_worker_attendance a
        LEFT JOIN tr_worker_attendance_photo_reviews r
          ON r.attendance_id = a.id
        WHERE a.worker_id = ?
          AND a.attendance_date >= ?
          AND a.attendance_date <= ?
        GROUP BY a.id, a.attendance_date, a.check_in_at, a.check_out_at
        ORDER BY a.attendance_date ASC
      `,
      [workerId, startDate, endDate]
    );

    const days = {};
    for (const row of rows || []) {
      const dateKey = toDateOnly(row.attendance_date);
      if (!dateKey) continue;
      const reviewedCount = Number(row.reviewed_count) || 0;
      days[dateKey] = {
        attendance_id: Number(row.attendance_id),
        attendance_date: dateKey,
        check_in_at: row.check_in_at,
        check_out_at: row.check_out_at,
        reviewed_count: reviewedCount,
        review_status: reviewStatusFromCount(reviewedCount),
      };
    }

    return res.json({ month, days });
  } catch (error) {
    console.error('[mobileAttendance/getRekapMonth]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil rekap absensi bulanan' });
  }
};

export const getRekapDay = async (req, res) => {
  const workerId = req.user?.id;
  const date = String(req.query.date || '').trim();

  if (!isValidDateKey(date)) {
    return res.status(400).json({ message: 'Parameter date wajib format YYYY-MM-DD' });
  }

  try {
    const [[attendance]] = await cleanoxPool.query(
      `
        SELECT id, attendance_date, check_in_at, check_out_at
        FROM tr_worker_attendance
        WHERE worker_id = ? AND attendance_date = ?
        LIMIT 1
      `,
      [workerId, date]
    );

    if (!attendance) {
      return res.status(404).json({ message: 'Absensi pada tanggal ini tidak ditemukan' });
    }

    const [reviewRows] = await cleanoxPool.query(
      `
        SELECT photo_type, score, reason
        FROM tr_worker_attendance_photo_reviews
        WHERE attendance_id = ?
      `,
      [attendance.id]
    );

    const reviewMap = {};
    for (const rev of reviewRows || []) {
      reviewMap[rev.photo_type] = rev;
    }

    const photos = PHOTO_TYPE_META.map((meta) => {
      const rev = reviewMap[meta.photo_type];
      if (!rev) {
        return {
          photo_type: meta.photo_type,
          label: meta.label,
          score: null,
          status: 'belum_dinilai',
          reason: null,
        };
      }
      const mapped = mapPhotoReviewStatus(rev.score);
      if (mapped.status === 'tidak_sesuai') {
        return {
          photo_type: meta.photo_type,
          label: meta.label,
          score: 0,
          status: 'tidak_sesuai',
          reason: String(rev.reason || '').trim() || null,
        };
      }
      return {
        photo_type: meta.photo_type,
        label: meta.label,
        score: mapped.score,
        status: mapped.status,
        reason: null,
      };
    });

    const reviewedCount = photos.filter((p) => p.score === 0 || p.score === 1).length;

    return res.json({
      attendance_id: Number(attendance.id),
      attendance_date: toDateOnly(attendance.attendance_date),
      check_in_at: attendance.check_in_at,
      check_out_at: attendance.check_out_at,
      reviewed_count: reviewedCount,
      review_status: reviewStatusFromCount(reviewedCount),
      photos,
    });
  } catch (error) {
    console.error('[mobileAttendance/getRekapDay]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil detail rekap absensi' });
  }
};
