/**
 * Derive payment method groups from API rows (mst_payment_method), preserving API order.
 * @param {Array<{ method_group?: string }>} paymentMethods
 * @returns {string[]}
 */
export function getPaymentMethodGroups(paymentMethods = []) {
  const seen = new Set();
  const groups = [];
  for (const row of paymentMethods) {
    const group = String(row?.method_group || '').trim();
    if (!group || seen.has(group)) continue;
    seen.add(group);
    groups.push(group);
  }
  return groups;
}

export function getMethodsInGroup(paymentMethods = [], group) {
  const g = String(group || '');
  return paymentMethods.filter((m) => String(m.method_group || '') === g);
}

/** Groups with more than one active method need a sub-select (e.g. EDC). */
export function groupNeedsMethodSelect(paymentMethods = [], group) {
  return getMethodsInGroup(paymentMethods, group).length > 1;
}
