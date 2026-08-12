const BUSY_STATUSES = ['Assigned', 'In_Schedule', 'On_Progress'];

/**
 * Normalize service date to YYYY-MM-DD.
 * Prefer leading YYYY-MM-DD from string (avoids TZ shift on datetime-local).
 */
export function formatServiceDateKey(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

/**
 * Normalize service datetime to YYYY-MM-DD HH:mm (minute precision).
 */
export function formatServiceDateTimeKey(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (match) return `${match[1]} ${match[2]}:${match[3]}`;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    const hh = String(value.getHours()).padStart(2, '0');
    const mm = String(value.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}`;
  }

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}`;
  }

  return null;
}

/** Today's date YYYY-MM-DD in Asia/Jakarta. */
export function todayDateStringJakarta() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const jakarta = new Date(utc + 7 * 60 * 60000);
  return jakarta.toISOString().slice(0, 10);
}

/** Add days to YYYY-MM-DD key; returns YYYY-MM-DD. */
export function addDaysToDateKey(dateKey, days) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

/**
 * Busy workers at the same service datetime (minute precision).
 * @param {string|Date} serviceDateTime - full service datetime (not date-only)
 */
export async function getBusyWorkerDetails(connection, serviceDateTime, { excludeTransactionId = null } = {}) {
  const map = new Map();
  const dateTimeKey = formatServiceDateTimeKey(serviceDateTime);
  if (!dateTimeKey) return map;

  const params = [dateTimeKey];
  let sql = `
    SELECT
      a.employee_id,
      a.assignment_status,
      t.transaction_no,
      t.customer_name,
      t.service_date
    FROM tr_worker_assignments a
    INNER JOIN tr_transactions t ON t.id = a.transaction_id
    WHERE DATE_FORMAT(t.service_date, '%Y-%m-%d %H:%i') = ?
      AND a.assignment_status IN ('Assigned', 'In_Schedule', 'On_Progress')
  `;

  if (excludeTransactionId) {
    sql += ' AND t.id <> ?';
    params.push(excludeTransactionId);
  }

  sql += ' ORDER BY a.id DESC';

  const [rows] = await connection.query(sql, params);
  for (const row of rows) {
    const id = Number(row.employee_id);
    if (!map.has(id)) {
      map.set(id, {
        employee_id: id,
        assignment_status: row.assignment_status,
        transaction_no: row.transaction_no,
        customer_name: row.customer_name,
        service_date: row.service_date,
      });
    }
  }
  return map;
}

/**
 * @param {string|Date} serviceDateTime - full service datetime (minute precision match)
 */
export async function getBusyEmployeeIdsOnServiceDate(
  connection,
  serviceDateTime,
  { excludeTransactionId = null } = {}
) {
  const details = await getBusyWorkerDetails(connection, serviceDateTime, { excludeTransactionId });
  return new Set(details.keys());
}

export function buildBusyReason(detail) {
  if (!detail) return null;
  const timeKey = formatServiceDateTimeKey(detail.service_date);
  const parts = [
    detail.assignment_status,
    detail.transaction_no,
    detail.customer_name,
    timeKey,
  ].filter(Boolean);
  return parts.join(' • ');
}

export { BUSY_STATUSES };
