import cleanoxPool from '../../shared/db/cleanox.js';
import { formatCalendarDateKey } from '../../shared/utils/posWorkerBusy.js';

function jakartaNowParts(date = new Date()) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const jakarta = new Date(utc + 7 * 60 * 60000);
  return {
    y: jakarta.getFullYear(),
    m: jakarta.getMonth() + 1,
    d: jakarta.getDate(),
    h: jakarta.getHours(),
    min: jakarta.getMinutes(),
    s: jakarta.getSeconds(),
    date: jakarta,
  };
}

function todayDateString(date = new Date()) {
  return formatCalendarDateKey(date);
}

function toDateOnly(value) {
  return formatCalendarDateKey(value);
}

function isValidDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isValidTimeHm(value) {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return false;
  const [h, m] = value.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function timeToMinutes(value) {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function addDaysToDateOnly(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function compareDateOnly(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function isDuplicateKeyError(error) {
  return Number(error?.errno) === 1062 || String(error?.code || '') === 'ER_DUP_ENTRY';
}

function canSubmitPengajuan(existing) {
  if (!existing) return true;
  return String(existing.status || '').toLowerCase() === 'ditolak';
}

function serializeOvertime(row) {
  if (!row) return null;
  return {
    ...row,
    overtime_date: toDateOnly(row.overtime_date),
  };
}

async function getTodayAttendance(connection, workerId, today) {
  const [rows] = await connection.query(
    `SELECT id, attendance_date, check_in_at, check_out_at
     FROM tr_worker_attendance
     WHERE worker_id = ? AND attendance_date = ?
     LIMIT 1`,
    [workerId, today]
  );
  return rows?.[0] || null;
}

async function getTodayOvertime(connection, workerId, today) {
  const [rows] = await connection.query(
    `SELECT *
     FROM tr_worker_overtime
     WHERE worker_id = ? AND overtime_date = ?
     LIMIT 1`,
    [workerId, today]
  );
  return rows?.[0] || null;
}

async function getOvertimeByDate(connection, workerId, overtimeDate) {
  const [rows] = await connection.query(
    `SELECT *
     FROM tr_worker_overtime
     WHERE worker_id = ? AND overtime_date = ?
     LIMIT 1`,
    [workerId, overtimeDate]
  );
  return rows?.[0] || null;
}

export const getTodayOvertimeStatus = async (req, res) => {
  const workerId = req.user?.id;
  const today = todayDateString();
  const connection = await cleanoxPool.getConnection();
  try {
    const [attendance, overtime] = await Promise.all([
      getTodayAttendance(connection, workerId, today),
      getTodayOvertime(connection, workerId, today),
    ]);

    return res.json({
      overtime_date: today,
      overtime: serializeOvertime(overtime),
      attendance: attendance
        ? {
            id: attendance.id,
            check_in_at: attendance.check_in_at,
            check_out_at: attendance.check_out_at,
          }
        : null,
      can_pengajuan: canSubmitPengajuan(overtime),
    });
  } catch (error) {
    console.error('[mobileOvertime/getToday]', error.message);
    return res.status(500).json({ message: 'Gagal memuat status lembur' });
  } finally {
    connection.release();
  }
};

export const listMyOvertime = async (req, res) => {
  const workerId = req.user?.id;
  const startDate = toDateOnly(req.query.startDate);
  const endDate = toDateOnly(req.query.endDate);

  const connection = await cleanoxPool.getConnection();
  try {
    const where = ['worker_id = ?'];
    const params = [workerId];
    if (startDate) {
      where.push('overtime_date >= ?');
      params.push(startDate);
    }
    if (endDate) {
      where.push('overtime_date <= ?');
      params.push(endDate);
    }

    const [rows] = await connection.query(
      `SELECT *
       FROM tr_worker_overtime
       WHERE ${where.join(' AND ')}
       ORDER BY overtime_date DESC, id DESC
       LIMIT 100`,
      params
    );

    return res.json({
      items: (rows || []).map(serializeOvertime),
    });
  } catch (error) {
    console.error('[mobileOvertime/list]', error.message);
    return res.status(500).json({ message: 'Gagal memuat riwayat lembur' });
  } finally {
    connection.release();
  }
};

export const createPengajuan = async (req, res) => {
  const workerId = req.user?.id;
  const today = todayDateString();
  const overtimeDate = toDateOnly(req.body?.overtime_date) || today;
  const startTime = String(req.body?.start_time || '').trim();
  const endTime = String(req.body?.end_time || '').trim();
  const description = String(req.body?.description || '').trim();

  if (!isValidDateOnly(overtimeDate)) {
    return res.status(400).json({ message: 'Tanggal lembur tidak valid' });
  }
  if (!isValidTimeHm(startTime) || !isValidTimeHm(endTime)) {
    return res.status(400).json({ message: 'Jam mulai/selesai tidak valid (HH:mm)' });
  }
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    return res.status(400).json({ message: 'Jam selesai harus setelah jam mulai (hari yang sama)' });
  }
  if (!description) {
    return res.status(400).json({ message: 'Deskripsi lembur wajib diisi' });
  }
  if (description.length > 1000) {
    return res.status(400).json({ message: 'Deskripsi maksimal 1000 karakter' });
  }

  const minDate = addDaysToDateOnly(today, -30);
  const maxDate = addDaysToDateOnly(today, 7);
  if (compareDateOnly(overtimeDate, minDate) < 0 || compareDateOnly(overtimeDate, maxDate) > 0) {
    return res.status(400).json({
      message: 'Tanggal lembur hanya boleh antara 30 hari ke belakang sampai 7 hari ke depan',
    });
  }

  const startAt = `${overtimeDate} ${startTime}:00`;
  const endAt = `${overtimeDate} ${endTime}:00`;

  const connection = await cleanoxPool.getConnection();
  try {
    const existing = await getOvertimeByDate(connection, workerId, overtimeDate);
    if (existing && !canSubmitPengajuan(existing)) {
      return res.status(409).json({ message: 'Lembur untuk tanggal tersebut sudah tercatat' });
    }

    if (existing && String(existing.status).toLowerCase() === 'ditolak') {
      await connection.query(
        `UPDATE tr_worker_overtime
         SET type = 'pengajuan',
             start_at = ?,
             end_at = ?,
             description = ?,
             status = 'pengajuan',
             attendance_id = NULL,
             rejection_note = NULL,
             approved_by = NULL,
             approved_by_name = NULL,
             approved_at = NULL,
             updated_at = NOW()
         WHERE id = ? AND worker_id = ?`,
        [startAt, endAt, description, existing.id, workerId]
      );

      const [rows] = await connection.query(`SELECT * FROM tr_worker_overtime WHERE id = ? LIMIT 1`, [
        existing.id,
      ]);

      return res.status(200).json({
        message: 'Pengajuan lembur dikirim ulang',
        overtime: serializeOvertime(rows?.[0]),
      });
    }

    const [result] = await connection.query(
      `INSERT INTO tr_worker_overtime
        (worker_id, overtime_date, type, start_at, end_at, description, status, attendance_id,
         rejection_note, approved_by, approved_by_name, approved_at, created_at, updated_at)
       VALUES (?, ?, 'pengajuan', ?, ?, ?, 'pengajuan', NULL, NULL, NULL, NULL, NULL, NOW(), NOW())`,
      [workerId, overtimeDate, startAt, endAt, description]
    );

    const [rows] = await connection.query(`SELECT * FROM tr_worker_overtime WHERE id = ? LIMIT 1`, [
      result.insertId,
    ]);

    return res.status(201).json({
      message: 'Pengajuan lembur dikirim',
      overtime: serializeOvertime(rows?.[0]),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({ message: 'Lembur untuk tanggal tersebut sudah tercatat' });
    }
    console.error('[mobileOvertime/pengajuan]', error.message);
    return res.status(500).json({ message: 'Gagal mengajukan lembur' });
  } finally {
    connection.release();
  }
};
