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
 * @returns {number|null}
 * @throws {Error} when meter service but meter invalid
 */
export function resolveMeterValue({ serviceName, meter }) {
  if (!isMeterPricedService(serviceName)) {
    return null;
  }

  const value = Number(meter);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Ukuran meter wajib diisi untuk service ${String(serviceName || '').trim()}`);
  }

  return value;
}

export function getBillableMultiplier({ serviceName, qty, meter }) {
  const safeQty = Math.max(1, Number(qty || 1));
  if (!isMeterPricedService(serviceName)) {
    return safeQty;
  }

  const meterValue = resolveMeterValue({ serviceName, meter });
  return safeQty * meterValue;
}
