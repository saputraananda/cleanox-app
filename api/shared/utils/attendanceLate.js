export const WORK_START_TIME = '08:00';
export const WORK_START_MINUTE = 8 * 60;
export const LATE_REASON_MAX_LENGTH = 500;

const jakartaTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function jakartaMinuteOfDay(value) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'string') {
    const match = value.match(/[ T](\d{2}):(\d{2})/);
    if (match) return Number(match[1]) * 60 + Number(match[2]);
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = jakartaTimeFormatter.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

export function isLateCheckIn(value) {
  const minute = jakartaMinuteOfDay(value);
  return minute !== null && minute > WORK_START_MINUTE;
}

export function normalizeLateReason(raw) {
  return String(raw ?? '').trim().slice(0, LATE_REASON_MAX_LENGTH);
}
