import cleanoxPool, { aloraPool } from '../db/cleanox.js';

const WA_URL = (process.env.ALORA_WA_URL || 'http://43.129.37.205:3000').replace(/\/$/, '');
const WA_SESSION = process.env.ALORA_WA_CLEANOX_SESSION || 'cleanox';

function formatWaRecipient(to) {
  if (!to) return null;
  const text = String(to).trim();
  if (text.endsWith('@g.us')) return text;

  let digits = text.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  if (!digits.startsWith('62')) digits = `62${digits}`;
  return digits || null;
}

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

  return `POS${stamp}${Math.floor(Math.random() * 90 + 10)}`;
}

async function createTracking(connection, transactionId, status, title, description, userId) {
  await connection.query(
    `INSERT INTO tr_pos_tracking
      (transaction_id, status, title, description, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [transactionId, status, title, description || null, userId || null]
  );
}

async function sendWaMessage(recipient, message) {
  if (!recipient || !message) {
    return { success: false, error: 'Recipient atau message kosong' };
  }

  const payload = {
    session: WA_SESSION,
    to: formatWaRecipient(recipient),
    message,
  };

  const response = await fetch(`${WA_URL}/api/send-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'WA gateway error');
    throw new Error(errorText || `WA gateway ${response.status}`);
  }

  return { success: true };
}

export const getPosServices = async (_req, res) => {
  try {
    const [rows] = await cleanoxPool.query(
      `SELECT
        s.id,
        s.name,
        s.satuan_name,
        s.duration_value,
        s.duration_unit,
        s.status,
        sp.price,
        GROUP_CONCAT(
          DISTINCT CASE
            WHEN p.id IS NOT NULL THEN CONCAT(p.id, '::', p.name, '::', p.promo_type, '::', p.promo_value)
            ELSE NULL
          END
          SEPARATOR '||'
        ) AS promos
      FROM mst_services s
      INNER JOIN mst_service_prices sp ON sp.service_id = s.id
      LEFT JOIN mst_service_promos sps ON sps.service_id = s.id
      LEFT JOIN mst_promos p ON p.id = sps.promo_id AND COALESCE(p.status, 'Aktif') = 'Aktif'
      WHERE COALESCE(s.status, 'Aktif') = 'Aktif'
      GROUP BY s.id, s.name, s.satuan_name, s.duration_value, s.duration_unit, s.status, sp.price
      ORDER BY s.name`
    );

    const services = rows.map((row) => ({
      id: row.id,
      name: row.name,
      satuan_name: row.satuan_name,
      duration_value: row.duration_value,
      duration_unit: row.duration_unit,
      status: row.status,
      price: Number(row.price || 0),
      promos: String(row.promos || '')
        .split('||')
        .filter(Boolean)
        .map((promoText) => {
          const [id, name, promo_type, promo_value] = promoText.split('::');
          return {
            id: Number(id),
            name,
            promo_type,
            promo_value: Number(promo_value || 0),
          };
        }),
    }));

    return res.json({ services });
  } catch (error) {
    console.error('[pos/getPosServices]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil master service POS' });
  }
};

export const getPosWorkers = async (_req, res) => {
  try {
    const [rows] = await aloraPool.query(
      `SELECT employee_id, full_name, phone_number
       FROM mst_employee
       WHERE company_id = 3
         AND exit_date IS NULL
       ORDER BY full_name`
    );

    return res.json({ workers: rows });
  } catch (error) {
    console.error('[pos/getPosWorkers]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil data worker' });
  }
};

export const getPosSummary = async (_req, res) => {
  try {
    const [summaryRows] = await cleanoxPool.query(
      `SELECT
        COUNT(*) AS total_transactions,
        SUM(CASE WHEN status IN ('Draft', 'Menunggu_Konfirmasi') THEN 1 ELSE 0 END) AS incoming_transactions,
        SUM(CASE WHEN status IN ('Dijadwalkan', 'Dalam_Proses') THEN 1 ELSE 0 END) AS active_transactions,
        SUM(CASE WHEN status = 'Selesai' THEN 1 ELSE 0 END) AS completed_transactions,
        COALESCE(SUM(final_amount), 0) AS total_revenue
      FROM tr_pos_transactions`
    );

    const [trackingRows] = await cleanoxPool.query(
      `SELECT status, COUNT(*) AS total
       FROM tr_pos_tracking
       GROUP BY status
       ORDER BY status`
    );

    return res.json({
      summary: {
        ...(summaryRows[0] || {}),
        total_revenue: Number(summaryRows[0]?.total_revenue || 0),
      },
      tracking: trackingRows,
    });
  } catch (error) {
    console.error('[pos/getPosSummary]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil ringkasan POS' });
  }
};

export const getPosTransactions = async (req, res) => {
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();

  try {
    let sql = `
      SELECT
        t.id,
        t.transaction_no,
        t.customer_name,
        t.customer_phone,
        t.service_date,
        t.total_people,
        t.final_amount,
        t.status,
        t.created_at,
        COUNT(DISTINCT i.id) AS total_items,
        COUNT(DISTINCT a.id) AS total_workers
      FROM tr_pos_transactions t
      LEFT JOIN tr_pos_transaction_items i ON i.transaction_id = t.id
      LEFT JOIN tr_pos_worker_assignments a ON a.transaction_id = t.id
      WHERE 1 = 1`;
    const params = [];

    if (search) {
      sql += ` AND (
        t.transaction_no LIKE ?
        OR t.customer_name LIKE ?
        OR COALESCE(t.customer_phone, '') LIKE ?
      )`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status) {
      sql += ` AND t.status = ?`;
      params.push(status);
    }

    sql += `
      GROUP BY
        t.id, t.transaction_no, t.customer_name, t.customer_phone,
        t.service_date, t.total_people, t.final_amount, t.status, t.created_at
      ORDER BY t.created_at DESC`;

    const [rows] = await cleanoxPool.query(sql, params);
    return res.json({
      transactions: rows.map((row) => ({
        ...row,
        final_amount: Number(row.final_amount || 0),
      })),
    });
  } catch (error) {
    console.error('[pos/getPosTransactions]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil daftar transaksi POS' });
  }
};

export const getPosTransactionDetail = async (req, res) => {
  const transactionId = Number(req.params.id);
  if (!transactionId) {
    return res.status(400).json({ message: 'ID transaksi tidak valid' });
  }

  try {
    const [[transaction]] = await cleanoxPool.query(
      `SELECT *
       FROM tr_pos_transactions
       WHERE id = ?`,
      [transactionId]
    );

    if (!transaction) {
      return res.status(404).json({ message: 'Transaksi POS tidak ditemukan' });
    }

    const [items] = await cleanoxPool.query(
      `SELECT
        i.*,
        s.name AS service_name
       FROM tr_pos_transaction_items i
       INNER JOIN mst_services s ON s.id = i.service_id
       WHERE i.transaction_id = ?
       ORDER BY i.id`,
      [transactionId]
    );

    const [assignments] = await cleanoxPool.query(
      `SELECT *
       FROM tr_pos_worker_assignments
       WHERE transaction_id = ?
       ORDER BY assigned_at DESC, id DESC`,
      [transactionId]
    );

    const [tracking] = await cleanoxPool.query(
      `SELECT *
       FROM tr_pos_tracking
       WHERE transaction_id = ?
       ORDER BY created_at DESC, id DESC`,
      [transactionId]
    );

    const [notifications] = await cleanoxPool.query(
      `SELECT *
       FROM tr_pos_notifications
       WHERE transaction_id = ?
       ORDER BY created_at DESC, id DESC`,
      [transactionId]
    );

    return res.json({
      transaction: {
        ...transaction,
        subtotal_amount: Number(transaction.subtotal_amount || 0),
        discount_amount: Number(transaction.discount_amount || 0),
        final_amount: Number(transaction.final_amount || 0),
      },
      items: items.map((item) => ({
        ...item,
        base_price_snapshot: Number(item.base_price_snapshot || 0),
        promo_value_snapshot: item.promo_value_snapshot == null ? null : Number(item.promo_value_snapshot),
        promo_discount_amount: Number(item.promo_discount_amount || 0),
        final_price_snapshot: Number(item.final_price_snapshot || 0),
        line_total: Number(item.line_total || 0),
      })),
      assignments,
      tracking,
      notifications,
    });
  } catch (error) {
    console.error('[pos/getPosTransactionDetail]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil detail transaksi POS' });
  }
};

export const createPosTransaction = async (req, res) => {
  const {
    customer_name,
    customer_phone,
    customer_address,
    service_date,
    total_people,
    notes,
    group_message_template,
    customer_message_template,
    items,
    worker_ids,
  } = req.body;

  if (!customer_name || !service_date || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Customer, tanggal layanan, dan item wajib diisi' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const serviceIds = [...new Set(items.map((item) => Number(item.service_id)).filter(Boolean))];
    const promoIds = [...new Set(items.map((item) => Number(item.promo_id)).filter(Boolean))];

    const [serviceRows] = await connection.query(
      `SELECT s.id, s.name, s.satuan_name, sp.price
       FROM mst_services s
       INNER JOIN mst_service_prices sp ON sp.service_id = s.id
       WHERE s.id IN (${serviceIds.map(() => '?').join(',')})`,
      serviceIds
    );

    const servicesMap = new Map(serviceRows.map((row) => [row.id, row]));
    let promosMap = new Map();

    if (promoIds.length > 0) {
      const [promoRows] = await connection.query(
        `SELECT p.id, p.name, p.promo_type, p.promo_value, sp.service_id
         FROM mst_promos p
         INNER JOIN mst_service_promos sp ON sp.promo_id = p.id
         WHERE p.id IN (${promoIds.map(() => '?').join(',')})`,
        promoIds
      );
      promosMap = new Map(promoRows.map((row) => [`${row.service_id}:${row.id}`, row]));
    }

    let subtotal = 0;
    let discount = 0;
    const normalizedItems = items.map((item) => {
      const service = servicesMap.get(Number(item.service_id));
      if (!service) {
        throw new Error(`Service ${item.service_id} tidak ditemukan`);
      }

      const qty = Math.max(1, Number(item.qty || 1));
      const basePrice = Number(service.price || 0);
      const promo = item.promo_id ? promosMap.get(`${service.id}:${Number(item.promo_id)}`) : null;
      const rawPromoValue = Number(promo?.promo_value || 0);
      const discountPerUnit = promo
        ? promo.promo_type === 'persen'
          ? (basePrice * rawPromoValue) / 100
          : rawPromoValue
        : 0;
      const safeDiscountPerUnit = Math.min(basePrice, discountPerUnit);
      const finalPrice = Math.max(0, basePrice - safeDiscountPerUnit);
      const lineTotal = finalPrice * qty;

      subtotal += basePrice * qty;
      discount += safeDiscountPerUnit * qty;

      return {
        service_id: service.id,
        qty,
        unit_label: item.unit_label || service.satuan_name || null,
        base_price_snapshot: toMoney(basePrice),
        promo_name_snapshot: promo?.name || null,
        promo_type_snapshot: promo?.promo_type || null,
        promo_value_snapshot: promo ? toMoney(rawPromoValue) : null,
        promo_discount_amount: toMoney(safeDiscountPerUnit * qty),
        final_price_snapshot: toMoney(finalPrice),
        line_total: toMoney(lineTotal),
      };
    });

    const finalAmount = subtotal - discount;
    const transactionNo = buildTransactionNo();

    const [result] = await connection.query(
      `INSERT INTO tr_pos_transactions
        (transaction_no, customer_name, customer_phone, customer_address, service_date, total_people,
         subtotal_amount, discount_amount, final_amount, notes, group_message_template,
         customer_message_template, status, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionNo,
        customer_name,
        customer_phone || null,
        customer_address || null,
        service_date,
        Math.max(1, Number(total_people || 1)),
        toMoney(subtotal),
        toMoney(discount),
        toMoney(finalAmount),
        notes || null,
        group_message_template || null,
        customer_message_template || null,
        'Draft',
        req.user?.id || null,
        req.user?.id || null,
      ]
    );

    const transactionId = result.insertId;

    for (const item of normalizedItems) {
      await connection.query(
        `INSERT INTO tr_pos_transaction_items
          (transaction_id, service_id, qty, unit_label, base_price_snapshot, promo_name_snapshot,
           promo_type_snapshot, promo_value_snapshot, promo_discount_amount, final_price_snapshot,
           line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transactionId,
          item.service_id,
          item.qty,
          item.unit_label,
          item.base_price_snapshot,
          item.promo_name_snapshot,
          item.promo_type_snapshot,
          item.promo_value_snapshot,
          item.promo_discount_amount,
          item.final_price_snapshot,
          item.line_total,
        ]
      );
    }

    if (Array.isArray(worker_ids) && worker_ids.length > 0) {
      const uniqueWorkerIds = [...new Set(worker_ids.map((id) => Number(id)).filter(Boolean))];
      const [workers] = await aloraPool.query(
        `SELECT employee_id, full_name
         FROM mst_employee
         WHERE company_id = 3
           AND exit_date IS NULL
           AND employee_id IN (${uniqueWorkerIds.map(() => '?').join(',')})`,
        uniqueWorkerIds
      );

      for (const worker of workers) {
        await connection.query(
          `INSERT INTO tr_pos_worker_assignments
            (transaction_id, employee_id, employee_name, assignment_status)
           VALUES (?, ?, ?, ?)`,
          [transactionId, worker.employee_id, worker.full_name, 'Assigned']
        );
      }
    }

    await createTracking(
      connection,
      transactionId,
      'Created',
      'Transaksi POS dibuat',
      `Transaksi ${transactionNo} dibuat untuk ${customer_name}`,
      req.user?.id
    );

    if (Array.isArray(worker_ids) && worker_ids.length > 0) {
      await createTracking(
        connection,
        transactionId,
        'Assigned',
        'Worker ditugaskan',
        `${worker_ids.length} worker ditambahkan ke transaksi POS`,
        req.user?.id
      );
    }

    await connection.commit();
    return res.status(201).json({
      message: 'Transaksi POS berhasil dibuat',
      transaction_id: transactionId,
      transaction_no: transactionNo,
    });
  } catch (error) {
    await connection.rollback();
    console.error('[pos/createPosTransaction]', error.message);
    return res.status(500).json({ message: error.message || 'Gagal membuat transaksi POS' });
  } finally {
    connection.release();
  }
};

export const updatePosTransactionStatus = async (req, res) => {
  const transactionId = Number(req.params.id);
  const { status, title, description } = req.body;

  if (!transactionId || !status) {
    return res.status(400).json({ message: 'ID transaksi dan status wajib diisi' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `UPDATE tr_pos_transactions
       SET status = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP(0)
       WHERE id = ?`,
      [status, req.user?.id || null, transactionId]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Transaksi POS tidak ditemukan' });
    }

    await createTracking(
      connection,
      transactionId,
      status === 'Dalam_Proses' ? 'In_Progress' : status === 'Selesai' ? 'Completed' : status === 'Dibatalkan' ? 'Cancelled' : 'Scheduled',
      title || `Status diubah ke ${status}`,
      description || null,
      req.user?.id
    );

    await connection.commit();
    return res.json({ message: 'Status transaksi POS berhasil diperbarui' });
  } catch (error) {
    await connection.rollback();
    console.error('[pos/updatePosTransactionStatus]', error.message);
    return res.status(500).json({ message: 'Gagal memperbarui status transaksi POS' });
  } finally {
    connection.release();
  }
};

export const updatePosAssignments = async (req, res) => {
  const transactionId = Number(req.params.id);
  const workerIds = Array.isArray(req.body.worker_ids) ? req.body.worker_ids : [];

  if (!transactionId) {
    return res.status(400).json({ message: 'ID transaksi tidak valid' });
  }

  const uniqueWorkerIds = [...new Set(workerIds.map((id) => Number(id)).filter(Boolean))];
  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query('DELETE FROM tr_pos_worker_assignments WHERE transaction_id = ?', [transactionId]);

    let workers = [];
    if (uniqueWorkerIds.length > 0) {
      const [workerRows] = await aloraPool.query(
        `SELECT employee_id, full_name
         FROM mst_employee
         WHERE company_id = 3
           AND exit_date IS NULL
           AND employee_id IN (${uniqueWorkerIds.map(() => '?').join(',')})`,
        uniqueWorkerIds
      );
      workers = workerRows;

      for (const worker of workers) {
        await connection.query(
          `INSERT INTO tr_pos_worker_assignments
            (transaction_id, employee_id, employee_name, assignment_status)
           VALUES (?, ?, ?, ?)`,
          [transactionId, worker.employee_id, worker.full_name, 'Assigned']
        );
      }
    }

    await createTracking(
      connection,
      transactionId,
      'Assigned',
      'Assignment worker diperbarui',
      workers.length > 0 ? `${workers.length} worker aktif ditetapkan` : 'Seluruh assignment worker dikosongkan',
      req.user?.id
    );

    await connection.commit();
    return res.json({ message: 'Assignment worker berhasil diperbarui' });
  } catch (error) {
    await connection.rollback();
    console.error('[pos/updatePosAssignments]', error.message);
    return res.status(500).json({ message: 'Gagal memperbarui assignment worker' });
  } finally {
    connection.release();
  }
};

export const sendPosGroupNotification = async (req, res) => {
  const transactionId = Number(req.params.id);
  const { recipient, message } = req.body;

  if (!transactionId || !recipient || !message) {
    return res.status(400).json({ message: 'Recipient group dan message wajib diisi' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    await sendWaMessage(recipient, message);

    await connection.query(
      `INSERT INTO tr_pos_notifications
        (transaction_id, channel, recipient, message, delivery_status, sent_at, created_by)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(0), ?)`,
      [transactionId, 'Group', recipient, message, 'Sent', req.user?.id || null]
    );

    await createTracking(
      connection,
      transactionId,
      'Group_Notified',
      'Pesan group terkirim',
      'Admin mengirim notifikasi group untuk transaksi POS',
      req.user?.id
    );

    await connection.commit();
    return res.json({ message: 'Pesan group berhasil dikirim' });
  } catch (error) {
    await connection.rollback();
    console.error('[pos/sendPosGroupNotification]', error.message);
    return res.status(500).json({ message: 'Gagal mengirim pesan group' });
  } finally {
    connection.release();
  }
};

export const sendPosCustomerNotification = async (req, res) => {
  const transactionId = Number(req.params.id);
  const { recipient, message } = req.body;

  if (!transactionId || !message) {
    return res.status(400).json({ message: 'Message customer wajib diisi' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [[transaction]] = await connection.query(
      `SELECT customer_phone
       FROM tr_pos_transactions
       WHERE id = ?`,
      [transactionId]
    );

    const targetRecipient = recipient || transaction?.customer_phone;
    if (!targetRecipient) {
      await connection.rollback();
      return res.status(400).json({ message: 'Nomor customer belum tersedia pada transaksi ini' });
    }

    await sendWaMessage(targetRecipient, message);

    await connection.query(
      `INSERT INTO tr_pos_notifications
        (transaction_id, channel, recipient, message, delivery_status, sent_at, created_by)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(0), ?)`,
      [transactionId, 'Customer', targetRecipient, message, 'Sent', req.user?.id || null]
    );

    await createTracking(
      connection,
      transactionId,
      'Customer_Notified',
      'Pesan customer terkirim',
      'Admin mengirim konfirmasi WhatsApp ke customer',
      req.user?.id
    );

    await connection.commit();
    return res.json({ message: 'Pesan customer berhasil dikirim' });
  } catch (error) {
    await connection.rollback();
    console.error('[pos/sendPosCustomerNotification]', error.message);
    return res.status(500).json({ message: 'Gagal mengirim pesan customer' });
  } finally {
    connection.release();
  }
};
