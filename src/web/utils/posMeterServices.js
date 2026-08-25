export const METER_PRICED_SERVICE_NAMES = [
  'Carpet',
  'Gordyn',
  'Gordyn & Vitrase (Fast Cleaning)',
  'Gordyn Blind',
  'Gordyn Office',
  'Karpet Sedang',
  'Karpet Tebal',
  'Karpet Tipis',
  'Vitrase',
];

const METER_NAME_SET = new Set(METER_PRICED_SERVICE_NAMES);

export function isMeterPricedService(serviceName) {
  const name = String(serviceName || '').trim();
  return METER_NAME_SET.has(name);
}

/**
 * @returns {number|null} null when not a meter service or meter invalid
 */
export function resolveMeterValue({ serviceName, meter }) {
  if (!isMeterPricedService(serviceName)) {
    return null;
  }

  const value = Number(meter);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

/**
 * Area (m²) from panjang × lebar for meter-priced services.
 * @returns {number|null}
 */
export function resolveMeterFromDimensions({ serviceName, length, width }) {
  if (!isMeterPricedService(serviceName)) {
    return null;
  }

  const l = Number(length);
  const w = Number(width);
  if (!Number.isFinite(l) || !Number.isFinite(w) || l <= 0 || w <= 0) {
    return null;
  }

  return Math.round(l * w * 100) / 100;
}

export function formatMeterDimensionsLabel({ length, width, meter }) {
  const l = Number(length);
  const w = Number(width);
  if (Number.isFinite(l) && Number.isFinite(w) && l > 0 && w > 0) {
    const area = Math.round(l * w * 100) / 100;
    return `${l} × ${w} m (${area} m²)`;
  }

  const m = Number(meter);
  if (Number.isFinite(m) && m > 0) {
    return `${m} m²`;
  }

  return null;
}

export function getBillableMultiplier({ serviceName, qty, meter }) {
  const safeQty = Math.max(1, Number(qty || 1));
  if (!isMeterPricedService(serviceName)) {
    return safeQty;
  }

  const meterValue = resolveMeterValue({ serviceName, meter });
  if (meterValue == null) {
    return safeQty;
  }

  return safeQty * meterValue;
}
