import cleanoxPool from '../../shared/db/cleanox.js';

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

export async function isWorkerOffDay(workerId, date = todayDateString()) {
  const id = Number(workerId);
  const offDate = toDateOnly(date);
  if (!Number.isInteger(id) || id <= 0 || !offDate) return false;

  const [rows] = await cleanoxPool.query(
    `SELECT id FROM tr_worker_off_days WHERE worker_id = ? AND off_date = ? LIMIT 1`,
    [id, offDate]
  );
  return rows.length > 0;
}

export const getTodayOffDay = async (req, res) => {
  const workerId = req.user?.id;
  const today = todayDateString();

  try {
    const [rows] = await cleanoxPool.query(
      `SELECT id, worker_id, off_date, note, created_by_name, created_at
       FROM tr_worker_off_days
       WHERE worker_id = ? AND off_date = ?
       LIMIT 1`,
      [workerId, today]
    );

    const row = rows[0] || null;
    return res.json({
      off_day: row
        ? {
            ...row,
            off_date: toDateOnly(row.off_date),
            status: 'off',
          }
        : null,
    });
  } catch (error) {
    console.error('[mobileOffDay] getTodayOffDay', error);
    return res.status(500).json({ message: 'Gagal mengambil status libur hari ini' });
  }
};
