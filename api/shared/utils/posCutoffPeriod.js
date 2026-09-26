/** Jakarta (UTC+7) — mirror posDashboard.controller.js / DashboardCleanox */

export function getJakartaDate() {
  const now = new Date();
  const jktOffset = 7 * 60;
  return new Date(now.getTime() + (jktOffset + now.getTimezoneOffset()) * 60 * 1000);
}

export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Periode bulan X = 26 (X-1) s/d 25 X (sama SuperApp) */
export function cutoffStart(year, month) {
  const y = Number(year);
  const m = Number(month);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}-26`;
}

export function cutoffEnd(year, month) {
  const y = Number(year);
  const m = Number(month);
  return `${y}-${String(m).padStart(2, '0')}-25`;
}

export function getActiveCutoffPeriod(jkt = getJakartaDate()) {
  const day = jkt.getDate();
  const month = jkt.getMonth() + 1;
  const year = jkt.getFullYear();
  if (day >= 26) {
    if (month === 12) return { yr: year + 1, mo: 1 };
    return { yr: year, mo: month + 1 };
  }
  return { yr: year, mo: month };
}

/**
 * Resolve cutoff period for filter_type bulan | tahun.
 * Mirrors resolvePeriod in posDashboard.controller.js (without rentang).
 */
export function resolveCutoffPeriod(filterType, { year, month }) {
  if (filterType === 'tahun' && year) {
    const y = Number(year);
    if (!y) {
      throw new Error('Periode tahun tidak valid');
    }
    const todayJkt = formatDate(getJakartaDate());
    const yearEnd = `${y}-12-25`;
    return {
      date_start: `${y - 1}-12-26`,
      date_end: todayJkt < yearEnd ? todayJkt : yearEnd,
      year: y,
      month: null,
    };
  }

  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) {
    throw new Error('Periode bulan tidak valid');
  }
  return {
    date_start: cutoffStart(y, m),
    date_end: cutoffEnd(y, m),
    year: y,
    month: m,
  };
}
