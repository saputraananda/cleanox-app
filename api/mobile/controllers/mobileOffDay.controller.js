import cleanoxPool from '../../shared/db/cleanox.js';
import { formatCalendarDateKey } from '../../shared/utils/posWorkerBusy.js';

function todayDateString() {
  return formatCalendarDateKey(new Date());
}

function toDateOnly(value) {
  return formatCalendarDateKey(value);
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
