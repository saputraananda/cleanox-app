export const COLLABORATION_METHOD_GROUP = 'Collaboration';

export const PAYMENT_METHOD_GROUP_ORDER = [
  'Tunai',
  'BCA',
  'EDC',
  'QRIS',
  'Collaboration',
];

/**
 * @param {string|{group?: string, method_group?: string}|null|undefined} rowOrGroup
 */
export function isCollaborationMethod(rowOrGroup) {
  if (rowOrGroup == null) return false;
  if (typeof rowOrGroup === 'string') {
    return rowOrGroup === COLLABORATION_METHOD_GROUP;
  }
  const group = rowOrGroup.method_group ?? rowOrGroup.group ?? null;
  return group === COLLABORATION_METHOD_GROUP;
}

export function paymentMethodGroupFieldSql(columnExpression = '`group`') {
  const placeholders = PAYMENT_METHOD_GROUP_ORDER.map((g) => `'${g}'`).join(', ');
  return `FIELD(${columnExpression}, ${placeholders})`;
}
