export const COLLABORATION_METHOD_GROUP = 'Collaboration';
export const EPAYMENT_METHOD_GROUP = 'E-Payment';

export const PAYMENT_METHOD_GROUP_ORDER = [
  'Tunai',
  'BCA',
  'BSI',
  'EDC',
  'QRIS',
  'E-Payment',
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

/**
 * @param {string|{group?: string, method_group?: string}|null|undefined} rowOrGroup
 */
export function isEpaymentMethod(rowOrGroup) {
  if (rowOrGroup == null) return false;
  if (typeof rowOrGroup === 'string') {
    return rowOrGroup === EPAYMENT_METHOD_GROUP;
  }
  const group = rowOrGroup.method_group ?? rowOrGroup.group ?? null;
  return group === EPAYMENT_METHOD_GROUP;
}

/**
 * Normalize E-Payment split fields for a transaction payment update.
 * @returns {{ epayment_amount: number|null, secondary_payment_method_id: number|null }}
 */
export function normalizeEpaymentSplit({
  primaryMethod,
  epaymentAmountRaw,
  secondaryMethod,
  finalAmount,
}) {
  if (isCollaborationMethod(primaryMethod) || !isEpaymentMethod(primaryMethod)) {
    return { epayment_amount: null, secondary_payment_method_id: null };
  }

  const finalAmt = Number(finalAmount || 0);
  const hasSecondary = Boolean(secondaryMethod);
  const amountProvided =
    epaymentAmountRaw !== undefined &&
    epaymentAmountRaw !== null &&
    String(epaymentAmountRaw).trim() !== '';

  if (!hasSecondary && !amountProvided) {
    return { epayment_amount: null, secondary_payment_method_id: null };
  }

  const epaymentAmount = amountProvided ? Number(epaymentAmountRaw) : null;
  if (amountProvided && (!Number.isFinite(epaymentAmount) || epaymentAmount < 0)) {
    const err = new Error('Nominal E-Payment tidak valid');
    err.status = 400;
    throw err;
  }

  if (hasSecondary) {
    if (isEpaymentMethod(secondaryMethod) || isCollaborationMethod(secondaryMethod)) {
      const err = new Error(
        'Metode sisa tidak boleh E-Payment atau Collaboration'
      );
      err.status = 400;
      throw err;
    }
    if (!amountProvided || epaymentAmount <= 0) {
      const err = new Error(
        'Nominal E-Payment wajib diisi dan lebih dari 0 jika ada metode sisa'
      );
      err.status = 400;
      throw err;
    }
    if (epaymentAmount >= finalAmt) {
      const err = new Error(
        'Nominal E-Payment harus lebih kecil dari total tagihan jika ada metode sisa'
      );
      err.status = 400;
      throw err;
    }
    return {
      epayment_amount: epaymentAmount,
      secondary_payment_method_id: Number(secondaryMethod.id),
    };
  }

  // E-Payment only (full or partial amount without secondary → treat as full / store amount if = final)
  if (amountProvided) {
    if (epaymentAmount > finalAmt) {
      const err = new Error('Nominal E-Payment tidak boleh melebihi total tagihan');
      err.status = 400;
      throw err;
    }
    if (epaymentAmount < finalAmt && epaymentAmount > 0) {
      const err = new Error(
        'Sisa pembayaran wajib memilih metode lain (maks. 2 metode)'
      );
      err.status = 400;
      throw err;
    }
    // amount === 0 or amount === final → no split stored
    if (epaymentAmount === finalAmt) {
      return { epayment_amount: null, secondary_payment_method_id: null };
    }
    return { epayment_amount: null, secondary_payment_method_id: null };
  }

  return { epayment_amount: null, secondary_payment_method_id: null };
}

/** Prefer known groups; unknown DB groups sort after (by id). */
export function paymentMethodGroupFieldSql(columnExpression = '`group`') {
  const placeholders = PAYMENT_METHOD_GROUP_ORDER.map((g) => `'${g}'`).join(', ');
  return `CASE WHEN FIELD(${columnExpression}, ${placeholders}) = 0 THEN 999 ELSE FIELD(${columnExpression}, ${placeholders}) END`;
}
