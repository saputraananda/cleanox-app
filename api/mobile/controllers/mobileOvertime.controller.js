import cleanoxPool from '../../shared/db/cleanox.js';

const OVERTIME_THRESHOLD_HOUR = 18;
const OVERTIME_START_HOUR = 17;

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
  const p = jakartaNowParts(date);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
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

function pad2(n) {
  return String(n).padStart(2, '0');
}

function buildCheckoutOvertimeStart(overtimeDate) {
  const dateStr = toDateOnly(overtimeDate);
  return `${dateStr} ${pad2(OVERTIME_START_HOUR)}:00:00`;
}

function parseJakartaDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value).trim();
  // MySQL DATETIME without TZ — treat as WIB
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    return new Date(
      Date.UTC(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4]) - 7,
        Number(m[5]),
        Number(m[6])
      )
    );
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isAfterOvertimeThreshold(dateTime) {
  const d = parseJakartaDateTime(dateTime);
  if (!d) return false;
  const p = jakartaNowParts(d);
  // Re-parse as WIB wall: if we got absolute Date, jakartaNowParts converts correctly
  // For check_out_at from MySQL as Date object in node mysql2, it's often local or UTC depending on config.
  // Prefer extracting HH:mm from string representation when available.
  if (typeof dateTime === 'string') {
    const m = dateTime.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (m) {
      const hour = Number(m[1]);
      const min = Number(m[2]);
      const sec = Number(m[3]);
      if (hour > OVERTIME_THRESHOLD_HOUR) return true;
      if (hour === OVERTIME_THRESHOLD_HOUR && (min > 0 || sec > 0)) return true;
      return false;
    }
  }
  if (p.h > OVERTIME_THRESHOLD_HOUR) return true;
  if (p.h === OVERTIME_THRESHOLD_HOUR && (p.min > 0 || p.s > 0)) return true;
  return false;
}

function isDuplicateKeyError(error) {
  return Number(error?.errno) === 1062 || String(error?.code || '') === 'ER_DUP_ENTRY';
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

export const getTodayOvertimeStatus = async (req, res) => {
  const workerId = req.user?.id;
  const today = todayDateString();
  const connection = await cleanoxPool.getConnection();
  try {
    const [attendance, overtime] = await Promise.all([
      getTodayAttendance(connection, workerId, today),
      getTodayOvertime(connection, workerId, today),
    ]);

    const hasCheckout = Boolean(attendance?.check_out_at);
    const checkoutAfterThreshold = hasCheckout && isAfterOvertimeThreshold(attendance.check_out_at);

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
      can_pengajuan: hasCheckout && !overtime,
      can_retry_from_checkout: checkoutAfterThreshold && !overtime,
      can_checkout_confirm: false,
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

export const createFromCheckout = async (req, res) => {
  const workerId = req.user?.id;
  const today = todayDateString();
  const description = String(req.body?.description || '').trim();
  const attendanceIdHint = req.body?.attendance_id != null ? Number(req.body.attendance_id) : null;

  if (!description) {
    return res.status(400).json({ message: 'Deskripsi lembur wajib diisi' });
  }
  if (description.length > 1000) {
    return res.status(400).json({ message: 'Deskripsi maksimal 1000 karakter' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    const attendance = await getTodayAttendance(connection, workerId, today);
    if (!attendance?.check_out_at) {
      return res.status(400).json({ message: 'Check-out hari ini belum ditemukan' });
    }
    if (!isAfterOvertimeThreshold(attendance.check_out_at)) {
      return res.status(400).json({
        message: 'Lembur checkout hanya untuk check-out setelah pukul 18:00 WIB',
      });
    }

    const existing = await getTodayOvertime(connection, workerId, today);
    if (existing) {
      return res.status(409).json({ message: 'Lembur hari ini sudah tercatat' });
    }

    const startAt = buildCheckoutOvertimeStart(today);
    const attendanceId =
      Number.isInteger(attendanceIdHint) && attendanceIdHint > 0
        ? attendanceIdHint
        : attendance.id;

    // end_at: use MySQL check_out_at value as stored
    const [result] = await connection.query(
      `INSERT INTO tr_worker_overtime
        (worker_id, overtime_date, type, start_at, end_at, description, status, attendance_id, created_at, updated_at)
       VALUES (?, ?, 'checkout', ?, ?, ?, 'selesai', ?, NOW(), NOW())`,
      [workerId, today, startAt, attendance.check_out_at, description, attendanceId]
    );

    const [rows] = await connection.query(`SELECT * FROM tr_worker_overtime WHERE id = ? LIMIT 1`, [
      result.insertId,
    ]);

    return res.status(201).json({
      message: 'Lembur checkout berhasil dicatat',
      overtime: serializeOvertime(rows?.[0]),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({ message: 'Lembur hari ini sudah tercatat' });
    }
    console.error('[mobileOvertime/fromCheckout]', error.message);
    return res.status(500).json({ message: 'Gagal mencatat lembur checkout' });
  } finally {
    connection.release();
  }
};

export const createPengajuan = async (req, res) => {
  const workerId = req.user?.id;
  const today = todayDateString();
  const description = String(req.body?.description || '').trim();

  if (!description) {
    return res.status(400).json({ message: 'Deskripsi lembur wajib diisi' });
  }
  if (description.length > 1000) {
    return res.status(400).json({ message: 'Deskripsi maksimal 1000 karakter' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    const attendance = await getTodayAttendance(connection, workerId, today);
    if (!attendance?.check_out_at) {
      return res.status(400).json({ message: 'Pengajuan lembur hanya setelah check-out hari ini' });
    }

    const existing = await getTodayOvertime(connection, workerId, today);
    if (existing) {
      return res.status(409).json({ message: 'Lembur hari ini sudah tercatat' });
    }

    const [result] = await connection.query(
      `INSERT INTO tr_worker_overtime
        (worker_id, overtime_date, type, start_at, end_at, description, status, attendance_id, created_at, updated_at)
       VALUES (?, ?, 'pengajuan', NOW(), NULL, ?, 'aktif', ?, NOW(), NOW())`,
      [workerId, today, description, attendance.id]
    );

    const [rows] = await connection.query(`SELECT * FROM tr_worker_overtime WHERE id = ? LIMIT 1`, [
      result.insertId,
    ]);

    return res.status(201).json({
      message: 'Pengajuan lembur dimulai',
      overtime: serializeOvertime(rows?.[0]),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({ message: 'Lembur hari ini sudah tercatat' });
    }
    console.error('[mobileOvertime/pengajuan]', error.message);
    return res.status(500).json({ message: 'Gagal mengajukan lembur' });
  } finally {
    connection.release();
  }
};

export const selesaiOvertime = async (req, res) => {
  const workerId = req.user?.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'ID lembur tidak valid' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    const [rows] = await connection.query(
      `SELECT * FROM tr_worker_overtime WHERE id = ? AND worker_id = ? LIMIT 1`,
      [id, workerId]
    );
    const row = rows?.[0];
    if (!row) {
      return res.status(404).json({ message: 'Data lembur tidak ditemukan' });
    }
    if (row.type !== 'pengajuan') {
      return res.status(400).json({ message: 'Hanya lembur pengajuan yang bisa diselesaikan' });
    }
    if (row.status !== 'aktif') {
      return res.status(400).json({ message: 'Lembur ini sudah selesai' });
    }

    const [result] = await connection.query(
      `UPDATE tr_worker_overtime
       SET end_at = NOW(), status = 'selesai', updated_at = NOW()
       WHERE id = ? AND worker_id = ? AND status = 'aktif' AND type = 'pengajuan'
         AND start_at < NOW()`,
      [id, workerId]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ message: 'Gagal menyelesaikan lembur (waktu tidak valid)' });
    }

    const [updated] = await connection.query(
      `SELECT * FROM tr_worker_overtime WHERE id = ? LIMIT 1`,
      [id]
    );

    return res.json({
      message: 'Lembur selesai dicatat',
      overtime: serializeOvertime(updated?.[0]),
    });
  } catch (error) {
    console.error('[mobileOvertime/selesai]', error.message);
    return res.status(500).json({ message: 'Gagal menyelesaikan lembur' });
  } finally {
    connection.release();
  }
};
