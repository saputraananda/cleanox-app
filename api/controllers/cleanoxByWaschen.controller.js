import smartlinkPool from '../db/smartlink.js';

const TRANSAKSI_TABLE = process.env.NODE_ENV === 'development'
  ? 'rekap_transaksi_reguler'
  : 'rekap_transaksi_reguler';

/* ── Get distinct outlets ─────────────────────────────── */
export const getOutlets = async (_req, res) => {
  try {
    const [rows] = await smartlinkPool.query(
      `SELECT DISTINCT outlet
       FROM ${TRANSAKSI_TABLE}
       WHERE outlet IS NOT NULL AND outlet <> ''
       ORDER BY outlet`
    );
    return res.json({ outlets: rows.map((r) => r.outlet) });
  } catch (err) {
    console.error('[getOutlets]', err.message);
    return res.status(500).json({ message: 'Gagal mengambil data outlet' });
  }
};

/* ── Get Cleanox-by-Waschen data ──────────────────────── */
export const getData = async (req, res) => {
  const {
    date_start,
    date_end,
    outlet,
    date_field = 'tgl_terima', // 'tgl_terima' | 'tgl_selesai'
    page = 1,
    limit = 25,
  } = req.query;

  if (!date_start || !date_end) {
    return res.status(400).json({ message: 'Parameter date_start dan date_end wajib diisi' });
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const dateFieldSafe     = date_field === 'tgl_selesai' ? 'tgl_selesai' : 'tgl_terima';
  const outletConditionStats = outlet ? 'AND nf.outlet = ?' : '';
  const outletConditionData  = outlet ? 'AND rtr.outlet = ?' : '';
  const outletParams = outlet ? [outlet] : [];
  const dateParams   = [date_start, date_end];

  const statsQuery = `
    SELECT COUNT(*) AS total, COALESCE(SUM(total_tagihan), 0) AS total_nominal
    FROM (
      SELECT
        no_nota,
        MAX(outlet)        COLLATE utf8mb4_unicode_ci AS outlet,
        MAX(total_tagihan) AS total_tagihan
      FROM ${TRANSAKSI_TABLE}
      WHERE DATE(${dateFieldSafe}) BETWEEN DATE(?) AND DATE(?)
        AND (LOWER(COALESCE(nama_item,'')) LIKE '%cleanox%'
          OR LOWER(COALESCE(nama_item,'')) LIKE '%karpet%')
      GROUP BY no_nota
    ) nf
    WHERE 1=1 ${outletConditionStats}
  `;

  const dataQuery = `
    WITH nota_flag AS (
      SELECT DISTINCT no_nota COLLATE utf8mb4_unicode_ci AS no_nota
      FROM ${TRANSAKSI_TABLE}
      WHERE DATE(${dateFieldSafe}) BETWEEN DATE(?) AND DATE(?)
        AND (LOWER(COALESCE(nama_item,'')) LIKE '%cleanox%'
          OR LOWER(COALESCE(nama_item,'')) LIKE '%karpet%')
    )
    SELECT
      rtr.outlet,
      rtr.no_nota,
      MAX(rtr.customer_nama)  AS customer_nama,
      MAX(rtr.pembuat_nota)   AS pembuat_nota,
      MAX(rtr.tgl_terima)     AS tgl_terima,
      MAX(rtr.tgl_selesai)    AS tgl_selesai,
      MAX(rtr.total_tagihan)  AS nominal_bayar,
      GROUP_CONCAT(DISTINCT rtr.nama_item ORDER BY rtr.nama_item SEPARATOR ', ') AS daftar_item
    FROM nota_flag nf
    JOIN ${TRANSAKSI_TABLE} rtr
      ON rtr.no_nota COLLATE utf8mb4_unicode_ci = nf.no_nota
    WHERE 1=1 ${outletConditionData}
    GROUP BY rtr.outlet, rtr.no_nota
    ORDER BY MAX(rtr.${dateFieldSafe}) DESC, rtr.no_nota DESC
    LIMIT ? OFFSET ?
  `;

  try {
    const [statsResult, dataResult] = await Promise.all([
      smartlinkPool.query(statsQuery, [...dateParams, ...outletParams]),
      smartlinkPool.query(dataQuery,  [...dateParams, ...outletParams, limitNum, offset]),
    ]);

    const total        = Number(statsResult[0][0]?.total        || 0);
    const totalNominal = Number(statsResult[0][0]?.total_nominal || 0);

    return res.json({
      data: dataResult[0],
      stats: { total, totalNominal },
      pagination: {
        total,
        page:       pageNum,
        limit:      limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error('[getData]', err.message);
    return res.status(500).json({ message: 'Gagal mengambil data', error: err.message });
  }
};
