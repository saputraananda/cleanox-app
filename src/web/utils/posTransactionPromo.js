function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

/**
 * Diskon promo sekali per transaksi terhadap subtotal.
 * @returns {{ discountAmount: number }}
 */
export function computeTransactionPromoDiscount({ subtotal, promoType, promoValue } = {}) {
  const base = Math.max(0, Number(subtotal || 0));
  const type = promoType == null ? null : String(promoType).trim();
  const rawValue = Number(promoValue || 0);

  if (!type || !Number.isFinite(rawValue) || rawValue <= 0 || !(base > 0)) {
    return { discountAmount: 0 };
  }

  let discount = 0;
  if (type === 'persen') {
    discount = (base * rawValue) / 100;
  } else if (type === 'nominal') {
    discount = rawValue;
  } else {
    return { discountAmount: 0 };
  }

  return { discountAmount: toMoney(Math.min(base, Math.max(0, discount))) };
}
