import smartlinkPool from '../db/smartlink.js';

/* ── Get distinct outlets ─────────────────────────────── */
export const getOutlets = async (_req, res) => {
  try {
    const [rows] = await smartlinkPool.query(
      `SELECT DISTINCT outlet
       FROM rekap_transaksi_reguler
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
    date_field = 'tgl_terima', // 'tgl_terima' | 'waktu_pembayaran'
    page = 1,
    limit = 25,
  } = req.query;

  if (!date_start || !date_end) {
    return res.status(400).json({ message: 'Parameter date_start dan date_end wajib diisi' });
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const dateFieldSafe = date_field === 'waktu_pembayaran' ? 'waktu_pembayaran' : 'tgl_terima';
  const outletCondition = outlet ? 'AND nf.outlet = ?' : '';
  const outletConditionPpn = outlet ? 'AND ppn.outlet = ?' : '';
  const outletParams = outlet ? [outlet] : [];
  const dateParams = [date_start, date_end];

  /* ── Queries by date_field ────────────────────────────── */
  let statsQuery, statsParams, dataQuery, dataParams;

  if (dateFieldSafe === 'tgl_terima') {
    // Filter by tgl_terima: find cleanox notas in period, then look up payments
    statsQuery = `
      WITH nota_flag AS (
          SELECT
              rtr.no_nota    COLLATE utf8mb4_unicode_ci AS no_nota,
              MAX(rtr.outlet) COLLATE utf8mb4_unicode_ci AS outlet,
              MAX(CASE
                  WHEN LOWER(COALESCE(rtr.nama_item,'')) LIKE '%cleanox%'
                    OR LOWER(COALESCE(rtr.nama_item,'')) LIKE '%karpet%'
                  THEN 1 ELSE 0
              END) AS is_cleanox
          FROM rekap_transaksi_reguler rtr
          WHERE DATE(rtr.tgl_terima) BETWEEN DATE(?) AND DATE(?)
          GROUP BY 1
          HAVING is_cleanox = 1
      ),
      ppn AS (
          SELECT
              nf.outlet,
              nf.no_nota,
              SUM(rtrp.nominal_bayar) AS nominal_bayar
          FROM nota_flag nf
          JOIN rekap_transaksi_reguler_pembayaran rtrp
            ON rtrp.no_nota COLLATE utf8mb4_unicode_ci = nf.no_nota
          WHERE rtrp.jenis_bayar <> 'e-money'
          GROUP BY 1, 2
      )
      SELECT COUNT(*) AS total, COALESCE(SUM(ppn.nominal_bayar),0) AS total_nominal
      FROM ppn WHERE 1=1 ${outletConditionPpn}
    `;
    statsParams = [...dateParams, ...outletParams];

    dataQuery = `
      WITH nota_flag AS (
          SELECT
              rtr.no_nota    COLLATE utf8mb4_unicode_ci AS no_nota,
              MAX(rtr.outlet) COLLATE utf8mb4_unicode_ci AS outlet,
              MAX(rtr.customer_nama)  AS customer_nama,
              MAX(rtr.tgl_terima)     AS tgl_terima,
              MAX(rtr.tgl_selesai)    AS tgl_selesai,
              MAX(rtr.pembuat_nota)   AS pembuat_nota,
              GROUP_CONCAT(DISTINCT rtr.nama_item ORDER BY rtr.nama_item SEPARATOR ', ') AS daftar_item,
              MAX(CASE
                  WHEN LOWER(COALESCE(rtr.nama_item,'')) LIKE '%cleanox%'
                    OR LOWER(COALESCE(rtr.nama_item,'')) LIKE '%karpet%'
                  THEN 1 ELSE 0
              END) AS is_cleanox
          FROM rekap_transaksi_reguler rtr
          WHERE DATE(rtr.tgl_terima) BETWEEN DATE(?) AND DATE(?)
          GROUP BY 1
          HAVING is_cleanox = 1
      ),
      ppn AS (
          SELECT
              nf.no_nota,
              MIN(rtrp.waktu_pembayaran) AS waktu_pembayaran,
              SUM(rtrp.nominal_bayar)    AS nominal_bayar
          FROM nota_flag nf
          JOIN rekap_transaksi_reguler_pembayaran rtrp
            ON rtrp.no_nota COLLATE utf8mb4_unicode_ci = nf.no_nota
          WHERE rtrp.jenis_bayar <> 'e-money'
          GROUP BY 1
      )
      SELECT
          nf.outlet,
          nf.no_nota,
          nf.customer_nama,
          nf.pembuat_nota,
          nf.tgl_terima,
          nf.tgl_selesai,
          ppn.waktu_pembayaran,
          ppn.nominal_bayar,
          nf.daftar_item
      FROM nota_flag nf
      LEFT JOIN ppn ON ppn.no_nota = nf.no_nota
      WHERE 1=1 ${outletConditionPpn}
      ORDER BY nf.outlet, nf.tgl_terima, nf.no_nota
      LIMIT ? OFFSET ?
    `;
    dataParams = [...dateParams, ...outletParams, limitNum, offset];
  } else {
    // Filter by waktu_pembayaran (original behaviour)
    statsQuery = `
      WITH ppn AS (
          SELECT
              rtrp.outlet   COLLATE utf8mb4_unicode_ci AS outlet,
              rtrp.no_nota  COLLATE utf8mb4_unicode_ci AS no_nota,
              SUM(rtrp.nominal_bayar) AS nominal_bayar
          FROM rekap_transaksi_reguler_pembayaran rtrp
          WHERE DATE(rtrp.waktu_pembayaran) BETWEEN DATE(?) AND DATE(?)
            AND rtrp.jenis_bayar <> 'e-money'
          GROUP BY 1, 2
      ),
      nota_flag AS (
          SELECT rtr.no_nota COLLATE utf8mb4_unicode_ci AS no_nota,
              MAX(CASE
                  WHEN LOWER(COALESCE(rtr.nama_item,'')) LIKE '%cleanox%'
                    OR LOWER(COALESCE(rtr.nama_item,'')) LIKE '%karpet%'
                  THEN 1 ELSE 0
              END) AS is_cleanox
          FROM rekap_transaksi_reguler rtr GROUP BY 1
      )
      SELECT COUNT(*) AS total, COALESCE(SUM(ppn.nominal_bayar),0) AS total_nominal
      FROM ppn LEFT JOIN nota_flag nf ON ppn.no_nota = nf.no_nota
      WHERE COALESCE(nf.is_cleanox,0) = 1 ${outletConditionPpn}
    `;
    statsParams = [...dateParams, ...outletParams];

    dataQuery = `
      WITH ppn AS (
          SELECT
              rtrp.outlet   COLLATE utf8mb4_unicode_ci AS outlet,
              rtrp.no_nota  COLLATE utf8mb4_unicode_ci AS no_nota,
              MIN(rtrp.waktu_pembayaran) AS waktu_pembayaran,
              SUM(rtrp.nominal_bayar)    AS nominal_bayar
          FROM rekap_transaksi_reguler_pembayaran rtrp
          WHERE DATE(rtrp.waktu_pembayaran) BETWEEN DATE(?) AND DATE(?)
            AND rtrp.jenis_bayar <> 'e-money'
          GROUP BY 1, 2
      ),
      nota_flag AS (
          SELECT rtr.no_nota COLLATE utf8mb4_unicode_ci AS no_nota,
              MAX(CASE
                  WHEN LOWER(COALESCE(rtr.nama_item,'')) LIKE '%cleanox%'
                    OR LOWER(COALESCE(rtr.nama_item,'')) LIKE '%karpet%'
                  THEN 1 ELSE 0
              END) AS is_cleanox
          FROM rekap_transaksi_reguler rtr GROUP BY 1
      ),
      ni AS (
          SELECT rtr.no_nota COLLATE utf8mb4_unicode_ci AS no_nota,
              MAX(rtr.customer_nama)  AS customer_nama,
              MAX(rtr.tgl_terima)     AS tgl_terima,
              MAX(rtr.tgl_selesai)    AS tgl_selesai,
              MAX(rtr.pembuat_nota)   AS pembuat_nota,
              GROUP_CONCAT(DISTINCT rtr.nama_item ORDER BY rtr.nama_item SEPARATOR ', ') AS daftar_item
          FROM rekap_transaksi_reguler rtr GROUP BY 1
      )
      SELECT ppn.outlet, ppn.no_nota, ni.customer_nama, ni.pembuat_nota,
             ni.tgl_terima, ni.tgl_selesai, ppn.waktu_pembayaran,
             ppn.nominal_bayar, ni.daftar_item
      FROM ppn
      LEFT JOIN nota_flag nf ON ppn.no_nota = nf.no_nota
      LEFT JOIN ni ON ppn.no_nota = ni.no_nota
      WHERE COALESCE(nf.is_cleanox,0) = 1 ${outletConditionPpn}
      ORDER BY ppn.outlet, ppn.waktu_pembayaran, ppn.no_nota
      LIMIT ? OFFSET ?
    `;
    dataParams = [...dateParams, ...outletParams, limitNum, offset];
  }

  try {
    const [statsResult, dataResult] = await Promise.all([
      smartlinkPool.query(statsQuery, statsParams),
      smartlinkPool.query(dataQuery, dataParams),
    ]);

    const total = Number(statsResult[0][0]?.total || 0);
    const totalNominal = Number(statsResult[0][0]?.total_nominal || 0);

    return res.json({
      data: dataResult[0],
      stats: { total, totalNominal },
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error('[getData]', err.message);
    return res.status(500).json({ message: 'Gagal mengambil data', error: err.message });
  }
};
