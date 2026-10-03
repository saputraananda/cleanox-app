export const WORK_START_TIME = '08:00';
export const WORK_START_MINUTE = 8 * 60;
export const LATE_REASON_MAX_LENGTH = 500;
export const OVERTIME_REDIRECT_TIME = '18:00';
export const OVERTIME_REDIRECT_MINUTE = 18 * 60;

const jakartaTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function jakartaMinuteOfDay(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return null;
  const parts = jakartaTimeFormatter.formatToParts(value);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

export function isLateAt(date) {
  const minute = jakartaMinuteOfDay(date);
  return minute !== null && minute > WORK_START_MINUTE;
}

export function isOvertimeCheckOutAt(date) {
  const minute = jakartaMinuteOfDay(date);
  return minute !== null && minute >= OVERTIME_REDIRECT_MINUTE;
}
