import { createPosTracking } from './posTracking.js';

export function isGeneralCleaningCategory(categoryName) {
  if (!categoryName) return false;
  return String(categoryName).trim().toLowerCase() === 'general cleaning';
}

export function parseGcCrewSizeFromServiceName(serviceName) {
  if (!serviceName) return null;
  const match = String(serviceName).match(/\/\s*(\d+)\s*Teknisi/i);
  if (!match) return null;
  const size = Number(match[1]);
  return Number.isFinite(size) && size >= 1 ? size : null;
}

export function transactionHasGeneralCleaning(items = []) {
  return (items || []).some((item) => isGeneralCleaningCategory(item?.category_name));
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resolveGcJobWindow(assignments = []) {
  const doneRows = (assignments || []).filter(
    (row) =>
      row?.assignment_status === 'Done' &&
      row?.started_at &&
      row?.completed_at
  );

  if (!doneRows.length) {
    throw new Error('Durasi pengerjaan tidak valid');
  }

  let startedAt = null;
  let completedAt = null;

  for (const row of doneRows) {
    const start = toDate(row.started_at);
    const end = toDate(row.completed_at);
    if (!start || !end) {
      throw new Error('Durasi pengerjaan tidak valid');
    }
    if (!startedAt || start < startedAt) startedAt = start;
    if (!completedAt || end > completedAt) completedAt = end;
  }

  return { startedAt, completedAt };
}

/**
 * Job window for finalize-on-first-after:
 * start = earliest started_at (klik Mulai), end = after_photo_at pemicu.
 */
export function resolveGcJobWindowFromAfter(assignments = [], { endAfterPhotoAt } = {}) {
  let startedAt = null;

  for (const row of assignments || []) {
    const start = toDate(row.started_at);
    if (!start) continue;
    if (!startedAt || start < startedAt) startedAt = start;
  }

  const completedAt = toDate(endAfterPhotoAt);
  if (!startedAt || !completedAt) {
    throw new Error('Durasi pengerjaan tidak valid');
  }

  return { startedAt, completedAt };
}

export function calculateGcBillingHours({ startedAt, completedAt }) {
  const start = toDate(startedAt);
  const end = toDate(completedAt);
  if (!start || !end) {
    throw new Error('Durasi pengerjaan tidak valid');
  }

  const elapsedMs = end.getTime() - start.getTime();
  if (!(elapsedMs > 0)) {
    throw new Error('Durasi pengerjaan tidak valid');
  }

  let hours = elapsedMs / 3_600_000;
  hours = Math.ceil(hours * 100) / 100;
  if (hours < 0.01) hours = 0.01;
  return hours;
}

export function computeGcLineTotals({
  basePrice,
  promoType = null,
  promoValue = null,
  billingHours,
}) {
  const base = Number(basePrice || 0);
  const hours = Number(billingHours || 0);
  const rawPromoValue = Number(promoValue || 0);
  const discountPerUnit =
    promoType === 'persen'
      ? (base * rawPromoValue) / 100
      : promoType === 'nominal'
        ? rawPromoValue
        : 0;
  const safeDiscountPerUnit = Math.min(base, Math.max(0, discountPerUnit));
  const rateFinal = Math.max(0, base - safeDiscountPerUnit);
  const lineTotal = rateFinal * hours;
  const promoDiscountAmount = safeDiscountPerUnit * hours;

  return {
    rateFinal,
    lineTotal,
    billingHours: hours,
    discountPerUnit: safeDiscountPerUnit,
    promoDiscountAmount,
  };
}

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

/**
 * Finalize GC pricing from an explicit job window (admin history entry or mobile finalize).
 * Must run inside an open DB transaction; throws on invalid duration (caller should rollback).
 */
export async function finalizeGeneralCleaningPricingFromWindow(
  connection,
  transactionId,
  { startedAt, completedAt, actorId = null, trackingTitle = 'Pricing finalized' } = {}
) {
  if (!transactionId) return { finalized: false };

  const [[tx]] = await connection.query(
    `SELECT * FROM tr_transactions WHERE id = ? FOR UPDATE`,
    [transactionId]
  );
  if (!tx) return { finalized: false };
  if (tx.pricing_finalized_at) return { finalized: false, already: true };

  const [items] = await connection.query(
    `SELECT
      i.*,
      s.name AS service_name,
      c.name AS category_name
     FROM tr_transaction_items i
     INNER JOIN mst_services s ON s.id = i.service_id
     LEFT JOIN mst_category c ON c.id = s.category_id
     WHERE i.transaction_id = ?
     ORDER BY i.id`,
    [transactionId]
  );

  if (!transactionHasGeneralCleaning(items)) {
    return { finalized: false };
  }

  const billingHours = calculateGcBillingHours({ startedAt, completedAt });

  let subtotal = 0;
  let discount = 0;

  for (const item of items) {
    const isGc = isGeneralCleaningCategory(item.category_name);

    if (isGc) {
      const computed = computeGcLineTotals({
        basePrice: item.base_price_snapshot,
        promoType: item.promo_type_snapshot,
        promoValue: item.promo_value_snapshot,
        billingHours,
      });

      await connection.query(
        `UPDATE tr_transaction_items
         SET qty = ?,
             promo_discount_amount = ?,
             final_price_snapshot = ?,
             line_total = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [
          billingHours,
          toMoney(computed.promoDiscountAmount),
          toMoney(computed.rateFinal),
          toMoney(computed.lineTotal),
          item.id,
        ]
      );

      subtotal += Number(item.base_price_snapshot || 0) * billingHours;
      discount += computed.promoDiscountAmount;
      item.qty = billingHours;
      item.final_price_snapshot = computed.rateFinal;
      item.line_total = computed.lineTotal;
      item.promo_discount_amount = computed.promoDiscountAmount;
    } else {
      const qty = Math.max(1, Number(item.qty || 1));
      subtotal += Number(item.base_price_snapshot || 0) * qty;
      discount += Number(item.promo_discount_amount || 0);
    }
  }

  const finalAmount = subtotal - discount;

  const [workerRows] = await connection.query(
    `SELECT employee_id, employee_name
     FROM tr_worker_assignments
     WHERE transaction_id = ?
       AND assignment_status NOT IN ('Cancelled', 'Rejected', 'Replaced')
     ORDER BY id ASC`,
    [transactionId]
  );

  const messageItems = items.map((item) => ({
    service_name: item.service_name,
    qty: item.qty,
    base_price: item.base_price_snapshot,
    final_price_per_unit: item.final_price_snapshot,
    line_total: item.line_total,
    promo_type: item.promo_type_snapshot,
    promo_value: item.promo_value_snapshot,
    category_name: item.category_name || null,
  }));

  const { buildGroupOrderMessage } = await import('./posGroupOrderMessage.js');
  const { buildCustomerOrderMessage } = await import('./posCustomerOrderMessage.js');

  const groupMessageTemplate = buildGroupOrderMessage({
    customerName: tx.customer_name,
    customerPhone: tx.customer_phone,
    customerAddress: tx.customer_address,
    serviceDate: tx.service_date,
    items: messageItems,
    totalPeople: tx.total_people,
    notes: tx.notes,
    finalAmount,
    pricingFinalized: true,
    workers: workerRows.map((row) => ({
      full_name: row.employee_name,
      phone_number: null,
    })),
  });

  const customerMessageTemplate = buildCustomerOrderMessage({
    customerName: tx.customer_name,
    customerPhone: tx.customer_phone,
    customerAddress: tx.customer_address,
    serviceDate: tx.service_date,
    items: messageItems,
    totalPeople: tx.total_people,
    finalAmount,
    pricingFinalized: true,
  });

  await connection.query(
    `UPDATE tr_transactions
     SET subtotal_amount = ?,
         discount_amount = ?,
         final_amount = ?,
         billing_hours = ?,
         pricing_finalized_at = NOW(),
         group_message_template = ?,
         customer_message_template = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [
      toMoney(subtotal),
      toMoney(discount),
      toMoney(finalAmount),
      toMoney(billingHours),
      groupMessageTemplate,
      customerMessageTemplate,
      transactionId,
    ]
  );

  await createPosTracking(
    connection,
    transactionId,
    'Completed',
    trackingTitle,
    `General Cleaning difinalisasi: ${billingHours} jam · total ${toMoney(finalAmount)}`,
    actorId
  );

  return { finalized: true, billingHours, finalAmount };
}

/**
 * Finalize GC pricing (once).
 * - With endAfterPhotoAt: window = earliest started_at → after time (first after path).
 * - Without: fallback Done window (completeTask path).
 * Must run inside an open DB transaction; throws on invalid duration (caller should rollback).
 */
export async function finalizeGeneralCleaningPricing(
  connection,
  transactionId,
  { actorId = null, endAfterPhotoAt = null } = {}
) {
  if (!transactionId) return { finalized: false };

  const [[tx]] = await connection.query(
    `SELECT id, pricing_finalized_at FROM tr_transactions WHERE id = ?`,
    [transactionId]
  );
  if (!tx) return { finalized: false };
  if (tx.pricing_finalized_at) return { finalized: false, already: true };

  const [items] = await connection.query(
    `SELECT
      i.id,
      c.name AS category_name
     FROM tr_transaction_items i
     INNER JOIN mst_services s ON s.id = i.service_id
     LEFT JOIN mst_category c ON c.id = s.category_id
     WHERE i.transaction_id = ?`,
    [transactionId]
  );

  if (!transactionHasGeneralCleaning(items)) {
    return { finalized: false };
  }

  const [assignments] = await connection.query(
    `SELECT id, employee_id, employee_name, assignment_status, started_at, completed_at, after_photo_at
     FROM tr_worker_assignments
     WHERE transaction_id = ?`,
    [transactionId]
  );

  const window = endAfterPhotoAt
    ? resolveGcJobWindowFromAfter(assignments, { endAfterPhotoAt })
    : resolveGcJobWindow(assignments);

  return finalizeGeneralCleaningPricingFromWindow(connection, transactionId, {
    startedAt: window.startedAt,
    completedAt: window.completedAt,
    actorId,
  });
}
