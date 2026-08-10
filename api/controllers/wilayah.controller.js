import cleanoxPool from '../db/cleanox.js';

export const getProvinces = async (_req, res) => {
  try {
    const [rows] = await cleanoxPool.query(
      `SELECT id, code, name
       FROM mst_provinces
       ORDER BY name ASC`
    );
    return res.json({ provinces: rows });
  } catch (error) {
    console.error('[wilayah/getProvinces]', error.message);
    return res.status(500).json({ message: 'Gagal memuat provinsi' });
  }
};

export const getRegencies = async (req, res) => {
  try {
    const provinceId = Number(req.query.province_id);
    if (!provinceId) {
      return res.status(400).json({ message: 'province_id wajib diisi' });
    }

    const [rows] = await cleanoxPool.query(
      `SELECT id, province_id, code, name, type
       FROM mst_regencies
       WHERE province_id = ?
       ORDER BY name ASC`,
      [provinceId]
    );
    return res.json({ regencies: rows });
  } catch (error) {
    console.error('[wilayah/getRegencies]', error.message);
    return res.status(500).json({ message: 'Gagal memuat kabupaten/kota' });
  }
};

export const getDistricts = async (req, res) => {
  try {
    const regencyId = Number(req.query.regency_id);
    if (!regencyId) {
      return res.status(400).json({ message: 'regency_id wajib diisi' });
    }

    const [rows] = await cleanoxPool.query(
      `SELECT id, regency_id, code, name
       FROM mst_districts
       WHERE regency_id = ?
       ORDER BY name ASC`,
      [regencyId]
    );
    return res.json({ districts: rows });
  } catch (error) {
    console.error('[wilayah/getDistricts]', error.message);
    return res.status(500).json({ message: 'Gagal memuat kecamatan' });
  }
};

export const getVillages = async (req, res) => {
  try {
    const districtId = Number(req.query.district_id);
    if (!districtId) {
      return res.status(400).json({ message: 'district_id wajib diisi' });
    }

    const [rows] = await cleanoxPool.query(
      `SELECT id, district_id, code, name
       FROM mst_villages
       WHERE district_id = ?
       ORDER BY name ASC`,
      [districtId]
    );
    return res.json({ villages: rows });
  } catch (error) {
    console.error('[wilayah/getVillages]', error.message);
    return res.status(500).json({ message: 'Gagal memuat kelurahan' });
  }
};

export const getReferralSources = async (_req, res) => {
  try {
    const [rows] = await cleanoxPool.query(
      `SELECT id, code, name, status, sort_order
       FROM mst_referral_sources
       WHERE COALESCE(status, 'Aktif') = 'Aktif'
       ORDER BY sort_order ASC, name ASC`
    );
    return res.json({ referral_sources: rows });
  } catch (error) {
    console.error('[wilayah/getReferralSources]', error.message);
    return res.status(500).json({ message: 'Gagal memuat sumber info' });
  }
};
