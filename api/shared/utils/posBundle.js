import { isGeneralCleaningCategory } from './posGeneralCleaningBilling.js';
import { computeTransactionPromoDiscount } from './posTransactionPromo.js';

const QUOTA_UNITS = new Set(['jam', 'kali']);

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function toQuota(value) {
  return Number(Number(value || 0).toFixed(2));
}

export function isGeneralCleaningService(serviceRow) {
  return isGeneralCleaningCategory(serviceRow?.category_name);
}

export function assertBundleMasterPayload(body = {}) {
  const name = String(body.name || '').trim();
  if (!name) {
    return { error: 'Nama paket wajib diisi' };
  }

  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0) {
    return { error: 'Harga paket tidak valid' };
  }

  let coretPrice = null;
  if (body.coret_price != null && body.coret_price !== '') {
    const parsed = Number(body.coret_price);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { error: 'Harga coret tidak valid' };
    }
    coretPrice = toMoney(parsed);
  }

  const durationMonths = Number(body.duration_months);
  if (!Number.isFinite(durationMonths) || durationMonths < 1 || !Number.isInteger(durationMonths)) {
    return { error: 'Masa aktif (bulan) wajib minimal 1' };
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    return { error: 'Minimal 1 layanan dalam paket' };
  }

  const normalizedItems = [];
  const seenServices = new Set();
  for (let i = 0; i < items.length; i += 1) {
    const raw = items[i] || {};
    const serviceId = Number(raw.service_id);
    if (!Number.isFinite(serviceId) || serviceId <= 0) {
      return { error: `Item #${i + 1}: service tidak valid` };
    }
    if (seenServices.has(serviceId)) {
      return { error: 'Service dalam paket tidak boleh duplikat' };
    }
    seenServices.add(serviceId);

    const quotaUnit = String(raw.quota_unit || '').trim().toLowerCase();
    if (!QUOTA_UNITS.has(quotaUnit)) {
      return { error: `Item #${i + 1}: quota_unit wajib jam atau kali` };
    }

    const quotaAmount = Number(raw.quota_amount);
    if (!Number.isFinite(quotaAmount) || quotaAmount <= 0) {
      return { error: `Item #${i + 1}: quota_amount harus > 0` };
    }

    normalizedItems.push({
      service_id: serviceId,
      quota_unit: quotaUnit,
      quota_amount: toQuota(quotaAmount),
      sort_order: Number.isFinite(Number(raw.sort_order)) ? Number(raw.sort_order) : i,
    });
  }

  return {
    data: {
      name,
      price: toMoney(price),
      coret_price: coretPrice,
      duration_months: durationMonths,
      is_active: body.is_active == null ? 1 : Number(Boolean(Number(body.is_active) || body.is_active === true || body.is_active === '1')),
      notes: body.notes == null || String(body.notes).trim() === '' ? null : String(body.notes).trim(),
      items: normalizedItems,
    },
  };
}

export async function createCustomerBundleFromMaster(
  connection,
  { customerId, bundleId, purchaseTransactionId = null, userId = null }
) {
  const [[bundle]] = await connection.query(
    `SELECT id, name, price, coret_price, duration_months, is_active
     FROM mst_bundles
     WHERE id = ?
     LIMIT 1`,
    [Number(bundleId)]
  );
  if (!bundle) {
    throw new Error('Paket bundle tidak ditemukan');
  }
  if (!Number(bundle.is_active)) {
    throw new Error('Paket bundle tidak aktif');
  }

  const [items] = await connection.query(
    `SELECT
      bi.service_id,
      bi.quota_unit,
      bi.quota_amount,
      bi.sort_order,
      s.name AS service_name
     FROM mst_bundle_items bi
     INNER JOIN mst_services s ON s.id = bi.service_id
     WHERE bi.bundle_id = ?
     ORDER BY bi.sort_order ASC, bi.id ASC`,
    [bundle.id]
  );
  if (!items.length) {
    throw new Error('Paket bundle tidak memiliki item');
  }

  const [result] = await connection.query(
    `INSERT INTO tr_customer_bundles
      (customer_id, bundle_id, bundle_name, bundle_price, bundle_coret_price, duration_months,
       purchase_transaction_id, status, purchased_at, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_payment', NOW(), ?, ?)`,
    [
      Number(customerId),
      bundle.id,
      bundle.name,
      toMoney(bundle.price),
      bundle.coret_price == null ? null : toMoney(bundle.coret_price),
      Number(bundle.duration_months),
      purchaseTransactionId == null ? null : Number(purchaseTransactionId),
      userId || null,
      userId || null,
    ]
  );

  const customerBundleId = result.insertId;
  for (const item of items) {
    await connection.query(
      `INSERT INTO tr_customer_bundle_balances
        (customer_bundle_id, service_id, service_name_snapshot, quota_unit, initial_amount, remaining_amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        customerBundleId,
        item.service_id,
        item.service_name,
        item.quota_unit,
        toQuota(item.quota_amount),
        toQuota(item.quota_amount),
      ]
    );
  }

  return { customerBundleId, bundle };
}

export async function activateCustomerBundleOnPaid(connection, customerBundleId) {
  const id = Number(customerBundleId);
  if (!id) return { activated: false };

  const [[row]] = await connection.query(
    `SELECT id, status, duration_months, activated_at, expires_at
     FROM tr_customer_bundles
     WHERE id = ?
     LIMIT 1
     FOR UPDATE`,
    [id]
  );
  if (!row) return { activated: false };

  if (row.status === 'active' && row.activated_at) {
    return { activated: false, already: true };
  }
  if (row.status !== 'pending_payment' && row.status !== 'active') {
    return { activated: false, status: row.status };
  }

  await connection.query(
    `UPDATE tr_customer_bundles
     SET status = 'active',
         activated_at = COALESCE(activated_at, NOW()),
         expires_at = COALESCE(
           expires_at,
           DATE_ADD(COALESCE(activated_at, NOW()), INTERVAL ? MONTH)
         ),
         updated_at = NOW()
     WHERE id = ?`,
    [Number(row.duration_months), id]
  );

  return { activated: true };
}

export async function listActiveCustomerBundles(connection, customerId) {
  const [rows] = await connection.query(
    `SELECT
      cb.id,
      cb.customer_id,
      cb.bundle_id,
      cb.bundle_name,
      cb.bundle_price,
      cb.bundle_coret_price,
      cb.duration_months,
      cb.status,
      cb.purchased_at,
      cb.activated_at,
      cb.expires_at,
      cb.purchase_transaction_id
     FROM tr_customer_bundles cb
     WHERE cb.customer_id = ?
       AND cb.status = 'active'
       AND cb.expires_at IS NOT NULL
       AND cb.expires_at >= NOW()
       AND EXISTS (
         SELECT 1
         FROM tr_customer_bundle_balances b
         WHERE b.customer_bundle_id = cb.id
           AND b.remaining_amount > 0
       )
     ORDER BY cb.expires_at ASC, cb.id ASC`,
    [Number(customerId)]
  );

  if (!rows.length) return [];

  const ids = rows.map((row) => row.id);
  const [balances] = await connection.query(
    `SELECT
      id,
      customer_bundle_id,
      service_id,
      service_name_snapshot,
      quota_unit,
      initial_amount,
      remaining_amount
     FROM tr_customer_bundle_balances
     WHERE customer_bundle_id IN (${ids.map(() => '?').join(',')})
     ORDER BY id ASC`,
    ids
  );

  const byBundle = new Map();
  for (const bal of balances) {
    const list = byBundle.get(bal.customer_bundle_id) || [];
    list.push({
      id: bal.id,
      service_id: bal.service_id,
      service_name: bal.service_name_snapshot,
      quota_unit: bal.quota_unit,
      initial_amount: toQuota(bal.initial_amount),
      remaining_amount: toQuota(bal.remaining_amount),
    });
    byBundle.set(bal.customer_bundle_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    customer_id: row.customer_id,
    bundle_id: row.bundle_id,
    bundle_name: row.bundle_name,
    bundle_price: toMoney(row.bundle_price),
    bundle_coret_price: row.bundle_coret_price == null ? null : toMoney(row.bundle_coret_price),
    duration_months: Number(row.duration_months),
    status: row.status,
    purchased_at: row.purchased_at,
    activated_at: row.activated_at,
    expires_at: row.expires_at,
    purchase_transaction_id: row.purchase_transaction_id,
    balances: byBundle.get(row.id) || [],
  }));
}

/**
 * @param {object} args
 * @param {number} args.customerBundleId
 * @param {number} args.customerId
 * @param {{ service_id: number, quota_used: number }[]} args.lines
 */
export async function assertBundleUsageLines(connection, { customerBundleId, customerId, lines }) {
  const [[bundle]] = await connection.query(
    `SELECT id, customer_id, status, expires_at
     FROM tr_customer_bundles
     WHERE id = ?
     LIMIT 1
     FOR UPDATE`,
    [Number(customerBundleId)]
  );
  if (!bundle) {
    throw new Error('Paket customer tidak ditemukan');
  }
  if (Number(bundle.customer_id) !== Number(customerId)) {
    throw new Error('Paket tidak milik customer ini');
  }
  if (bundle.status !== 'active') {
    throw new Error('Paket belum aktif atau sudah tidak dapat dipakai');
  }
  if (!bundle.expires_at || new Date(bundle.expires_at).getTime() < Date.now()) {
    throw new Error('Paket sudah kedaluwarsa');
  }

  const [balances] = await connection.query(
    `SELECT *
     FROM tr_customer_bundle_balances
     WHERE customer_bundle_id = ?
     FOR UPDATE`,
    [bundle.id]
  );
  const balanceByService = new Map(balances.map((row) => [Number(row.service_id), row]));

  const usedByService = new Map();
  for (const line of lines || []) {
    const serviceId = Number(line.service_id);
    const quotaUsed = toQuota(line.quota_used);
    if (!serviceId || !(quotaUsed > 0)) {
      throw new Error('Kuota pemakaian paket tidak valid');
    }
    usedByService.set(serviceId, toQuota((usedByService.get(serviceId) || 0) + quotaUsed));
  }

  const deductions = [];
  for (const [serviceId, quotaUsed] of usedByService.entries()) {
    const balance = balanceByService.get(serviceId);
    if (!balance) {
      throw new Error(`Layanan tidak termasuk dalam paket yang dipilih`);
    }
    const remaining = toQuota(balance.remaining_amount);
    if (quotaUsed > remaining) {
      throw new Error(
        `Sisa kuota ${balance.service_name_snapshot} tidak cukup (sisa ${remaining} ${balance.quota_unit})`
      );
    }
    deductions.push({
      balance_id: balance.id,
      service_id: serviceId,
      quota_unit: balance.quota_unit,
      quota_used: quotaUsed,
      remaining_before: remaining,
    });
  }

  return { bundle, balances, deductions };
}

export async function deductBundleBalances(connection, deductions = []) {
  if (!deductions.length) return;

  let customerBundleId = null;
  for (const row of deductions) {
    await connection.query(
      `UPDATE tr_customer_bundle_balances
       SET remaining_amount = remaining_amount - ?,
           updated_at = NOW()
       WHERE id = ?
         AND remaining_amount >= ?`,
      [toQuota(row.quota_used), row.balance_id, toQuota(row.quota_used)]
    );

    const [[bal]] = await connection.query(
      `SELECT customer_bundle_id, remaining_amount
       FROM tr_customer_bundle_balances
       WHERE id = ?
       LIMIT 1`,
      [row.balance_id]
    );
    if (!bal) {
      throw new Error('Gagal memotong kuota paket');
    }
    customerBundleId = bal.customer_bundle_id;
  }

  if (!customerBundleId) return;

  const [[sumRow]] = await connection.query(
    `SELECT COALESCE(SUM(remaining_amount), 0) AS remaining_total
     FROM tr_customer_bundle_balances
     WHERE customer_bundle_id = ?`,
    [customerBundleId]
  );
  if (toQuota(sumRow?.remaining_total) <= 0) {
    await connection.query(
      `UPDATE tr_customer_bundles
       SET status = 'exhausted', updated_at = NOW()
       WHERE id = ? AND status = 'active'`,
      [customerBundleId]
    );
  }
}

export async function restoreBundleBalances(connection, deductions = []) {
  if (!deductions.length) return;

  let customerBundleId = null;
  for (const row of deductions) {
    await connection.query(
      `UPDATE tr_customer_bundle_balances
       SET remaining_amount = remaining_amount + ?,
           updated_at = NOW()
       WHERE id = ?`,
      [toQuota(row.quota_used), row.balance_id]
    );
    const [[bal]] = await connection.query(
      `SELECT customer_bundle_id FROM tr_customer_bundle_balances WHERE id = ? LIMIT 1`,
      [row.balance_id]
    );
    customerBundleId = bal?.customer_bundle_id || customerBundleId;
  }

  if (!customerBundleId) return;

  await connection.query(
    `UPDATE tr_customer_bundles
     SET status = 'active', updated_at = NOW()
     WHERE id = ?
       AND status = 'exhausted'
       AND expires_at IS NOT NULL
       AND expires_at >= NOW()`,
    [customerBundleId]
  );
}

export function computeHybridTotals({
  regularSubtotal = 0,
  promoType = null,
  promoValue = null,
  discountType = null,
  discountValue = null,
  transportFee = 0,
}) {
  const subtotal = toMoney(Math.max(0, Number(regularSubtotal || 0)));
  const promoPart = computeTransactionPromoDiscount({
    subtotal,
    promoType,
    promoValue,
  }).discountAmount;
  const diskonPart = computeTransactionPromoDiscount({
    subtotal,
    promoType: discountType,
    promoValue: discountValue,
  }).discountAmount;
  const discount = toMoney(Math.min(subtotal, Math.max(0, promoPart) + Math.max(0, diskonPart)));
  const transport = toMoney(Math.max(0, Number(transportFee || 0)));
  const finalAmount = toMoney(subtotal - discount + transport);
  return { subtotal, discount, transportFee: transport, finalAmount };
}
