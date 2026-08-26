import cleanoxPool from '../../shared/db/cleanox.js';

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
