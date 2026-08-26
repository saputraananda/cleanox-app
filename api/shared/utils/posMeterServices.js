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
 * Soft resolve for create/list — returns null when meter missing (deferred pricing).
 * @returns {number|null}
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
 * Strict resolve for update-detail — throws when meter required but invalid.
 * @returns {number}
 */
export function requireMeterValue({ serviceName, meter }) {
  const value = resolveMeterValue({ serviceName, meter });
  if (value == null && isMeterPricedService(serviceName)) {
    throw new Error(`Ukuran meter wajib diisi untuk service ${String(serviceName || '').trim()}`);
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

export function isMeterPricingPending({ serviceName, meter }) {
  if (!isMeterPricedService(serviceName)) return false;
  const value = Number(meter);
  return meter == null || meter === '' || !Number.isFinite(value) || value <= 0;
}

export function transactionHasMeterPending(items = []) {
  return (items || []).some((item) =>
    isMeterPricingPending({
      serviceName: item?.service_name || item?.name,
      meter: item?.meter,
    })
  );
}

/**
 * Billable multiplier. Meter service without size → 0 (pending, no charge yet).
 */
export function getBillableMultiplier({ serviceName, qty, meter }) {
  const safeQty = Math.max(1, Number(qty || 1));
  if (!isMeterPricedService(serviceName)) {
    return safeQty;
  }

  const meterValue = resolveMeterValue({ serviceName, meter });
  if (meterValue == null) {
    return 0;
  }

  return safeQty * meterValue;
}
