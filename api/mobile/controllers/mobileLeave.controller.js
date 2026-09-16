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
const LEAVE_BASE = process.env.CLEANOX_LEAVE_DIR
  ? path.resolve(process.env.CLEANOX_LEAVE_DIR)
  : path.join(STORAGE_BASE, 'worker-leave');

if (!fs.existsSync(LEAVE_BASE)) fs.mkdirSync(LEAVE_BASE, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('File surat dokter harus berupa gambar'));
  },
});

export const doctorNoteUploadMiddleware = upload.single('doctor_note');

const ALLOWED_LEAVE_TYPES = new Set(['izin', 'sakit', 'cuti']);
const ALLOWED_DURATION_TYPES = new Set(['full_day', 'half_day_morning', 'half_day_afternoon']);

function todayDateString() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const jakarta = new Date(utc + 7 * 60 * 60000);
  return jakarta.toISOString().slice(0, 10);
}

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

async function saveDoctorNote(workerId, file) {
  const workerSlug = sanitizeName(workerId);
  const stamp = Date.now();
  const fileName = `${workerSlug}_${stamp}_doctor_note.jpg`;
  const filePath = path.join(LEAVE_BASE, fileName);
  const buffer = await compressToJpg(file.buffer);
  fs.writeFileSync(filePath, buffer);
  return {
    file: fileName,
    path: `/mobile-leave/doctor-notes/${fileName}`,
  };
}

function deleteDoctorFile(fileName) {
  if (!fileName) return;
  const safe = path.basename(fileName);
  const fullPath = path.join(LEAVE_BASE, safe);
  fs.unlink(fullPath, () => {});
}

function serializeLeave(row) {
  if (!row) return null;
  return {
    ...row,
    start_date: toDateOnly(row.start_date),
    end_date: toDateOnly(row.end_date),
  };
}

function buildPeriodRange(month, year) {
  if (!(month >= 1 && month <= 12 && year >= 2000)) return null;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return {
    periodStart: `${prevYear}-${String(prevMonth).padStart(2, '0')}-26`,
    periodEnd: `${year}-${String(month).padStart(2, '0')}-25`,
  };
}

export const serveDoctorNote = (req, res) => {
  const safeFileName = path.basename(req.params.filename);
  const fullPath = path.join(LEAVE_BASE, safeFileName);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ message: 'File surat dokter tidak ditemukan' });
  }

  return res.sendFile(fullPath);
};

export const getTodayLeave = async (req, res) => {
  const workerId = req.user?.id;
  const today = todayDateString();

  try {
    const [rows] = await cleanoxPool.query(
      `SELECT id, leave_type, duration_type, start_date, end_date, reason, status,
              doctor_note_file, doctor_note_path
       FROM tr_worker_leaves
       WHERE worker_id = ?
         AND start_date <= ?
         AND end_date >= ?
         AND status IN ('pengajuan', 'disetujui')
       ORDER BY created_at DESC
       LIMIT 1`,
      [workerId, today, today]
    );

    return res.json({ leave: serializeLeave(rows[0] || null) });
  } catch (error) {
    console.error('[mobileLeave] getTodayLeave', error);
    return res.status(500).json({ message: 'Gagal mengambil status izin hari ini' });
  }
};

export const getLeaveList = async (req, res) => {
  const workerId = req.user?.id;
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '10', 10)));
  const offset = (page - 1) * limit;
  const month = parseInt(req.query.month || '0', 10);
  const year = parseInt(req.query.year || '0', 10);

  try {
    let periodWhere = '';
    const periodParams = [];
    const period = buildPeriodRange(month, year);
    if (period) {
      periodWhere = ' AND start_date <= ? AND end_date >= ?';
      periodParams.push(period.periodEnd, period.periodStart);
    }

    const [[{ total }]] = await cleanoxPool.query(
      `SELECT COUNT(*) AS total FROM tr_worker_leaves WHERE worker_id = ?${periodWhere}`,
      [workerId, ...periodParams]
    );

    const [rows] = await cleanoxPool.query(
      `SELECT id, leave_type, duration_type, start_date, end_date, reason,
              status, rejection_note, doctor_note_file, doctor_note_path,
              approved_by, approved_by_name, approved_at, created_at, updated_at
       FROM tr_worker_leaves
       WHERE worker_id = ?${periodWhere}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [workerId, ...periodParams, limit, offset]
    );

    return res.json({
      total: Number(total) || 0,
      page,
      limit,
      items: rows.map(serializeLeave),
    });
  } catch (error) {
    console.error('[mobileLeave] getLeaveList', error);
    return res.status(500).json({ message: 'Gagal mengambil riwayat pengajuan' });
  }
};

export const getLeaveYears = async (req, res) => {
  const workerId = req.user?.id;

  try {
    const [rows] = await cleanoxPool.query(
      `SELECT DISTINCT YEAR(start_date) AS yr
       FROM tr_worker_leaves
       WHERE worker_id = ?
       ORDER BY yr DESC`,
      [workerId]
    );
    const currentYear = new Date().getFullYear();
    const years = rows.map((r) => Number(r.yr)).filter(Boolean);
    if (!years.includes(currentYear)) years.unshift(currentYear);
    return res.json({ years });
  } catch (error) {
    console.error('[mobileLeave] getLeaveYears', error);
    return res.status(500).json({ message: 'Gagal mengambil daftar tahun' });
  }
};

export const getLeaveStats = async (req, res) => {
  const workerId = req.user?.id;
  const month = parseInt(req.query.month || '0', 10);
  const year = parseInt(req.query.year || '0', 10);

  try {
    let whereClause = 'WHERE worker_id = ?';
    const params = [workerId];
    const period = buildPeriodRange(month, year);
    if (period) {
      whereClause += ' AND start_date <= ? AND end_date >= ?';
      params.push(period.periodEnd, period.periodStart);
    }

    const [rows] = await cleanoxPool.query(
      `SELECT leave_type, COUNT(*) AS cnt FROM tr_worker_leaves ${whereClause} GROUP BY leave_type`,
      params
    );

    const stats = { izin: 0, sakit: 0, cuti: 0 };
    rows.forEach((r) => {
      if (r.leave_type in stats) stats[r.leave_type] = Number(r.cnt) || 0;
    });
    return res.json({ stats });
  } catch (error) {
    console.error('[mobileLeave] getLeaveStats', error);
    return res.status(500).json({ message: 'Gagal mengambil statistik izin' });
  }
};

export const submitLeave = async (req, res) => {
  const workerId = req.user?.id;
  const { leave_type, duration_type = 'full_day', start_date, end_date, reason } = req.body;
  let savedFile = null;

  try {
    if (!ALLOWED_LEAVE_TYPES.has(leave_type)) {
      return res.status(422).json({ message: 'leave_type tidak valid' });
    }
    if (!ALLOWED_DURATION_TYPES.has(duration_type)) {
      return res.status(422).json({ message: 'duration_type tidak valid' });
    }
    if (!start_date || !end_date) {
      return res.status(422).json({ message: 'start_date dan end_date wajib diisi' });
    }
    if (start_date > end_date) {
      return res.status(422).json({ message: 'end_date tidak boleh sebelum start_date' });
    }
    if (!reason || String(reason).trim().length < 5) {
      return res.status(422).json({ message: 'Keterangan wajib diisi minimal 5 karakter' });
    }
    if (leave_type === 'sakit' && !req.file) {
      return res.status(422).json({ message: 'Foto surat dokter wajib dilampirkan untuk izin sakit' });
    }
    if (duration_type !== 'full_day' && start_date !== end_date) {
      return res.status(422).json({ message: 'Izin setengah hari hanya berlaku untuk 1 hari' });
    }

    const [overlap] = await cleanoxPool.query(
      `SELECT id FROM tr_worker_leaves
       WHERE worker_id = ?
         AND status IN ('pengajuan', 'disetujui')
         AND start_date <= ? AND end_date >= ?`,
      [workerId, end_date, start_date]
    );
    if (overlap.length > 0) {
      return res.status(409).json({ message: 'Anda sudah memiliki pengajuan izin aktif pada rentang tanggal tersebut' });
    }

    let doctorNoteFile = null;
    let doctorNotePath = null;
    if (req.file) {
      savedFile = await saveDoctorNote(workerId, req.file);
      doctorNoteFile = savedFile.file;
      doctorNotePath = savedFile.path;
    }

    const [result] = await cleanoxPool.query(
      `INSERT INTO tr_worker_leaves
         (worker_id, leave_type, duration_type, start_date, end_date, reason,
          doctor_note_file, doctor_note_path, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pengajuan')`,
      [
        workerId,
        leave_type,
        duration_type,
        start_date,
        end_date,
        String(reason).trim(),
        doctorNoteFile,
        doctorNotePath,
      ]
    );

    const [[inserted]] = await cleanoxPool.query(
      'SELECT * FROM tr_worker_leaves WHERE id = ?',
      [result.insertId]
    );

    return res.status(201).json({
      message: 'Pengajuan izin berhasil dikirim',
      leave: serializeLeave(inserted),
    });
  } catch (error) {
    if (savedFile?.file) deleteDoctorFile(savedFile.file);
    console.error('[mobileLeave] submitLeave', error);
    return res.status(500).json({ message: 'Gagal mengirim pengajuan izin' });
  }
};

export const updateLeave = async (req, res) => {
  const workerId = req.user?.id;
  const id = Number(req.params.id);
  const { leave_type, duration_type, start_date, end_date, reason } = req.body;
  let savedFile = null;

  try {
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID tidak valid' });
    }

    const [[existing]] = await cleanoxPool.query(
      'SELECT * FROM tr_worker_leaves WHERE id = ? AND worker_id = ?',
      [id, workerId]
    );
    if (!existing) {
      return res.status(404).json({ message: 'Pengajuan tidak ditemukan' });
    }
    if (existing.status !== 'pengajuan') {
      return res.status(403).json({ message: 'Pengajuan yang sudah diproses tidak dapat diubah' });
    }

    const newLeaveType = leave_type || existing.leave_type;
    const newDurationType = duration_type || existing.duration_type;
    const newStartDate = start_date || toDateOnly(existing.start_date);
    const newEndDate = end_date || toDateOnly(existing.end_date);
    const newReason = reason ? String(reason).trim() : existing.reason;

    if (!ALLOWED_LEAVE_TYPES.has(newLeaveType)) {
      return res.status(422).json({ message: 'leave_type tidak valid' });
    }
    if (!ALLOWED_DURATION_TYPES.has(newDurationType)) {
      return res.status(422).json({ message: 'duration_type tidak valid' });
    }
    if (newStartDate > newEndDate) {
      return res.status(422).json({ message: 'end_date tidak boleh sebelum start_date' });
    }
    if (!newReason || newReason.length < 5) {
      return res.status(422).json({ message: 'Keterangan wajib diisi minimal 5 karakter' });
    }
    if (newDurationType !== 'full_day' && newStartDate !== newEndDate) {
      return res.status(422).json({ message: 'Izin setengah hari hanya berlaku untuk 1 hari' });
    }
    if (newLeaveType === 'sakit' && !req.file && !existing.doctor_note_path) {
      return res.status(422).json({ message: 'Foto surat dokter wajib dilampirkan untuk izin sakit' });
    }

    const [overlap] = await cleanoxPool.query(
      `SELECT id FROM tr_worker_leaves
       WHERE worker_id = ? AND id <> ?
         AND status IN ('pengajuan', 'disetujui')
         AND start_date <= ? AND end_date >= ?`,
      [workerId, id, newEndDate, newStartDate]
    );
    if (overlap.length > 0) {
      return res.status(409).json({ message: 'Terdapat pengajuan izin aktif lain pada rentang tanggal tersebut' });
    }

    let newDoctorNoteFile = existing.doctor_note_file;
    let newDoctorNotePath = existing.doctor_note_path;

    if (req.file) {
      savedFile = await saveDoctorNote(workerId, req.file);
      if (existing.doctor_note_file) deleteDoctorFile(existing.doctor_note_file);
      newDoctorNoteFile = savedFile.file;
      newDoctorNotePath = savedFile.path;
    } else if (newLeaveType !== 'sakit') {
      if (existing.doctor_note_file) deleteDoctorFile(existing.doctor_note_file);
      newDoctorNoteFile = null;
      newDoctorNotePath = null;
    }

    await cleanoxPool.query(
      `UPDATE tr_worker_leaves
       SET leave_type = ?, duration_type = ?, start_date = ?, end_date = ?,
           reason = ?, doctor_note_file = ?, doctor_note_path = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        newLeaveType,
        newDurationType,
        newStartDate,
        newEndDate,
        newReason,
        newDoctorNoteFile,
        newDoctorNotePath,
        id,
      ]
    );

    const [[updated]] = await cleanoxPool.query('SELECT * FROM tr_worker_leaves WHERE id = ?', [id]);
    return res.json({
      message: 'Pengajuan berhasil diperbarui',
      leave: serializeLeave(updated),
    });
  } catch (error) {
    if (savedFile?.file) deleteDoctorFile(savedFile.file);
    console.error('[mobileLeave] updateLeave', error);
    return res.status(500).json({ message: 'Gagal memperbarui pengajuan' });
  }
};

export const cancelLeave = async (req, res) => {
  const workerId = req.user?.id;
  const id = Number(req.params.id);

  try {
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID tidak valid' });
    }

    const [[existing]] = await cleanoxPool.query(
      'SELECT * FROM tr_worker_leaves WHERE id = ? AND worker_id = ?',
      [id, workerId]
    );
    if (!existing) {
      return res.status(404).json({ message: 'Pengajuan tidak ditemukan' });
    }
    if (existing.status !== 'pengajuan') {
      return res.status(403).json({ message: 'Hanya pengajuan dengan status "pengajuan" yang dapat dibatalkan' });
    }

    if (existing.doctor_note_file) deleteDoctorFile(existing.doctor_note_file);
    await cleanoxPool.query('DELETE FROM tr_worker_leaves WHERE id = ?', [id]);
    return res.json({ message: 'Pengajuan berhasil dibatalkan' });
  } catch (error) {
    console.error('[mobileLeave] cancelLeave', error);
    return res.status(500).json({ message: 'Gagal membatalkan pengajuan' });
  }
};
