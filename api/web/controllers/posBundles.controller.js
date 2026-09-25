import cleanoxPool from '../../shared/db/cleanox.js';
import {
  assertBundleMasterPayload,
  activateCustomerBundleOnPaid,
  createCustomerBundleFromMaster,
  listActiveCustomerBundles,
} from '../../shared/utils/posBundle.js';
import { todayDateStringJakarta } from '../../shared/utils/posWorkerBusy.js';
import { isCollaborationMethod } from '../../shared/utils/posCollaborationPayment.js';

const PAYMENT_STATUSES = new Set(['belum_lunas', 'lunas']);

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function buildTransactionNo() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return `CLX${stamp}${Math.floor(Math.random() * 90 + 10)}`;
}

function mapBundleRow(row) {
  return {
    id: row.id,
    name: row.name,
    price: toMoney(row.price),
    coret_price: row.coret_price == null ? null : toMoney(row.coret_price),
    duration_months: Number(row.duration_months),
    is_active: Boolean(Number(row.is_active)),
    notes: row.notes || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    item_count: row.item_count == null ? undefined : Number(row.item_count),
  };
}

async function loadBundleItems(connection, bundleId) {
  const [rows] = await connection.query(
    `SELECT
      bi.id,
      bi.bundle_id,
      bi.service_id,
      bi.quota_unit,
      bi.quota_amount,
      bi.sort_order,
      s.name AS service_name,
      c.name AS category_name
     FROM mst_bundle_items bi
     INNER JOIN mst_services s ON s.id = bi.service_id
     LEFT JOIN mst_category c ON c.id = s.category_id
     WHERE bi.bundle_id = ?
     ORDER BY bi.sort_order ASC, bi.id ASC`,
    [bundleId]
  );
  return rows.map((row) => ({
    id: row.id,
    bundle_id: row.bundle_id,
    service_id: row.service_id,
    service_name: row.service_name,
    category_name: row.category_name || null,
    quota_unit: row.quota_unit,
    quota_amount: Number(row.quota_amount),
    sort_order: Number(row.sort_order || 0),
  }));
}

export const listBundles = async (req, res) => {
  const search = String(req.query.search || '').trim();
  const isActiveRaw = req.query.is_active;
  try {
    let sql = `
      SELECT
        b.*,
        (SELECT COUNT(*) FROM mst_bundle_items bi WHERE bi.bundle_id = b.id) AS item_count
      FROM mst_bundles b
      WHERE 1 = 1`;
    const params = [];
    if (search) {
      sql += ` AND b.name LIKE ?`;
      params.push(`%${search}%`);
    }
    if (isActiveRaw != null && String(isActiveRaw).trim() !== '') {
      const active = ['1', 'true', 'yes'].includes(String(isActiveRaw).trim().toLowerCase()) ? 1 : 0;
      sql += ` AND b.is_active = ?`;
      params.push(active);
    }
    sql += ` ORDER BY b.updated_at DESC, b.id DESC`;
    const [rows] = await cleanoxPool.query(sql, params);
    return res.json({ bundles: rows.map(mapBundleRow) });
  } catch (error) {
    console.error('[pos-bundles/listBundles]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil daftar paket bundle' });
  }
};

export const getBundleDetail = async (req, res) => {
  const bundleId = Number(req.params.id);
  if (!bundleId) {
    return res.status(400).json({ message: 'ID paket tidak valid' });
  }
  try {
    const [[row]] = await cleanoxPool.query(
      `SELECT * FROM mst_bundles WHERE id = ? LIMIT 1`,
      [bundleId]
    );
    if (!row) {
      return res.status(404).json({ message: 'Paket bundle tidak ditemukan' });
    }
    const items = await loadBundleItems(cleanoxPool, bundleId);
    return res.json({ bundle: { ...mapBundleRow(row), items } });
  } catch (error) {
    console.error('[pos-bundles/getBundleDetail]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil detail paket bundle' });
  }
};

export const createBundle = async (req, res) => {
  const asserted = assertBundleMasterPayload(req.body);
  if (asserted.error) {
    return res.status(400).json({ message: asserted.error });
  }
  const payload = asserted.data;
  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const serviceIds = payload.items.map((item) => item.service_id);
    const [serviceRows] = await connection.query(
      `SELECT id FROM mst_services WHERE id IN (${serviceIds.map(() => '?').join(',')})`,
      serviceIds
    );
    if (serviceRows.length !== serviceIds.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Ada service yang tidak ditemukan' });
    }

    const [result] = await connection.query(
      `INSERT INTO mst_bundles
        (name, price, coret_price, duration_months, is_active, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        payload.name,
        payload.price,
        payload.coret_price,
        payload.duration_months,
        payload.is_active ? 1 : 0,
        payload.notes,
      ]
    );
    const bundleId = result.insertId;
    for (const item of payload.items) {
      await connection.query(
        `INSERT INTO mst_bundle_items
          (bundle_id, service_id, quota_unit, quota_amount, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        [bundleId, item.service_id, item.quota_unit, item.quota_amount, item.sort_order]
      );
    }

    await connection.commit();
    const items = await loadBundleItems(cleanoxPool, bundleId);
    const [[row]] = await cleanoxPool.query(`SELECT * FROM mst_bundles WHERE id = ?`, [bundleId]);
    return res.status(201).json({ bundle: { ...mapBundleRow(row), items } });
  } catch (error) {
    await connection.rollback();
    console.error('[pos-bundles/createBundle]', error.message);
    return res.status(500).json({ message: error.message || 'Gagal membuat paket bundle' });
  } finally {
    connection.release();
  }
};

export const updateBundle = async (req, res) => {
  const bundleId = Number(req.params.id);
  if (!bundleId) {
    return res.status(400).json({ message: 'ID paket tidak valid' });
  }
  const asserted = assertBundleMasterPayload(req.body);
  if (asserted.error) {
    return res.status(400).json({ message: asserted.error });
  }
  const payload = asserted.data;
  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();
    const [[existing]] = await connection.query(
      `SELECT id FROM mst_bundles WHERE id = ? LIMIT 1 FOR UPDATE`,
      [bundleId]
    );
    if (!existing) {
      await connection.rollback();
      return res.status(404).json({ message: 'Paket bundle tidak ditemukan' });
    }

    const serviceIds = payload.items.map((item) => item.service_id);
    const [serviceRows] = await connection.query(
      `SELECT id FROM mst_services WHERE id IN (${serviceIds.map(() => '?').join(',')})`,
      serviceIds
    );
    if (serviceRows.length !== serviceIds.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Ada service yang tidak ditemukan' });
    }

    await connection.query(
      `UPDATE mst_bundles
       SET name = ?, price = ?, coret_price = ?, duration_months = ?, is_active = ?, notes = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        payload.name,
        payload.price,
        payload.coret_price,
        payload.duration_months,
        payload.is_active ? 1 : 0,
        payload.notes,
        bundleId,
      ]
    );
    await connection.query(`DELETE FROM mst_bundle_items WHERE bundle_id = ?`, [bundleId]);
    for (const item of payload.items) {
      await connection.query(
        `INSERT INTO mst_bundle_items
          (bundle_id, service_id, quota_unit, quota_amount, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        [bundleId, item.service_id, item.quota_unit, item.quota_amount, item.sort_order]
      );
    }

    await connection.commit();
    const items = await loadBundleItems(cleanoxPool, bundleId);
    const [[row]] = await cleanoxPool.query(`SELECT * FROM mst_bundles WHERE id = ?`, [bundleId]);
    return res.json({ bundle: { ...mapBundleRow(row), items } });
  } catch (error) {
    await connection.rollback();
    console.error('[pos-bundles/updateBundle]', error.message);
    return res.status(500).json({ message: error.message || 'Gagal mengubah paket bundle' });
  } finally {
    connection.release();
  }
};

export const listCustomerActiveBundles = async (req, res) => {
  const customerId = Number(req.params.customerId);
  if (!customerId) {
    return res.status(400).json({ message: 'Customer tidak valid' });
  }
  try {
    const bundles = await listActiveCustomerBundles(cleanoxPool, customerId);
    return res.json({ bundles });
  } catch (error) {
    console.error('[pos-bundles/listCustomerActiveBundles]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil paket aktif customer' });
  }
};

export const listCustomerBundleInstances = async (req, res) => {
  const search = String(req.query.search || '').trim();
  const statusFilter = String(req.query.status || 'active').trim().toLowerCase();
  const customerIdRaw = req.query.customer_id;
  const customerId =
    customerIdRaw == null || customerIdRaw === ''
      ? null
      : Number(customerIdRaw);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.query.page_size, 10) || 10));
  const offset = (page - 1) * pageSize;

  const allowedStatus = new Set([
    'active',
    'pending_payment',
    'exhausted',
    'expired',
    'cancelled',
    'all',
  ]);
  if (!allowedStatus.has(statusFilter)) {
    return res.status(400).json({ message: 'Filter status tidak valid' });
  }
  if (customerId != null && (!Number.isFinite(customerId) || customerId <= 0)) {
    return res.status(400).json({ message: 'customer_id tidak valid' });
  }

  try {
    let whereSql = ' WHERE 1 = 1';
    const params = [];

    if (customerId) {
      whereSql += ' AND cb.customer_id = ?';
      params.push(customerId);
    }

    if (search) {
      whereSql += ` AND (
        c.name LIKE ?
        OR COALESCE(c.phone, '') LIKE ?
        OR cb.bundle_name LIKE ?
      )`;
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    if (statusFilter === 'active') {
      whereSql += ` AND cb.status = 'active'
        AND cb.expires_at IS NOT NULL
        AND cb.expires_at >= NOW()
        AND EXISTS (
          SELECT 1 FROM tr_customer_bundle_balances b
          WHERE b.customer_bundle_id = cb.id AND b.remaining_amount > 0
        )`;
    } else if (statusFilter === 'expired') {
      whereSql += ` AND (
        cb.status = 'expired'
        OR (cb.expires_at IS NOT NULL AND cb.expires_at < NOW())
      )`;
    } else if (statusFilter === 'pending_payment') {
      whereSql += ` AND cb.status = 'pending_payment'`;
    } else if (statusFilter === 'exhausted') {
      whereSql += ` AND cb.status = 'exhausted'`;
    } else if (statusFilter === 'cancelled') {
      whereSql += ` AND cb.status = 'cancelled'`;
    }

    const fromSql = `
      FROM tr_customer_bundles cb
      INNER JOIN mst_customers c ON c.id = cb.customer_id
      ${whereSql}`;

    const [[countRow]] = await cleanoxPool.query(
      `SELECT COUNT(*) AS total ${fromSql}`,
      params
    );
    const totalItems = Number(countRow?.total || 0);

    const [rows] = await cleanoxPool.query(
      `SELECT
        cb.id,
        cb.customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,
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
       ${fromSql}
       ORDER BY
         CASE WHEN cb.status = 'active' AND cb.expires_at >= NOW() THEN 0 ELSE 1 END,
         cb.expires_at ASC,
         cb.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    let balancesByBundle = new Map();
    if (rows.length) {
      const ids = rows.map((row) => row.id);
      const [balances] = await cleanoxPool.query(
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
      balancesByBundle = new Map();
      for (const bal of balances) {
        const list = balancesByBundle.get(bal.customer_bundle_id) || [];
        list.push({
          id: bal.id,
          service_id: bal.service_id,
          service_name: bal.service_name_snapshot,
          quota_unit: bal.quota_unit,
          initial_amount: Number(bal.initial_amount || 0),
          remaining_amount: Number(bal.remaining_amount || 0),
        });
        balancesByBundle.set(bal.customer_bundle_id, list);
      }
    }

    const now = Date.now();
    const instances = rows.map((row) => {
      const expiresAtMs = row.expires_at ? new Date(row.expires_at).getTime() : null;
      const isPastExpiry = expiresAtMs != null && expiresAtMs < now;
      let displayStatus = row.status;
      if (row.status === 'active' && isPastExpiry) {
        displayStatus = 'expired';
      }
      return {
        id: row.id,
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone || null,
        bundle_id: row.bundle_id,
        bundle_name: row.bundle_name,
        bundle_price: toMoney(row.bundle_price),
        bundle_coret_price:
          row.bundle_coret_price == null ? null : toMoney(row.bundle_coret_price),
        duration_months: Number(row.duration_months || 0),
        status: displayStatus,
        purchased_at: row.purchased_at,
        activated_at: row.activated_at,
        expires_at: row.expires_at,
        purchase_transaction_id: row.purchase_transaction_id,
        balances: balancesByBundle.get(row.id) || [],
      };
    });

    return res.json({
      instances,
      pagination: {
        page,
        page_size: pageSize,
        total_items: totalItems,
        total_pages: Math.max(1, Math.ceil(totalItems / pageSize) || 1),
      },
    });
  } catch (error) {
    console.error('[pos-bundles/listCustomerBundleInstances]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil daftar saldo paket' });
  }
};

export const createBundlePurchase = async (req, res) => {
  const customerId = Number(req.body?.customer_id);
  const bundleId = Number(req.body?.bundle_id);
  const paymentMethodIdRaw = req.body?.payment_method_id;
  const paymentStatusRaw = String(req.body?.payment_status || 'belum_lunas').trim();
  const serviceDateRaw = String(req.body?.service_date || '').trim();

  if (!customerId || !bundleId) {
    return res.status(400).json({ message: 'customer_id dan bundle_id wajib diisi' });
  }
  if (!PAYMENT_STATUSES.has(paymentStatusRaw)) {
    return res.status(400).json({ message: 'Status pembayaran wajib belum_lunas atau lunas' });
  }

  const paymentMethodIdParsed = Number(paymentMethodIdRaw);
  const paymentMethodId =
    paymentMethodIdRaw == null ||
    paymentMethodIdRaw === '' ||
    !Number.isFinite(paymentMethodIdParsed) ||
    paymentMethodIdParsed <= 0
      ? null
      : paymentMethodIdParsed;

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [[customer]] = await connection.query(
      `SELECT id, name, phone, address
       FROM mst_customers
       WHERE id = ? AND COALESCE(status, 'Aktif') = 'Aktif'
       LIMIT 1`,
      [customerId]
    );
    if (!customer) {
      await connection.rollback();
      return res.status(400).json({ message: 'Customer tidak ditemukan atau tidak aktif' });
    }

    const [[bundle]] = await connection.query(
      `SELECT * FROM mst_bundles WHERE id = ? LIMIT 1`,
      [bundleId]
    );
    if (!bundle || !Number(bundle.is_active)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Paket bundle tidak ditemukan atau tidak aktif' });
    }

    let selectedPaymentMethod = null;
    if (paymentMethodId != null) {
      const [[method]] = await connection.query(
        `SELECT id, \`group\` AS method_group, is_active
         FROM mst_payment_method WHERE id = ? LIMIT 1`,
        [paymentMethodId]
      );
      if (!method || !Number(method.is_active)) {
        await connection.rollback();
        return res.status(400).json({ message: 'Metode pembayaran tidak valid atau nonaktif' });
      }
      selectedPaymentMethod = method;
    }

    const isCollab = isCollaborationMethod(selectedPaymentMethod);
    let paymentStatus = isCollab ? 'lunas' : paymentStatusRaw;
    let paymentSettledDate = paymentStatus === 'lunas' ? todayDateStringJakarta() : null;
    const finalAmount = isCollab ? 0 : toMoney(bundle.price);
    const serviceDate =
      /^\d{4}-\d{2}-\d{2}$/.test(serviceDateRaw) ? serviceDateRaw : todayDateStringJakarta();
    const transactionNo = buildTransactionNo();
    const notes = `Pembelian paket: ${bundle.name}`;

    const [txResult] = await connection.query(
      `INSERT INTO tr_transactions
        (transaction_no, customer_id, customer_name, customer_phone, customer_address, service_date,
         total_people, subtotal_amount, discount_amount, transport_fee, final_amount,
         notes, service_mode, is_history_entry, entry_kind, customer_bundle_id,
         payment_method_id, payment_status, payment_settled_date, status, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, 0, ?, ?, 'home_service', 0, 'bundle_purchase', NULL,
               ?, ?, ?, 'Completed', ?, ?)`,
      [
        transactionNo,
        customer.id,
        customer.name,
        customer.phone || null,
        customer.address || null,
        serviceDate,
        toMoney(bundle.price),
        finalAmount,
        notes,
        paymentMethodId,
        paymentStatus,
        paymentSettledDate,
        req.user?.id || null,
        req.user?.id || null,
      ]
    );

    const transactionId = txResult.insertId;
    const { customerBundleId } = await createCustomerBundleFromMaster(connection, {
      customerId: customer.id,
      bundleId: bundle.id,
      purchaseTransactionId: transactionId,
      userId: req.user?.id || null,
    });

    await connection.query(
      `UPDATE tr_transactions
       SET customer_bundle_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [customerBundleId, transactionId]
    );

    if (paymentStatus === 'lunas') {
      await activateCustomerBundleOnPaid(connection, customerBundleId);
    }

    await connection.commit();

    const [[tx]] = await cleanoxPool.query(
      `SELECT * FROM tr_transactions WHERE id = ? LIMIT 1`,
      [transactionId]
    );
    const [[cb]] = await cleanoxPool.query(
      `SELECT * FROM tr_customer_bundles WHERE id = ? LIMIT 1`,
      [customerBundleId]
    );

    return res.status(201).json({
      transaction: {
        id: tx.id,
        transaction_no: tx.transaction_no,
        entry_kind: tx.entry_kind,
        customer_bundle_id: tx.customer_bundle_id,
        final_amount: toMoney(tx.final_amount),
        payment_status: tx.payment_status,
        status: tx.status,
      },
      customer_bundle: {
        id: cb.id,
        status: cb.status,
        activated_at: cb.activated_at,
        expires_at: cb.expires_at,
        bundle_name: cb.bundle_name,
        bundle_price: toMoney(cb.bundle_price),
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('[pos-bundles/createBundlePurchase]', error.message);
    return res.status(500).json({ message: error.message || 'Gagal membuat pembelian paket' });
  } finally {
    connection.release();
  }
};
