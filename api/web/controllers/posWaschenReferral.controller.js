import cleanoxPool from '../../shared/db/cleanox.js';

export const getWaschenReferralLeaderboard = async (req, res) => {
  const filterType = String(req.query.filter_type || '').trim().toLowerCase();
  const year = Number(req.query.year);
  const month = Number(req.query.month);

  if (!['bulan', 'tahun'].includes(filterType)) {
    return res.status(400).json({ message: 'filter_type wajib: bulan atau tahun' });
  }
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ message: 'Parameter year tidak valid' });
  }
  if (filterType === 'bulan' && (!Number.isFinite(month) || month < 1 || month > 12)) {
    return res.status(400).json({ message: 'Parameter month wajib 1–12 untuk filter bulanan' });
  }

  try {
    const params = [year];
    let periodSql = 'YEAR(t.service_date) = ?';
    if (filterType === 'bulan') {
      periodSql += ' AND MONTH(t.service_date) = ?';
      params.push(month);
    }

    const [rows] = await cleanoxPool.query(
      `SELECT
        grouped.group_key,
        grouped.employee_id,
        grouped.employee_name,
        grouped.customer_count,
        grouped.is_manual
       FROM (
         SELECT
           CASE
             WHEN c.referral_employee_id IS NOT NULL THEN CONCAT('id:', c.referral_employee_id)
             ELSE CONCAT('name:', LOWER(TRIM(c.referral_employee_name)))
           END AS group_key,
           MAX(c.referral_employee_id) AS employee_id,
           COALESCE(
             MAX(CASE WHEN c.referral_employee_id IS NOT NULL THEN c.referral_employee_name END),
             MAX(c.referral_employee_name)
           ) AS employee_name,
           COUNT(DISTINCT c.id) AS customer_count,
           MAX(CASE WHEN c.referral_employee_id IS NULL THEN 1 ELSE 0 END) AS is_manual
         FROM mst_customers c
         INNER JOIN mst_referral_sources rs ON rs.id = c.referral_source_id
         INNER JOIN tr_transactions t ON t.customer_id = c.id
         WHERE rs.code = 'waschen'
           AND (
             c.referral_employee_id IS NOT NULL
             OR (
               c.referral_employee_name IS NOT NULL
               AND TRIM(c.referral_employee_name) <> ''
             )
           )
           AND t.status <> 'Cancelled'
           AND ${periodSql}
         GROUP BY
           CASE
             WHEN c.referral_employee_id IS NOT NULL THEN CONCAT('id:', c.referral_employee_id)
             ELSE CONCAT('name:', LOWER(TRIM(c.referral_employee_name)))
           END
         HAVING customer_count > 0
       ) grouped
       ORDER BY grouped.customer_count DESC, grouped.employee_name ASC`,
      params
    );

    const mapped = rows.map((row) => ({
      group_key: row.group_key,
      employee_id: row.employee_id == null ? null : Number(row.employee_id),
      employee_name: row.employee_name,
      customer_count: Number(row.customer_count || 0),
      is_manual: Boolean(Number(row.is_manual || 0)),
    }));

    return res.json({
      filter: {
        filter_type: filterType,
        year,
        month: filterType === 'bulan' ? month : null,
      },
      rows: mapped,
      total_customers: mapped.reduce((sum, row) => sum + row.customer_count, 0),
    });
  } catch (error) {
    console.error('[posWaschenReferral/leaderboard]', error.message);
    return res.status(500).json({ message: 'Gagal memuat leaderboard referral Waschen' });
  }
};
