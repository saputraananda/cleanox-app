import api from '@shared/utils/api.js';

const EARLY_TASK_MAX_MINUTE = 9 * 60; // strict < 09:00 WIB

function parseServiceDate(serviceDate) {
  if (!serviceDate) return null;
  const raw = String(serviceDate);
  const date = new Date(raw.includes('T') || raw.includes(' ') ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function isServiceDateTodayJakarta(serviceDate) {
  const date = parseServiceDate(serviceDate);
  if (!date) return false;
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const dateKey = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  return dateKey === todayKey;
}

export function isEarlyMorningServiceDate(serviceDate) {
  const date = parseServiceDate(serviceDate);
  if (!date || !isServiceDateTodayJakarta(serviceDate)) return false;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return hour * 60 + minute < EARLY_TASK_MAX_MINUTE;
}

export function hasEarlyInScheduleTask(tasks = []) {
  return (Array.isArray(tasks) ? tasks : []).some((task) => {
    if (task?.assignment_status !== 'In_Schedule') return false;
    return isEarlyMorningServiceDate(task?.transaction?.service_date);
  });
}

/**
 * Unlock Task menu and task routes for the current workday.
 * Light path (absensi + grooming): In_Schedule today with time < 09:00 WIB.
 * Full path (+ kebersihan pagi): otherwise (including no tasks).
 */
export function computeMorningWorkUnlock({
  attendancePayload,
  kebersihanPagiPayload,
  tasks = [],
} = {}) {
  const checkInDone = Boolean(attendancePayload?.attendance?.check_in_at);
  const groomingDone = Boolean(attendancePayload?.grooming_complete);
  const kebersihanPagiDone = kebersihanPagiPayload?.status === 'Completed';
  const earlyInSchedule = hasEarlyInScheduleTask(tasks);
  const requireKebersihan = !earlyInSchedule;

  const missingLabels = [];
  if (!checkInDone) missingLabels.push('Absensi (check-in)');
  if (!groomingDone) missingLabels.push('Foto grooming');
  if (requireKebersihan && !kebersihanPagiDone) missingLabels.push('Kebersihan pagi');

  const unlocked = requireKebersihan
    ? checkInDone && groomingDone && kebersihanPagiDone
    : checkInDone && groomingDone;

  return {
    unlocked,
    checkInDone,
    groomingDone,
    kebersihanPagiDone,
    hasEarlyInScheduleTask: earlyInSchedule,
    requireKebersihan,
    missingLabels,
  };
}

/** Fetch attendance, kebersihan pagi, and tasks; compute Task-only morning unlock. */
export async function fetchMorningWorkUnlock(client = api) {
  const [attendanceSettled, kebersihanPagiSettled, tasksSettled] = await Promise.allSettled([
    client.get('/mobile-attendance/today-status'),
    client.get('/mobile-kebersihan/today-status?session=pagi'),
    client.get('/mobile-tasks', { params: { status: 'In_Schedule', on_date: 'today' } }),
  ]);

  const attendancePayload =
    attendanceSettled.status === 'fulfilled' ? attendanceSettled.value.data : null;
  const kebersihanPagiPayload =
    kebersihanPagiSettled.status === 'fulfilled' ? kebersihanPagiSettled.value.data : null;
  const tasks =
    tasksSettled.status === 'fulfilled' ? tasksSettled.value.data?.tasks || [] : [];

  return computeMorningWorkUnlock({ attendancePayload, kebersihanPagiPayload, tasks });
}

export function isMobileTasksPath(to) {
  return String(to || '').startsWith('/mobile-worker/tasks');
}
