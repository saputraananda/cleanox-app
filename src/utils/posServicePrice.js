export function resolveEffectiveBasePrice({ price, coret_price } = {}) {
  const coret = coret_price == null || coret_price === '' ? null : Number(coret_price);
  if (coret != null && Number.isFinite(coret)) {
    return coret;
  }
  return Number(price || 0);
}
