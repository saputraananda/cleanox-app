import cleanoxPool from '../db/cleanox.js';

export function isBlankAddress(value) {
  if (value == null) return true;
  const text = String(value).trim();
  return text === '' || text === '-';
}

/**
 * Resolve best available legacy address: customer_cleanox.alamat → rekap.alamat_customer.
 * @param {{ idKonsumen?: string|null, name?: string|null, phone?: string|null }} params
 * @param {Function} [queryFn]
 * @returns {Promise<string|null>}
 */
export async function resolveLegacyAddress(
  { idKonsumen = null, name = null, phone = null } = {},
  queryFn = (...args) => cleanoxPool.query(...args)
) {
  const id = idKonsumen ? String(idKonsumen).trim() : '';
  const customerName = name ? String(name).trim() : '';
  const customerPhone = phone ? String(phone).trim() : '';

  if (id) {
    const [rows] = await queryFn(
      `SELECT alamat
       FROM cleanox_smartlink.customer_cleanox
       WHERE id_konsumen = ? AND is_active = 1
       LIMIT 1`,
      [id]
    );
    const alamat = rows[0]?.alamat;
    if (!isBlankAddress(alamat)) {
      return String(alamat).trim();
    }
  }

  const clauses = [];
  const params = [];

  if (customerPhone) {
    clauses.push(
      `(TRIM(COALESCE(r.customer_telepon, '')) <> ''
        AND TRIM(r.customer_telepon) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci)`
    );
    params.push(customerPhone);
  }

  if (customerName) {
    clauses.push(
      `(TRIM(r.customer_nama) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci)`
    );
    params.push(customerName);
  }

  if (id) {
    clauses.push(
      `(TRIM(r.customer_nama) COLLATE utf8mb4_unicode_ci = (
         SELECT TRIM(sl.nama) COLLATE utf8mb4_unicode_ci
         FROM cleanox_smartlink.customer_cleanox sl
         WHERE sl.id_konsumen COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
         LIMIT 1
       ))`
    );
    params.push(id);
  }

  if (!clauses.length) {
    return null;
  }

  const [rekapRows] = await queryFn(
    `SELECT r.alamat_customer
     FROM cleanox_smartlink.rekap_transaksi_reguler r
     WHERE r.is_active = 1
       AND TRIM(COALESCE(r.alamat_customer, '')) <> ''
       AND TRIM(r.alamat_customer) <> '-'
       AND (${clauses.join(' OR ')})
     ORDER BY r.tgl_terima DESC
     LIMIT 1`,
    params
  );

  const fromRekap = rekapRows[0]?.alamat_customer;
  if (!isBlankAddress(fromRekap)) {
    return String(fromRekap).trim();
  }

  return null;
}
