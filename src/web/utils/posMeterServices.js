export function normalizeSatuanName(value) {
  return String(value || '').trim().toLowerCase();
}

/** True jika satuan = Meter (dan alias umum). */
export function isMeterSatuan(satuanName) {
  const s = normalizeSatuanName(satuanName);
  return s === 'meter' || s === 'm' || s === 'm2' || s === 'm²';
}

/**
 * Deteksi layanan berharga per meter berdasarkan satuan (bukan nama service).
 * @param {{ satuanName?: string|null, unitLabel?: string|null }} [args]
 */
export function isMeterPricedService({ satuanName = null, unitLabel = null } = {}) {
  return isMeterSatuan(satuanName) || isMeterSatuan(unitLabel);
}

/**
 * Soft resolve for create/list — returns null when meter missing (deferred pricing).
 * @returns {number|null}
 */
export function resolveMeterValue({ satuanName = null, unitLabel = null, meter } = {}) {
  if (!isMeterPricedService({ satuanName, unitLabel })) {
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
export function resolveMeterFromDimensions({
  satuanName = null,
  unitLabel = null,
  length,
  width,
} = {}) {
  if (!isMeterPricedService({ satuanName, unitLabel })) {
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

export function isMeterPricingPending({ satuanName = null, unitLabel = null, meter } = {}) {
  if (!isMeterPricedService({ satuanName, unitLabel })) return false;
  const value = Number(meter);
  return meter == null || meter === '' || !Number.isFinite(value) || value <= 0;
}

export function transactionHasMeterPending(items = []) {
  return (items || []).some((item) =>
    isMeterPricingPending({
      satuanName: item?.satuan_name,
      unitLabel: item?.unit_label,
      meter: item?.meter,
    })
  );
}

/**
 * Billable multiplier. Meter service without size → 0 (pending).
 */
export function getBillableMultiplier({
  satuanName = null,
  unitLabel = null,
  qty,
  meter,
} = {}) {
  const safeQty = Math.max(1, Number(qty || 1));
  if (!isMeterPricedService({ satuanName, unitLabel })) {
    return safeQty;
  }

  const meterValue = resolveMeterValue({ satuanName, unitLabel, meter });
  if (meterValue == null) {
    return 0;
  }

  return safeQty * meterValue;
}
