import cleanoxPool from '../../shared/db/cleanox.js';

const ALLOWED_TYPES = new Set(['half_day', 'full_day']);
const OFFICE_AMOUNT = 10000;
const HALF_ADDON = 15000;
const FULL_AMOUNT = 20000;

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
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function amountForType(type) {
  if (type === 'half_day') return OFFICE_AMOUNT + HALF_ADDON;
  if (type === 'full_day') return FULL_AMOUNT;
  return null;
}

function isDuplicateKeyError(error) {
  return Number(error?.errno) === 1062 || String(error?.code || '') === 'ER_DUP_ENTRY';
}

function serializeMeal(row) {
  if (!row) return null;
  return {
    ...row,
    meal_date: toDateOnly(row.meal_date),
    amount: row.amount != null ? Number(row.amount) : null,
  };
}

export const getTodayMeal = async (req, res) => {
  const workerId = req.user?.id;
  const today = todayDateString();
  try {
    const [rows] = await cleanoxPool.query(
      `SELECT * FROM tr_worker_meal WHERE worker_id = ? AND meal_date = ? LIMIT 1`,
      [workerId, today]
    );
    const meal = rows?.[0] || null;
    return res.json({
      meal_date: today,
      meal: serializeMeal(meal),
      can_submit: !meal,
      amounts: {
        office: OFFICE_AMOUNT,
        half_day: OFFICE_AMOUNT + HALF_ADDON,
        full_day: FULL_AMOUNT,
      },
    });
  } catch (error) {
    console.error('[mobileMeal/getToday]', error.message);
    return res.status(500).json({ message: 'Gagal memuat status makan siang' });
  }
};

export const getMySubmissions = async (req, res) => {
  const workerId = req.user?.id;
  const startDate = toDateOnly(req.query.startDate);
  const endDate = toDateOnly(req.query.endDate);

  try {
    const where = ['worker_id = ?'];
    const params = [workerId];
    if (startDate) {
      where.push('meal_date >= ?');
      params.push(startDate);
    }
    if (endDate) {
      where.push('meal_date <= ?');
      params.push(endDate);
    }

    const [rows] = await cleanoxPool.query(
      `SELECT *
       FROM tr_worker_meal
       WHERE ${where.join(' AND ')}
       ORDER BY meal_date DESC, id DESC
       LIMIT 100`,
      params
    );

    return res.json({ items: (rows || []).map(serializeMeal) });
  } catch (error) {
    console.error('[mobileMeal/list]', error.message);
    return res.status(500).json({ message: 'Gagal memuat riwayat makan siang' });
  }
};

export const createMeal = async (req, res) => {
  const workerId = req.user?.id;
  const mealDate = toDateOnly(req.body?.meal_date) || todayDateString();
  const type = String(req.body?.type || '').trim();
  const notes = String(req.body?.notes || '').trim().slice(0, 1000) || null;
  const today = todayDateString();

  if (!ALLOWED_TYPES.has(type)) {
    return res.status(400).json({ message: 'Tipe tidak valid. Gunakan: half_day, full_day' });
  }
  if (mealDate > today) {
    return res.status(400).json({ message: 'Tanggal makan tidak boleh di masa depan' });
  }

  const amount = amountForType(type);

  try {
    const [result] = await cleanoxPool.query(
      `INSERT INTO tr_worker_meal
        (worker_id, meal_date, type, amount, notes, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'menunggu_tf', NOW(), NOW())`,
      [workerId, mealDate, type, amount, notes]
    );

    const [rows] = await cleanoxPool.query(`SELECT * FROM tr_worker_meal WHERE id = ? LIMIT 1`, [
      result.insertId,
    ]);

    return res.status(201).json({
      message: 'Pengajuan makan siang berhasil',
      meal: serializeMeal(rows?.[0]),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({ message: 'Pengajuan makan siang untuk tanggal ini sudah ada' });
    }
    console.error('[mobileMeal/create]', error.message);
    return res.status(500).json({ message: 'Gagal mengajukan makan siang' });
  }
};

export const updateMeal = async (req, res) => {
  const workerId = req.user?.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'ID tidak valid' });
  }

  const today = todayDateString();

  try {
    const [existingRows] = await cleanoxPool.query(
      `SELECT * FROM tr_worker_meal WHERE id = ? AND worker_id = ? LIMIT 1`,
      [id, workerId]
    );
    const existing = existingRows?.[0];
    if (!existing) {
      return res.status(404).json({ message: 'Pengajuan tidak ditemukan' });
    }
    if (existing.status !== 'menunggu_tf') {
      return res.status(400).json({ message: 'Hanya pengajuan menunggu TF yang bisa diubah' });
    }

    const mealDate = toDateOnly(req.body?.meal_date) || toDateOnly(existing.meal_date);
    const type = req.body?.type != null ? String(req.body.type).trim() : existing.type;
    const notes =
      req.body?.notes !== undefined
        ? String(req.body.notes || '').trim().slice(0, 1000) || null
        : existing.notes;

    if (!ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ message: 'Tipe tidak valid. Gunakan: half_day, full_day' });
    }
    if (mealDate > today) {
      return res.status(400).json({ message: 'Tanggal makan tidak boleh di masa depan' });
    }

    const amount = amountForType(type);

    await cleanoxPool.query(
      `UPDATE tr_worker_meal
       SET meal_date = ?, type = ?, amount = ?, notes = ?, updated_at = NOW()
       WHERE id = ? AND worker_id = ? AND status = 'menunggu_tf'`,
      [mealDate, type, amount, notes, id, workerId]
    );

    const [rows] = await cleanoxPool.query(`SELECT * FROM tr_worker_meal WHERE id = ? LIMIT 1`, [id]);
    return res.json({
      message: 'Pengajuan diperbarui',
      meal: serializeMeal(rows?.[0]),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({ message: 'Pengajuan makan siang untuk tanggal ini sudah ada' });
    }
    console.error('[mobileMeal/update]', error.message);
    return res.status(500).json({ message: 'Gagal memperbarui pengajuan' });
  }
};

export const deleteMeal = async (req, res) => {
  const workerId = req.user?.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'ID tidak valid' });
  }

  try {
    const [result] = await cleanoxPool.query(
      `DELETE FROM tr_worker_meal
       WHERE id = ? AND worker_id = ? AND status = 'menunggu_tf'`,
      [id, workerId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Pengajuan tidak ditemukan atau sudah selesai',
      });
    }
    return res.json({ message: 'Pengajuan dihapus' });
  } catch (error) {
    console.error('[mobileMeal/delete]', error.message);
    return res.status(500).json({ message: 'Gagal menghapus pengajuan' });
  }
};
