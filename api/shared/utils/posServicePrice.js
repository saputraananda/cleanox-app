export function resolveEffectiveBasePrice({ price, coret_price } = {}) {
  const coret = coret_price == null || coret_price === '' ? null : Number(coret_price);
  if (coret != null && Number.isFinite(coret)) {
    return coret;
  }
  return Number(price || 0);
}

export function normalizeCoretPrice(raw) {
  if (raw === '' || raw == null) return { value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return { error: 'Harga coret tidak valid' };
  }
  return { value: Number(n.toFixed(2)) };
}
