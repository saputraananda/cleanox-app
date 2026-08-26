import cleanoxPool from '../../shared/db/cleanox.js';
import { normalizeCoretPrice } from '../../shared/utils/posServicePrice.js';

const DURATION_UNITS = new Set(['jam', 'hari', 'minggu', 'bulan']);
const STATUS_VALUES = new Set(['Aktif', 'Nonaktif']);
const PROMO_TYPES = new Set(['persen', 'nominal']);

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeStatus(value, fallback = 'Aktif') {
  const status = String(value || fallback).trim();
  return STATUS_VALUES.has(status) ? status : fallback;
}

export const listCategories = async (_req, res) => {
  try {
    const [rows] = await cleanoxPool.query(
      `SELECT id, name FROM mst_category ORDER BY name ASC`
    );
    return res.json({ categories: rows });
  } catch (error) {
    console.error('[pos-master/listCategories]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil kategori' });
  }
};

export const listServices = async (req, res) => {
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  const categoryId = req.query.category_id ? Number(req.query.category_id) : null;

  try {
    let sql = `
      SELECT
        s.id,
        s.name,
        s.category_id,
        c.name AS category_name,
        s.satuan_name,
        s.duration_value,
        s.duration_unit,
        s.status,
        sp.price,
        sp.coret_price,
        sp.updated_at AS price_updated_at,
        s.created_at,
        s.updated_at
      FROM mst_services s
      LEFT JOIN mst_category c ON c.id = s.category_id
      LEFT JOIN mst_service_prices sp ON sp.service_id = s.id
      WHERE 1 = 1`;
    const params = [];

    if (search) {
      sql += ` AND s.name LIKE ?`;
      params.push(`%${search}%`);
    }
    if (status && STATUS_VALUES.has(status)) {
      sql += ` AND COALESCE(s.status, 'Aktif') = ?`;
      params.push(status);
    }
    if (categoryId) {
      sql += ` AND s.category_id = ?`;
      params.push(categoryId);
    }

    sql += ` ORDER BY s.name ASC`;

    const [rows] = await cleanoxPool.query(sql, params);
    return res.json({
      services: rows.map((row) => ({
        ...row,
        price: row.price == null ? null : Number(row.price),
        coret_price: row.coret_price == null ? null : Number(row.coret_price),
      })),
    });
  } catch (error) {
    console.error('[pos-master/listServices]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil daftar service' });
  }
};

async function upsertServicePrice(connection, serviceId, price, coretPrice) {
  const money = toMoney(price);
  const coret =
    coretPrice == null ? null : toMoney(coretPrice);
  await connection.query(
    `INSERT INTO mst_service_prices (service_id, price, coret_price, created_at, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0))
     ON DUPLICATE KEY UPDATE
       price = VALUES(price),
       coret_price = VALUES(coret_price),
       updated_at = CURRENT_TIMESTAMP(0)`,
    [serviceId, money, coret]
  );
  return money;
}

function parseServiceBody(body) {
  const name = String(body?.name || '').trim();
  const price = Number(body?.price);
  const category_id =
    body?.category_id === '' || body?.category_id == null ? null : Number(body.category_id);
  const satuan_name = String(body?.satuan_name || '').trim() || null;
  const duration_value =
    body?.duration_value === '' || body?.duration_value == null
      ? null
      : Number(body.duration_value);
  const duration_unit_raw = String(body?.duration_unit || '').trim();
  const duration_unit = duration_unit_raw
    ? DURATION_UNITS.has(duration_unit_raw)
      ? duration_unit_raw
      : null
    : null;
  const status = normalizeStatus(body?.status);
  const coretParsed = normalizeCoretPrice(body?.coret_price);

  if (!name) return { error: 'Nama service wajib diisi' };
  if (!Number.isFinite(price) || price < 0) return { error: 'Harga tidak valid' };
  if (coretParsed.error) return { error: coretParsed.error };
  if (duration_value != null && (!Number.isFinite(duration_value) || duration_value < 0)) {
    return { error: 'Durasi tidak valid' };
  }
  if (duration_unit_raw && !duration_unit) {
    return { error: 'Satuan durasi tidak valid' };
  }
  if (category_id != null && !Number.isFinite(category_id)) {
    return { error: 'Kategori tidak valid' };
  }

  return {
    data: {
      name,
      price,
      coret_price: coretParsed.value,
      category_id,
      satuan_name,
      duration_value,
      duration_unit,
      status,
    },
  };
}

export const createService = async (req, res) => {
  const parsed = parseServiceBody(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    if (parsed.data.category_id) {
      const [[cat]] = await connection.query(`SELECT id FROM mst_category WHERE id = ? LIMIT 1`, [
        parsed.data.category_id,
      ]);
      if (!cat) {
        await connection.rollback();
        return res.status(400).json({ message: 'Kategori tidak ditemukan' });
      }
    }

    const [result] = await connection.query(
      `INSERT INTO mst_services
        (name, price, satuan_name, category_id, duration_value, duration_unit, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0))`,
      [
        parsed.data.name,
        toMoney(parsed.data.price),
        parsed.data.satuan_name,
        parsed.data.category_id,
        parsed.data.duration_value,
        parsed.data.duration_unit,
        parsed.data.status,
      ]
    );

    const serviceId = result.insertId;
    await upsertServicePrice(
      connection,
      serviceId,
      parsed.data.price,
      parsed.data.coret_price
    );
    await connection.commit();

    return res.status(201).json({ message: 'Service berhasil dibuat', id: serviceId });
  } catch (error) {
    await connection.rollback();
    console.error('[pos-master/createService]', error.message);
    return res.status(500).json({ message: 'Gagal membuat service' });
  } finally {
    connection.release();
  }
};

export const updateService = async (req, res) => {
  const serviceId = Number(req.params.id);
  if (!serviceId) return res.status(400).json({ message: 'ID service tidak valid' });

  const parsed = parseServiceBody(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [[existing]] = await connection.query(
      `SELECT id FROM mst_services WHERE id = ? LIMIT 1`,
      [serviceId]
    );
    if (!existing) {
      await connection.rollback();
      return res.status(404).json({ message: 'Service tidak ditemukan' });
    }

    if (parsed.data.category_id) {
      const [[cat]] = await connection.query(`SELECT id FROM mst_category WHERE id = ? LIMIT 1`, [
        parsed.data.category_id,
      ]);
      if (!cat) {
        await connection.rollback();
        return res.status(400).json({ message: 'Kategori tidak ditemukan' });
      }
    }

    await connection.query(
      `UPDATE mst_services
       SET name = ?,
           price = ?,
           satuan_name = ?,
           category_id = ?,
           duration_value = ?,
           duration_unit = ?,
           status = ?,
           updated_at = CURRENT_TIMESTAMP(0)
       WHERE id = ?`,
      [
        parsed.data.name,
        toMoney(parsed.data.price),
        parsed.data.satuan_name,
        parsed.data.category_id,
        parsed.data.duration_value,
        parsed.data.duration_unit,
        parsed.data.status,
        serviceId,
      ]
    );

    await upsertServicePrice(
      connection,
      serviceId,
      parsed.data.price,
      parsed.data.coret_price
    );
    await connection.commit();

    return res.json({ message: 'Service berhasil diperbarui' });
  } catch (error) {
    await connection.rollback();
    console.error('[pos-master/updateService]', error.message);
    return res.status(500).json({ message: 'Gagal memperbarui service' });
  } finally {
    connection.release();
  }
};

export const listPromos = async (req, res) => {
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();

  try {
    let sql = `
      SELECT
        p.id,
        p.name,
        p.promo_type,
        p.promo_value,
        p.description,
        p.status,
        p.created_at,
        p.updated_at,
        COUNT(sp.id) AS service_count
      FROM mst_promos p
      LEFT JOIN mst_service_promos sp ON sp.promo_id = p.id
      WHERE 1 = 1`;
    const params = [];

    if (search) {
      sql += ` AND p.name LIKE ?`;
      params.push(`%${search}%`);
    }
    if (status && STATUS_VALUES.has(status)) {
      sql += ` AND COALESCE(p.status, 'Aktif') = ?`;
      params.push(status);
    }

    sql += `
      GROUP BY
        p.id, p.name, p.promo_type, p.promo_value, p.description,
        p.status, p.created_at, p.updated_at
      ORDER BY p.name ASC`;

    const [rows] = await cleanoxPool.query(sql, params);
    return res.json({
      promos: rows.map((row) => ({
        ...row,
        promo_value: Number(row.promo_value || 0),
        service_count: Number(row.service_count || 0),
      })),
    });
  } catch (error) {
    console.error('[pos-master/listPromos]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil daftar promo' });
  }
};

export const getPromoDetail = async (req, res) => {
  const promoId = Number(req.params.id);
  if (!promoId) return res.status(400).json({ message: 'ID promo tidak valid' });

  try {
    const [[promo]] = await cleanoxPool.query(
      `SELECT id, name, promo_type, promo_value, description, status, created_at, updated_at
       FROM mst_promos WHERE id = ? LIMIT 1`,
      [promoId]
    );
    if (!promo) return res.status(404).json({ message: 'Promo tidak ditemukan' });

    const [links] = await cleanoxPool.query(
      `SELECT service_id FROM mst_service_promos WHERE promo_id = ?`,
      [promoId]
    );

    return res.json({
      promo: {
        ...promo,
        promo_value: Number(promo.promo_value || 0),
        service_ids: links.map((row) => Number(row.service_id)),
      },
    });
  } catch (error) {
    console.error('[pos-master/getPromoDetail]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil detail promo' });
  }
};

function parsePromoBody(body) {
  const name = String(body?.name || '').trim();
  const promo_type = String(body?.promo_type || '').trim();
  const promo_value = Number(body?.promo_value);
  const description = String(body?.description || '').trim() || null;
  const status = normalizeStatus(body?.status);
  const service_ids = Array.isArray(body?.service_ids)
    ? [...new Set(body.service_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))]
    : [];

  if (!name) return { error: 'Nama promo wajib diisi' };
  if (!PROMO_TYPES.has(promo_type)) return { error: 'Tipe promo tidak valid' };
  if (!Number.isFinite(promo_value) || promo_value <= 0) {
    return { error: 'Nilai promo harus lebih dari 0' };
  }
  if (promo_type === 'persen' && promo_value > 100) {
    return { error: 'Promo persen maksimal 100' };
  }

  return {
    data: {
      name,
      promo_type,
      promo_value: toMoney(promo_value),
      description,
      status,
      service_ids,
    },
  };
}

async function replacePromoServices(connection, promoId, serviceIds) {
  if (serviceIds.length > 0) {
    const [existing] = await connection.query(
      `SELECT id FROM mst_services WHERE id IN (${serviceIds.map(() => '?').join(',')})`,
      serviceIds
    );
    if (existing.length !== serviceIds.length) {
      throw new Error('SERVICE_IDS_INVALID');
    }
  }

  await connection.query(`DELETE FROM mst_service_promos WHERE promo_id = ?`, [promoId]);

  for (const serviceId of serviceIds) {
    await connection.query(
      `INSERT INTO mst_service_promos (service_id, promo_id, created_at, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0))`,
      [serviceId, promoId]
    );
  }
}

export const createPromo = async (req, res) => {
  const parsed = parsePromoBody(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO mst_promos
        (name, promo_type, promo_value, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0))`,
      [
        parsed.data.name,
        parsed.data.promo_type,
        parsed.data.promo_value,
        parsed.data.description,
        parsed.data.status,
      ]
    );

    const promoId = result.insertId;
    await replacePromoServices(connection, promoId, parsed.data.service_ids);
    await connection.commit();

    return res.status(201).json({ message: 'Promo berhasil dibuat', id: promoId });
  } catch (error) {
    await connection.rollback();
    if (error.message === 'SERVICE_IDS_INVALID') {
      return res.status(400).json({ message: 'Ada service_id yang tidak valid' });
    }
    console.error('[pos-master/createPromo]', error.message);
    return res.status(500).json({ message: 'Gagal membuat promo' });
  } finally {
    connection.release();
  }
};

export const updatePromo = async (req, res) => {
  const promoId = Number(req.params.id);
  if (!promoId) return res.status(400).json({ message: 'ID promo tidak valid' });

  const parsed = parsePromoBody(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [[existing]] = await connection.query(
      `SELECT id FROM mst_promos WHERE id = ? LIMIT 1`,
      [promoId]
    );
    if (!existing) {
      await connection.rollback();
      return res.status(404).json({ message: 'Promo tidak ditemukan' });
    }

    await connection.query(
      `UPDATE mst_promos
       SET name = ?,
           promo_type = ?,
           promo_value = ?,
           description = ?,
           status = ?,
           updated_at = CURRENT_TIMESTAMP(0)
       WHERE id = ?`,
      [
        parsed.data.name,
        parsed.data.promo_type,
        parsed.data.promo_value,
        parsed.data.description,
        parsed.data.status,
        promoId,
      ]
    );

    await replacePromoServices(connection, promoId, parsed.data.service_ids);
    await connection.commit();

    return res.json({ message: 'Promo berhasil diperbarui' });
  } catch (error) {
    await connection.rollback();
    if (error.message === 'SERVICE_IDS_INVALID') {
      return res.status(400).json({ message: 'Ada service_id yang tidak valid' });
    }
    console.error('[pos-master/updatePromo]', error.message);
    return res.status(500).json({ message: 'Gagal memperbarui promo' });
  } finally {
    connection.release();
  }
};

export const listPaymentMethods = async (req, res) => {
  const isActiveRaw = req.query.is_active;
  try {
    let sql = `
      SELECT
        id,
        \`group\` AS method_group,
        code,
        name,
        label,
        is_active
      FROM mst_payment_method
      WHERE 1 = 1`;
    const params = [];

    if (isActiveRaw !== undefined && isActiveRaw !== '') {
      sql += ` AND is_active = ?`;
      params.push(Number(isActiveRaw) ? 1 : 0);
    }

    sql += ` ORDER BY FIELD(\`group\`, 'Tunai', 'BCA', 'EDC'), id ASC`;

    const [rows] = await cleanoxPool.query(sql, params);
    return res.json({
      data: rows.map((row) => ({
        ...row,
        is_active: Boolean(Number(row.is_active)),
      })),
    });
  } catch (error) {
    console.error('[pos-master/listPaymentMethods]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil metode pembayaran' });
  }
};
