import cleanoxPool, { aloraPool } from '../db/cleanox.js';

export function buildCustomerAddressText({
  street_detail,
  house_number,
  village_name,
  district_name,
  regency_name,
  province_name,
  address_note,
}) {
  const parts = [];
  const street = [street_detail, house_number ? `No. ${house_number}` : null]
    .filter(Boolean)
    .join(' ');
  if (street) parts.push(street);
  if (village_name) parts.push(village_name);
  if (district_name) parts.push(district_name);
  if (regency_name) parts.push(regency_name);
  if (province_name) parts.push(province_name);

  let text = parts.join(', ');
  if (address_note) {
    text = text ? `${text}. Patokan: ${address_note}` : `Patokan: ${address_note}`;
  }
  return text || null;
}

export async function resolveWilayahNames({
  province_id,
  regency_id,
  district_id,
  village_id,
}) {
  const [provinceRows, regencyRows, districtRows, villageRows] = await Promise.all([
    province_id
      ? cleanoxPool.query(`SELECT id, name FROM mst_provinces WHERE id = ? LIMIT 1`, [province_id])
      : Promise.resolve([[]]),
    regency_id
      ? cleanoxPool.query(
          `SELECT id, province_id, name FROM mst_regencies WHERE id = ? LIMIT 1`,
          [regency_id]
        )
      : Promise.resolve([[]]),
    district_id
      ? cleanoxPool.query(
          `SELECT id, regency_id, name FROM mst_districts WHERE id = ? LIMIT 1`,
          [district_id]
        )
      : Promise.resolve([[]]),
    village_id
      ? cleanoxPool.query(
          `SELECT id, district_id, name FROM mst_villages WHERE id = ? LIMIT 1`,
          [village_id]
        )
      : Promise.resolve([[]]),
  ]);

  const province = provinceRows[0]?.[0] || null;
  const regency = regencyRows[0]?.[0] || null;
  const district = districtRows[0]?.[0] || null;
  const village = villageRows[0]?.[0] || null;

  if (regency_id && province_id && regency && Number(regency.province_id) !== Number(province_id)) {
    throw new Error('Kabupaten/kota tidak sesuai dengan provinsi');
  }
  if (district_id && regency_id && district && Number(district.regency_id) !== Number(regency_id)) {
    throw new Error('Kecamatan tidak sesuai dengan kabupaten/kota');
  }
  if (village_id && district_id && village && Number(village.district_id) !== Number(district_id)) {
    throw new Error('Kelurahan tidak sesuai dengan kecamatan');
  }

  return {
    province_name: province?.name || null,
    regency_name: regency?.name || null,
    district_name: district?.name || null,
    village_name: village?.name || null,
  };
}

function toNullableInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toNullableDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  return text || null;
}

async function resolveWaschenReferralEmployee(referralSourceId, referralEmployeeId) {
  let referralSource = null;
  if (referralSourceId) {
    const [refRows] = await cleanoxPool.query(
      `SELECT id, code, name
       FROM mst_referral_sources
       WHERE id = ? AND COALESCE(status, 'Aktif') = 'Aktif'
       LIMIT 1`,
      [referralSourceId]
    );
    if (!refRows.length) {
      throw Object.assign(new Error('Sumber info Cleanox tidak valid'), { status: 400 });
    }
    referralSource = refRows[0];
  }

  const isWaschen = String(referralSource?.code || '').toLowerCase() === 'waschen';

  if (!isWaschen) {
    return {
      referral_source_id: referralSourceId,
      referral_employee_id: null,
      referral_employee_name: null,
    };
  }

  if (!referralEmployeeId) {
    throw Object.assign(new Error('Pegawai Waschen wajib dipilih'), { status: 400 });
  }

  const [empRows] = await aloraPool.query(
    `SELECT employee_id, full_name
     FROM mst_employee
     WHERE employee_id = ?
       AND company_id = 5
       AND exit_date IS NULL
     LIMIT 1`,
    [referralEmployeeId]
  );

  if (!empRows.length) {
    throw Object.assign(new Error('Pegawai Waschen tidak valid atau sudah tidak aktif'), {
      status: 400,
    });
  }

  return {
    referral_source_id: referralSourceId,
    referral_employee_id: Number(empRows[0].employee_id),
    referral_employee_name: empRows[0].full_name || null,
  };
}

export async function normalizeCustomerPayload(body) {
  const name = String(body.name || '').trim();
  if (!name) {
    throw Object.assign(new Error('Nama customer wajib diisi'), { status: 400 });
  }

  const phone = String(body.phone || '').trim() || null;
  const tier =
    body.tier === undefined || body.tier === null || String(body.tier).trim() === ''
      ? null
      : String(body.tier).trim();
  const status = String(body.status || 'Aktif').trim() || 'Aktif';
  const birth_date = toNullableDate(body.birth_date);
  const province_id = toNullableInt(body.province_id);
  const regency_id = toNullableInt(body.regency_id);
  const district_id = toNullableInt(body.district_id);
  const village_id = toNullableInt(body.village_id);
  const house_number = String(body.house_number || '').trim() || null;
  const street_detail = String(body.street_detail || '').trim() || null;
  const address_note = String(body.address_note || '').trim() || null;
  const referral_source_id = toNullableInt(body.referral_source_id);
  const referral_employee_id = toNullableInt(body.referral_employee_id);

  const wilayah = await resolveWilayahNames({
    province_id,
    regency_id,
    district_id,
    village_id,
  });

  const referral = await resolveWaschenReferralEmployee(
    referral_source_id,
    referral_employee_id
  );

  const address = buildCustomerAddressText({
    street_detail,
    house_number,
    address_note,
    ...wilayah,
  });

  return {
    name,
    phone,
    address,
    birth_date,
    province_id,
    regency_id,
    district_id,
    village_id,
    house_number,
    street_detail,
    address_note,
    referral_source_id: referral.referral_source_id,
    referral_employee_id: referral.referral_employee_id,
    referral_employee_name: referral.referral_employee_name,
    tier,
    status,
  };
}

const CUSTOMER_SELECT = `
  c.id,
  c.name,
  c.phone,
  c.address,
  c.birth_date,
  c.province_id,
  c.regency_id,
  c.district_id,
  c.village_id,
  c.house_number,
  c.street_detail,
  c.address_note,
  c.referral_source_id,
  c.referral_employee_id,
  c.referral_employee_name,
  c.tier,
  c.status,
  c.created_at,
  c.updated_at,
  p.name AS province_name,
  r.name AS regency_name,
  d.name AS district_name,
  v.name AS village_name,
  rs.code AS referral_source_code,
  rs.name AS referral_source_name,
  COUNT(t.id) AS transaction_count
`;

const CUSTOMER_JOINS = `
  FROM mst_customers c
  LEFT JOIN mst_provinces p ON p.id = c.province_id
  LEFT JOIN mst_regencies r ON r.id = c.regency_id
  LEFT JOIN mst_districts d ON d.id = c.district_id
  LEFT JOIN mst_villages v ON v.id = c.village_id
  LEFT JOIN mst_referral_sources rs ON rs.id = c.referral_source_id
  LEFT JOIN tr_transactions t ON t.customer_id = c.id
`;

const CUSTOMER_GROUP = `
  c.id, c.name, c.phone, c.address, c.birth_date, c.province_id, c.regency_id, c.district_id,
  c.village_id, c.house_number, c.street_detail, c.address_note, c.referral_source_id,
  c.referral_employee_id, c.referral_employee_name, c.tier,
  c.status, c.created_at, c.updated_at, p.name, r.name, d.name, v.name, rs.code, rs.name
`;

function mapCustomerRow(row) {
  return {
    ...row,
    transaction_count: Number(row.transaction_count || 0),
  };
}

export const getWaschenEmployees = async (_req, res) => {
  try {
    const [rows] = await aloraPool.query(
      `SELECT employee_id, full_name
       FROM mst_employee
       WHERE company_id = 5
         AND exit_date IS NULL
       ORDER BY full_name ASC`
    );
    return res.json({
      employees: rows.map((row) => ({
        employee_id: Number(row.employee_id),
        full_name: row.full_name,
      })),
    });
  } catch (error) {
    console.error('[posCustomers/getWaschenEmployees]', error.message);
    return res.status(500).json({ message: 'Gagal memuat pegawai Waschen' });
  }
};

export const getPosCustomers = async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();
    const params = [];
    const conditions = [];

    if (status) {
      conditions.push(`COALESCE(c.status, 'Aktif') = ?`);
      params.push(status);
    }

    if (search) {
      conditions.push(`(
        c.name LIKE ?
        OR COALESCE(c.phone, '') LIKE ?
        OR COALESCE(c.address, '') LIKE ?
      )`);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await cleanoxPool.query(
      `SELECT ${CUSTOMER_SELECT}
       ${CUSTOMER_JOINS}
       ${where}
       GROUP BY ${CUSTOMER_GROUP}
       ORDER BY c.name ASC`,
      params
    );

    return res.json({ customers: rows.map(mapCustomerRow) });
  } catch (error) {
    console.error('[posCustomers/getPosCustomers]', error.message);
    return res.status(500).json({ message: 'Gagal memuat data customer' });
  }
};

export const getPosCustomerDetail = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'ID customer tidak valid' });
    }

    const [rows] = await cleanoxPool.query(
      `SELECT ${CUSTOMER_SELECT}
       ${CUSTOMER_JOINS}
       WHERE c.id = ?
       GROUP BY ${CUSTOMER_GROUP}
       LIMIT 1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Customer tidak ditemukan' });
    }

    return res.json({ customer: mapCustomerRow(rows[0]) });
  } catch (error) {
    console.error('[posCustomers/getPosCustomerDetail]', error.message);
    return res.status(500).json({ message: 'Gagal memuat detail customer' });
  }
};

export const createPosCustomer = async (req, res) => {
  try {
    const payload = await normalizeCustomerPayload(req.body);

    const [result] = await cleanoxPool.query(
      `INSERT INTO mst_customers
        (name, phone, address, birth_date, province_id, regency_id, district_id, village_id,
         house_number, street_detail, address_note, referral_source_id, referral_employee_id,
         referral_employee_name, tier, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.name,
        payload.phone,
        payload.address,
        payload.birth_date,
        payload.province_id,
        payload.regency_id,
        payload.district_id,
        payload.village_id,
        payload.house_number,
        payload.street_detail,
        payload.address_note,
        payload.referral_source_id,
        payload.referral_employee_id,
        payload.referral_employee_name,
        payload.tier,
        payload.status,
      ]
    );

    return res.status(201).json({
      message: 'Customer berhasil ditambahkan',
      customer: {
        id: result.insertId,
        ...payload,
        transaction_count: 0,
      },
    });
  } catch (error) {
    console.error('[posCustomers/createPosCustomer]', error.message);
    return res.status(error.status || 500).json({
      message: error.message || 'Gagal menambah customer',
    });
  }
};

export const updatePosCustomer = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'ID customer tidak valid' });
    }

    const [existing] = await cleanoxPool.query(
      `SELECT id FROM mst_customers WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!existing.length) {
      return res.status(404).json({ message: 'Customer tidak ditemukan' });
    }

    const payload = await normalizeCustomerPayload(req.body);

    await cleanoxPool.query(
      `UPDATE mst_customers
       SET name = ?, phone = ?, address = ?, birth_date = ?, province_id = ?, regency_id = ?,
           district_id = ?, village_id = ?, house_number = ?, street_detail = ?, address_note = ?,
           referral_source_id = ?, referral_employee_id = ?, referral_employee_name = ?,
           tier = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        payload.name,
        payload.phone,
        payload.address,
        payload.birth_date,
        payload.province_id,
        payload.regency_id,
        payload.district_id,
        payload.village_id,
        payload.house_number,
        payload.street_detail,
        payload.address_note,
        payload.referral_source_id,
        payload.referral_employee_id,
        payload.referral_employee_name,
        payload.tier,
        payload.status,
        id,
      ]
    );

    return res.json({
      message: 'Customer berhasil diperbarui',
      customer: { id, ...payload },
    });
  } catch (error) {
    console.error('[posCustomers/updatePosCustomer]', error.message);
    return res.status(error.status || 500).json({
      message: error.message || 'Gagal memperbarui customer',
    });
  }
};
