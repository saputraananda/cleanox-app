const BUSY_STATUSES = ['Assigned', 'In_Schedule', 'On_Progress'];

/**
 * Normalize a calendar date to YYYY-MM-DD in Asia/Jakarta (avoids mysql2 +07 DATE H−1).
 * - Exact YYYY-MM-DD passthrough
 * - Date / ISO with time or Z/offset → calendar day in Asia/Jakarta
 * - Local datetime string without Z/offset → leading date part
 */
export function formatCalendarDateKey(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const hasTimeOrZone =
    value instanceof Date || /[T\s]\d{2}:\d{2}|Z|[+-]\d{2}:?\d{2}$/.test(raw);
  if (hasTimeOrZone) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  const localMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[ T]\d{2}:\d{2}/);
  if (localMatch) return localMatch[1];

  const leading = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return leading ? leading[1] : null;
}

/**
 * Normalize service date to YYYY-MM-DD without UTC/local off-by-one.
 */
export function formatServiceDateKey(value) {
  return formatCalendarDateKey(value);
}

/**
 * Normalize payment_settled_date to YYYY-MM-DD without UTC off-by-one.
 */
export function formatPaymentSettledDateKey(value) {
  return formatCalendarDateKey(value);
}

/**
 * Normalize service datetime to YYYY-MM-DD HH:mm (minute precision, Asia/Jakarta).
 */
export function formatServiceDateTimeKey(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (match && !/[Z]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    return `${match[1]} ${match[2]}:${match[3]}`;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const dateKey = formatCalendarDateKey(date);
  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hh = timeParts.find((p) => p.type === 'hour')?.value || '00';
  const mm = timeParts.find((p) => p.type === 'minute')?.value || '00';
  return dateKey ? `${dateKey} ${hh}:${mm}` : null;
}

/** Today's date YYYY-MM-DD in Asia/Jakarta. */
export function todayDateStringJakarta() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
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
