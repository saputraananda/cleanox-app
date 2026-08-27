import { buildCustomerOrderMessage } from './posCustomerOrderMessage.js';
import { buildGroupOrderMessage } from './posGroupOrderMessage.js';
import { isGeneralCleaningCategory } from './posGeneralCleaningBilling.js';
import {
  isMeterPricedService,
  isMeterPricingPending,
  resolveMeterValue,
  transactionHasMeterPending,
} from './posMeterServices.js';
import { computeTransactionPromoDiscount } from './posTransactionPromo.js';

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

/**
 * Recalc subtotal / discount / final + regenerate order messages.
 * Must run inside an open DB transaction.
 */
export async function recalcPosTransactionMoney(connection, transactionId, { actorId = null } = {}) {
  const [[transaction]] = await connection.query(
    `SELECT * FROM tr_transactions WHERE id = ? LIMIT 1`,
    [transactionId]
  );
  if (!transaction) {
    throw new Error('Transaksi POS tidak ditemukan');
  }

  const [items] = await connection.query(
    `SELECT
      i.*,
      s.name AS service_name,
      s.satuan_name,
      c.name AS category_name
     FROM tr_transaction_items i
     INNER JOIN mst_services s ON s.id = i.service_id
     LEFT JOIN mst_category c ON c.id = s.category_id
     WHERE i.transaction_id = ?
     ORDER BY i.id ASC`,
    [transactionId]
  );

  const hasHeaderPromo = Boolean(transaction.promo_type_snapshot);
  const pricingFinalizedAt = transaction.pricing_finalized_at;

  let subtotal = 0;
  let discount = 0;

  for (const row of items) {
    const isGc = isGeneralCleaningCategory(row.category_name);
    if (isGc && !pricingFinalizedAt) continue;
    if (
      isMeterPricingPending({
        satuanName: row.satuan_name,
        unitLabel: row.unit_label,
        meter: row.meter,
      })
    ) {
      continue;
    }

    const rowQty = Math.max(1, Number(row.qty || 1));
    const rowMeter = resolveMeterValue({
      satuanName: row.satuan_name,
      unitLabel: row.unit_label,
      meter: row.meter,
    });
    const rowBillable = isMeterPricedService({
      satuanName: row.satuan_name,
      unitLabel: row.unit_label,
    })
      ? rowQty * Number(rowMeter || 0)
      : rowQty;

    subtotal += Number(row.base_price_snapshot || 0) * rowBillable;
    if (!hasHeaderPromo) {
      discount += Number(row.promo_discount_amount || 0);
    }
  }

  if (hasHeaderPromo) {
    discount = computeTransactionPromoDiscount({
      subtotal,
      promoType: transaction.promo_type_snapshot,
      promoValue: transaction.promo_value_snapshot,
    }).discountAmount;
  }

  const finalAmount = subtotal - discount;
  const hasGcPending =
    !pricingFinalizedAt && items.some((row) => isGeneralCleaningCategory(row.category_name));
  const hasMeterPending = transactionHasMeterPending(items);
  const pricingFinalized = !hasGcPending && !hasMeterPending;

  const [workerRows] = await connection.query(
    `SELECT employee_id, employee_name
     FROM tr_worker_assignments
     WHERE transaction_id = ?
       AND assignment_status NOT IN ('Cancelled', 'Rejected', 'Replaced')
     ORDER BY id ASC`,
    [transactionId]
  );

  const messageItems = items.map((row) => ({
    service_name: row.service_name,
    qty: row.qty,
    meter: row.meter,
    base_price: row.base_price_snapshot,
    original_price: row.original_price_snapshot,
    final_price_per_unit: row.final_price_snapshot,
    line_total: row.line_total,
    promo_type: hasHeaderPromo ? null : row.promo_type_snapshot,
    promo_value: hasHeaderPromo ? null : row.promo_value_snapshot,
    category_name: row.category_name || null,
  }));

  const groupMessageTemplate = buildGroupOrderMessage({
    customerName: transaction.customer_name,
    customerPhone: transaction.customer_phone,
    customerAddress: transaction.customer_address,
    serviceDate: transaction.service_date,
    items: messageItems,
    totalPeople: transaction.total_people,
    notes: transaction.notes,
    finalAmount,
    pricingFinalized,
    workers: workerRows.map((row) => ({
      full_name: row.employee_name,
      phone_number: null,
    })),
  });

  const customerMessageTemplate = buildCustomerOrderMessage({
    customerName: transaction.customer_name,
    customerPhone: transaction.customer_phone,
    customerAddress: transaction.customer_address,
    serviceDate: transaction.service_date,
    items: messageItems,
    totalPeople: transaction.total_people,
    finalAmount,
    pricingFinalized,
  });

  await connection.query(
    `UPDATE tr_transactions
     SET subtotal_amount = ?,
         discount_amount = ?,
         final_amount = ?,
         group_message_template = ?,
         customer_message_template = ?,
         updated_by = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [
      toMoney(subtotal),
      toMoney(discount),
      toMoney(finalAmount),
      groupMessageTemplate,
      customerMessageTemplate,
      actorId,
      transactionId,
    ]
  );

  return {
    subtotal: toMoney(subtotal),
    discount: toMoney(discount),
    finalAmount: toMoney(finalAmount),
    items,
    transaction,
  };
}
