export const AGENDA_KINDS = new Set(['special_collaboration', 'other']);
export const OTHER_TYPES = new Set([
  'meeting',
  'training_teknisi',
  'event_pameran_bazaar',
  'survey_site_visit',
  'lainnya',
]);
export const CONTENT_TYPES = new Set(['item_service', 'description']);
export const AGENDA_STATUSES = new Set(['draft', 'scheduled', 'completed', 'cancelled']);
export const AGENDA_WORKER_STATUSES = new Set([
  'Assigned',
  'In_Schedule',
  'On_Progress',
  'Done',
  'Cancelled',
]);

const DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function toDateKey(value) {
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

export function toTimeHm(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function todayDateKeyJakarta() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function weekdayNameId(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  // Use UTC day for date-only keys stored as calendar dates
  return DAY_NAMES_ID[date.getUTCDay()];
}

export function buildDayLabel(startDate, endDate) {
  const startKey = toDateKey(startDate);
  const endKey = toDateKey(endDate) || startKey;
  if (!startKey) return '';
  const startName = weekdayNameId(startKey);
  if (!endKey || endKey === startKey) return startName;
  const endName = weekdayNameId(endKey);
  return `${startName}–${endName}`;
}

export function addDaysToDateKey(dateKey, days) {
  const key = toDateKey(dateKey);
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function eachDateKeyInclusive(startDate, endDate) {
  const startKey = toDateKey(startDate);
  const endKey = toDateKey(endDate) || startKey;
  if (!startKey || !endKey) return [];
  const keys = [];
  let cursor = startKey;
  let guard = 0;
  while (cursor <= endKey && guard < 366) {
    keys.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
    guard += 1;
  }
  return keys;
}

export function validateAgendaType({ agenda_kind, other_type, other_type_label }) {
  const kind = String(agenda_kind || '').trim();
  if (!AGENDA_KINDS.has(kind)) {
    return { ok: false, message: 'Jenis agenda tidak valid' };
  }
  if (kind === 'special_collaboration') {
    return {
      ok: true,
      agenda_kind: kind,
      other_type: null,
      other_type_label: null,
    };
  }
  const otherType = String(other_type || '').trim();
  if (!OTHER_TYPES.has(otherType)) {
    return { ok: false, message: 'Tipe agenda lain wajib dipilih' };
  }
  if (otherType === 'lainnya') {
    const label = String(other_type_label || '').trim();
    if (!label) {
      return { ok: false, message: 'Isian manual Lainnya wajib diisi' };
    }
    return {
      ok: true,
      agenda_kind: kind,
      other_type: otherType,
      other_type_label: label.slice(0, 150),
    };
  }
  return {
    ok: true,
    agenda_kind: kind,
    other_type: otherType,
    other_type_label: null,
  };
}

export function validateAgendaSchedule({ start_date, end_date, agenda_time }) {
  const startKey = toDateKey(start_date);
  const endKey = toDateKey(end_date);
  if (!startKey || !endKey) {
    return { ok: false, message: 'Tanggal agenda wajib diisi (YYYY-MM-DD)' };
  }
  if (endKey < startKey) {
    return { ok: false, message: 'Tanggal selesai tidak boleh sebelum tanggal mulai' };
  }
  const spanDays = eachDateKeyInclusive(startKey, endKey).length;
  if (spanDays > 14) {
    return { ok: false, message: 'Rentang agenda maksimal 14 hari' };
  }
  const isSingleDay = startKey === endKey;
  if (isSingleDay) {
    const timeHm = toTimeHm(agenda_time);
    if (!timeHm) {
      return { ok: false, message: 'Jam wajib diisi untuk agenda satu hari (HH:mm)' };
    }
    return {
      ok: true,
      start_date: startKey,
      end_date: endKey,
      agenda_time: `${timeHm}:00`,
      day_label: buildDayLabel(startKey, endKey),
      is_single_day: true,
    };
  }
  return {
    ok: true,
    start_date: startKey,
    end_date: endKey,
    agenda_time: null,
    day_label: buildDayLabel(startKey, endKey),
    is_single_day: false,
  };
}

export function formatAgendaTime(value) {
  const hm = toTimeHm(value);
  return hm;
}

export async function resolveAgendaCompletion(connection, agendaId) {
  const [[agenda]] = await connection.query(
    `SELECT id, status, content_type, end_date
     FROM tr_agendas
     WHERE id = ?
     LIMIT 1`,
    [agendaId]
  );
  if (!agenda) return null;
  if (String(agenda.status) !== 'scheduled') {
    return String(agenda.status);
  }

  let shouldComplete = false;
  if (String(agenda.content_type) === 'description') {
    const [[photoCount]] = await connection.query(
      `SELECT COUNT(*) AS total FROM tr_agenda_activity_photos WHERE agenda_id = ?`,
      [agendaId]
    );
    const endKey = toDateKey(agenda.end_date);
    const threshold = addDaysToDateKey(endKey, 1);
    const today = todayDateKeyJakarta();
    shouldComplete = Number(photoCount?.total || 0) >= 1 && threshold && today > threshold;
  } else if (String(agenda.content_type) === 'item_service') {
    const [items] = await connection.query(
      `SELECT id FROM tr_agenda_items WHERE agenda_id = ? ORDER BY sort_order ASC, id ASC`,
      [agendaId]
    );
    if ((items || []).length === 0) {
      shouldComplete = false;
    } else {
      let allOk = true;
      for (const item of items) {
        const [[counts]] = await connection.query(
          `SELECT
             SUM(CASE WHEN kind = 'before' THEN 1 ELSE 0 END) AS before_count,
             SUM(CASE WHEN kind = 'after' THEN 1 ELSE 0 END) AS after_count
           FROM tr_agenda_evidence_photos
           WHERE agenda_item_id = ?`,
          [item.id]
        );
        if (Number(counts?.before_count || 0) < 1 || Number(counts?.after_count || 0) < 1) {
          allOk = false;
          break;
        }
      }
      shouldComplete = allOk;
    }
  }

  if (shouldComplete) {
    await connection.query(
      `UPDATE tr_agendas SET status = 'completed', updated_at = NOW() WHERE id = ? AND status = 'scheduled'`,
      [agendaId]
    );
    return 'completed';
  }
  return 'scheduled';
}

export function mapAgendaListRow(row) {
  return {
    id: Number(row.id),
    agenda_kind: row.agenda_kind,
    other_type: row.other_type || null,
    other_type_label: row.other_type_label || null,
    name: row.name,
    location: row.location,
    start_date: toDateKey(row.start_date),
    end_date: toDateKey(row.end_date),
    agenda_time: formatAgendaTime(row.agenda_time),
    day_label: row.day_label,
    content_type: row.content_type,
    status: row.status,
    worker_count: Number(row.worker_count || 0),
    item_count: Number(row.item_count || 0),
    created_at: row.created_at || null,
  };
}
