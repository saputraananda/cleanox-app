import { smartlinkPool, cleanoxPool, cleanoxSmartlinkPool } from '../db/cleanox.js';

function getJakartaDate() {
    const now = new Date();
    const jktOffset = 7 * 60; // UTC+7 in minutes
    return new Date(now.getTime() + (jktOffset + now.getTimezoneOffset()) * 60 * 1000);
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export const getAvailablePeriods = async (req, res) => {
    try {
        const [rows] = await smartlinkPool.query(
            `SELECT DISTINCT
         CASE
           WHEN DAY(tgl_terima) >= 26 THEN
             CASE WHEN MONTH(tgl_terima) = 12 THEN YEAR(tgl_terima) + 1 ELSE YEAR(tgl_terima) END
           ELSE YEAR(tgl_terima)
         END AS yr,
         CASE
           WHEN DAY(tgl_terima) >= 26 THEN
             CASE WHEN MONTH(tgl_terima) = 12 THEN 1 ELSE MONTH(tgl_terima) + 1 END
           ELSE MONTH(tgl_terima)
         END AS mo
       FROM rekap_transaksi_reguler
       WHERE tgl_terima IS NOT NULL
         AND (LOWER(COALESCE(nama_item,'')) LIKE '%cleanox%'
           OR LOWER(COALESCE(nama_item,'')) LIKE '%karpet%')
       ORDER BY yr DESC, mo DESC`
        );

        const jktTime = getJakartaDate();
        const jktDate = jktTime.getDate();
        const jktMonth = jktTime.getMonth() + 1;
        const jktYear = jktTime.getFullYear();

        let activeMonth, activeYear;
        if (jktDate >= 26) {
            if (jktMonth === 12) {
                activeMonth = 1;
                activeYear = jktYear + 1;
            } else {
                activeMonth = jktMonth + 1;
                activeYear = jktYear;
            }
        } else {
            activeMonth = jktMonth;
            activeYear = jktYear;
        }

        const exists = rows.some(r => Number(r.yr) === activeYear && Number(r.mo) === activeMonth);
        if (!exists) {
            rows.push({ yr: activeYear, mo: activeMonth });
            rows.sort((a, b) => b.yr - a.yr || b.mo - a.mo);
        }

        const [outletRows] = await smartlinkPool.query(
            `SELECT DISTINCT outlet FROM target_sales WHERE outlet IS NOT NULL AND outlet <> '' ORDER BY outlet`
        );
        const outlets = outletRows.map(r => r.outlet);

        return res.json({ periods: rows, outlets });
    } catch (err) {
        console.error('[dashboardCleanox/getAvailablePeriods]', err.message);
        return res.status(500).json({ message: 'Gagal mengambil data periode', error: err.message });
    }
};

export const getDashboardData = async (req, res) => {
    const { filterType, year, month, startDate, endDate } = req.query;

    let date_start, date_end;
    let target_start_ym, target_end_ym;
    let Y = null, M = null;

    if (filterType === 'rentang') {
        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Parameter startDate dan endDate wajib diisi untuk filter rentang' });
        }
        date_start = startDate;
        date_end = endDate;

        const startD = new Date(startDate);
        const endD = new Date(endDate);
        target_start_ym = startD.getFullYear() * 100 + (startD.getMonth() + 1);
        target_end_ym = endD.getFullYear() * 100 + (endD.getMonth() + 1);
    } else if (filterType === 'tahun') {
        if (!year) {
            return res.status(400).json({ message: 'Parameter year wajib diisi untuk filter tahun' });
        }
        Y = parseInt(year, 10);
        if (isNaN(Y)) {
            return res.status(400).json({ message: 'Format year tidak valid' });
        }
        date_start = `${Y}-01-01`;
        date_end = `${Y}-12-31`;
        target_start_ym = Y * 100 + 1;
        target_end_ym = Y * 100 + 12;
    } else {
        // default / 'bulan' (billing period)
        if (!year || !month) {
            return res.status(400).json({ message: 'Parameter year dan month wajib diisi' });
        }

        Y = parseInt(year, 10);
        M = parseInt(month, 10);
        if (isNaN(Y) || isNaN(M) || M < 1 || M > 12) {
            return res.status(400).json({ message: 'Format year atau month tidak valid' });
        }

        let startYear = Y;
        let startMonth = M - 1;
        if (startMonth === 0) {
            startMonth = 12;
            startYear = Y - 1;
        }
        date_start = `${startYear}-${String(startMonth).padStart(2, '0')}-26`;
        date_end = `${Y}-${String(M).padStart(2, '0')}-25`;
        target_start_ym = Y * 100 + M;
        target_end_ym = Y * 100 + M;
    }

    // Parse selected outlets
    let selectedOutlets = [];
    if (req.query.outlets) {
        if (Array.isArray(req.query.outlets)) {
            selectedOutlets = req.query.outlets;
        } else if (typeof req.query.outlets === 'string') {
            selectedOutlets = req.query.outlets.split(',').map(s => s.trim()).filter(Boolean);
        }
    }

    const todayJktStr = formatDate(getJakartaDate());

    let as_of_date = date_end;
    if (todayJktStr >= date_start && todayJktStr <= date_end) {
        as_of_date = todayJktStr;
    }

    let connection;
    try {
        connection = await smartlinkPool.getConnection();

        // Set variables
        await connection.query('SET @date_start = ?', [date_start]);
        await connection.query('SET @date_end = ?', [date_end]);
        await connection.query('SET @as_of_date = ?', [as_of_date]);
        await connection.query('SET @target_start_ym = ?', [target_start_ym]);
        await connection.query('SET @target_end_ym = ?', [target_end_ym]);

        // Query 1: Rekap Performa Penjualan Utama Per Outlet (Omzet Reguler + E-Money + Target)
        const query1 = `
      WITH param AS (
          SELECT
              CURDATE() AS today,
              STR_TO_DATE(@as_of_date, '%Y-%m-%d') AS as_of_date,
              STR_TO_DATE(@date_start, '%Y-%m-%d') AS date_start,
              STR_TO_DATE(@date_end, '%Y-%m-%d') AS date_end,
              STR_TO_DATE(@as_of_date, '%Y-%m-%d') AS yesterday
      ),
      reguler_daily AS (
          SELECT rtrp.outlet COLLATE utf8mb4_unicode_ci AS outlet,
                 DATE(rtrp.waktu_pembayaran) AS tanggal,
                 SUM(rtrp.nominal_bayar) AS total_bayar
          FROM rekap_transaksi_reguler_pembayaran rtrp
          JOIN param p ON DATE(rtrp.waktu_pembayaran) BETWEEN p.date_start AND p.as_of_date
          WHERE rtrp.jenis_bayar <> 'e-money'
            AND rtrp.no_nota NOT IN (
              'JDS250308134809893','JRC250412083723856','LKZ250422142258203','QSE250429084550314','POS250430090223407',
              'MDR250430160351857','TSI250501092607556','YOX250501094449877','PWX250501094618850','CAY250501162309243',
              'AIR250502165019925','VYO250504101231388','BPZ250505153114890','YNZ250506084550029','LPA250509104354921',
              'JKM250509133602454','ATR250509155731919','UVN250509155937609','COZ250510085855458','KCE250510092127311',
              'PPR250511104248281','ULX250511141125683','CPD250511150921365','MSB250512102328567','YSS250512142214977',
              'ESY250514094634398','VOE250514104206010','NPA250514134849617','KIZ250514150134296','RJR250514150240950',
              'VBJ250521105035645','WSL250612090231990','XND250612090410209','ESZ250622092835859','VRB250705145607387',
              'WNP250707092257535','ZQN250707095003871','ZQG250723150341368','SNR250726152557061','ZTZ250819164141353',
              'MLL250911095440273','OXI250916160645735','TYO250919133458354','OSD250919135615402','QGC250927143951995',
              'FGH251010145932475','EYF251013085108373','VPA251015090406450','LIZ251019134650581','DOT251027093136503',
              'ORC251027100046038','KZZ251119154110977'
            )
            AND NOT EXISTS (
                  SELECT 1 FROM rekap_transaksi_reguler rtr
                  WHERE rtr.no_nota = rtrp.no_nota
                    AND rtr.outlet LIKE '%legenda%'
                    AND (rtr.nama_item LIKE '%haji%' OR rtr.customer_nama LIKE '%haji%')
            )
          GROUP BY outlet, tanggal
      ),
      emoney_daily AS (
          SELECT rpe.outlet COLLATE utf8mb4_unicode_ci AS outlet,
                 DATE(rpe.tanggal_beli) AS tanggal,
                 SUM(rpe.grand_total) AS total_saldo
          FROM rekap_pembelian_emoney rpe
          JOIN param p ON DATE(rpe.tanggal_beli) BETWEEN p.date_start AND p.as_of_date
          GROUP BY outlet, tanggal
      ),
      combined_daily AS (
          SELECT outlet, tanggal, SUM(total) AS total_revenue
          FROM (
              SELECT outlet, tanggal, total_bayar AS total FROM reguler_daily
              UNION ALL
              SELECT outlet, tanggal, total_saldo AS total FROM emoney_daily
          ) x
          GROUP BY outlet, tanggal
      ),
      actual AS (
          SELECT outlet, SUM(total_revenue) AS actual_sales FROM combined_daily GROUP BY outlet
      ),
      actual_yesterday AS (
          SELECT cd.outlet, SUM(cd.total_revenue) AS actual_hari_ini
          FROM combined_daily cd
          JOIN param p ON cd.tanggal = p.as_of_date
          GROUP BY cd.outlet
      ),
      paid_invoices AS (
          SELECT rtrp.outlet COLLATE utf8mb4_unicode_ci AS outlet,
                 rtrp.no_nota COLLATE utf8mb4_unicode_ci AS no_nota,
                 rtrp.nominal_bayar
          FROM rekap_transaksi_reguler_pembayaran rtrp
          JOIN param p ON DATE(rtrp.waktu_pembayaran) BETWEEN p.date_start AND p.as_of_date
          WHERE rtrp.jenis_bayar <> 'e-money'
            AND rtrp.no_nota NOT IN (
              'JDS250308134809893','JRC250412083723856','LKZ250422142258203','QSE250429084550314','POS250430090223407',
              'MDR250430160351857','TSI250501092607556','YOX250501094449877','PWX250501094618850','CAY250501162309243',
              'AIR250502165019925','VYO250504101231388','BPZ250505153114890','YNZ250506084550029','LPA250509104354921',
              'JKM250509133602454','ATR250509155731919','UVN250509155937609','COZ250510085855458','KCE250510092127311',
              'PPR250511104248281','ULX250511141125683','CPD250511150921365','MSB250512102328567','YSS250512142214977',
              'ESY250514094634398','VOE250514104206010','NPA250514134849617','KIZ250514150134296','RJR250514150240950',
              'VBJ250521105035645','WSL250612090231990','XND250612090410209','ESZ250622092835859','VRB250705145607387',
              'WNP250707092257535','ZQN250707095003871','ZQG250723150341368','SNR250726152557061','ZTZ250819164141353',
              'MLL250911095440273','OXI250916160645735','TYO250919133458354','OSD250919135615402','QGC250927143951995',
              'FGH251010145932475','EYF251013085108373','VPA251015090406450','LIZ251019134650581','DOT251027093136503',
              'ORC251027100046038','KZZ251119154110977'
            )
            AND NOT EXISTS (
                  SELECT 1 FROM rekap_transaksi_reguler rtr2
                  WHERE rtr2.no_nota = rtrp.no_nota
                    AND rtr2.outlet LIKE '%legenda%'
                    AND (rtr2.nama_item LIKE '%haji%' OR rtr2.customer_nama LIKE '%haji%')
            )
      ),
      nota_flag AS (
          SELECT
              rtr.no_nota COLLATE utf8mb4_unicode_ci AS no_nota,
              MAX(
                  CASE
                      WHEN LOWER(COALESCE(rtr.nama_item, '')) LIKE '%cleanox%'
                        OR LOWER(COALESCE(rtr.nama_item, '')) LIKE '%karpet%'
                      THEN 1 ELSE 0
                  END
              ) AS is_cleanox
          FROM rekap_transaksi_reguler rtr
          WHERE rtr.no_nota COLLATE utf8mb4_unicode_ci IN (SELECT no_nota FROM paid_invoices)
          GROUP BY 1
      ),
      cleanox_actual AS (
          SELECT
              pi.outlet,
              SUM(pi.nominal_bayar) AS cleanox_sales
          FROM paid_invoices pi
          JOIN nota_flag nf ON pi.no_nota = nf.no_nota
          WHERE nf.is_cleanox = 1
          GROUP BY 1
      ),
      active_transactions AS (
          SELECT r.customer_nama, r.outlet, DATE(r.tgl_terima) AS tgl_terima
          FROM rekap_transaksi_reguler r
          JOIN param p ON r.tgl_terima >= p.date_start
            AND r.tgl_terima < p.as_of_date + INTERVAL 1 DAY
          WHERE r.nama_item NOT LIKE '%haji%'
      ),
      customer_activity AS (
          SELECT c.nama AS customer_nama, 
                 c.outlet COLLATE utf8mb4_unicode_ci AS outlet,
                 CASE WHEN c.terdaftar_sejak >= p.date_start THEN 'Pelanggan Baru' ELSE 'Pelanggan Lama' END AS status_pelanggan,
                 COUNT(DISTINCT t.tgl_terima) AS jumlah_hari_transaksi
          FROM customer c
          JOIN param p ON 1=1
          JOIN active_transactions t ON c.nama = t.customer_nama
          WHERE c.nama NOT LIKE '%dumm%' AND c.nama NOT LIKE '%tes%'
            AND c.nama NOT LIKE '%haiyun%' AND c.nama NOT LIKE '%kiyalalala%'
            AND c.nama NOT LIKE '%puspaaa%' AND c.nama NOT LIKE '%haji%'
          GROUP BY c.nama, c.outlet, status_pelanggan
      ),
      customer_segment AS (
          SELECT outlet, status_pelanggan,
                 CASE WHEN jumlah_hari_transaksi >= 4 THEN 'Loyal'
                      WHEN jumlah_hari_transaksi >= 2 THEN 'Regular'
                      ELSE 'One Time' END AS segmentasi
          FROM customer_activity
      ),
      customer_segment_counts AS (
          SELECT outlet,
                 SUM(segmentasi='Loyal')              AS loyal_count,
                 SUM(segmentasi='Regular')            AS regular_count,
                 SUM(segmentasi='One Time')           AS one_time_count,
                 SUM(status_pelanggan='Pelanggan Baru') AS new_customer_count
          FROM customer_segment
          GROUP BY outlet
      ),
      target_period AS (
          SELECT ts.outlet, SUM(ts.nominal) AS nominal
          FROM target_sales ts
          WHERE (ts.tahun * 100 + ts.bulan) BETWEEN @target_start_ym AND @target_end_ym
          GROUP BY ts.outlet
      )
      SELECT
          t.outlet,
          DATEDIFF(p.as_of_date, p.date_start)+1 AS date_count,
          DATEDIFF(p.date_end,   p.date_start)+1 AS total_day,
          ROUND(((DATEDIFF(p.as_of_date,p.date_start)+1)/(DATEDIFF(p.date_end,p.date_start)+1))*100,2) AS persen_target_kumulatif,
          ((DATEDIFF(p.as_of_date,p.date_start)+1)/(DATEDIFF(p.date_end,p.date_start)+1))*t.nominal     AS target_kumulatif_sales,
          t.nominal                                                                                       AS target_bulanan,
          COALESCE(a.actual_sales,0)                                                                      AS actual_sales,
          COALESCE(ay.actual_hari_ini,0)                                                                  AS actual_hari_ini,
          COALESCE(a.actual_sales,0) - (((DATEDIFF(p.as_of_date,p.date_start)+1)/(DATEDIFF(p.date_end,p.date_start)+1))*t.nominal) AS gap_nominal,
          ROUND((COALESCE(a.actual_sales,0)/NULLIF(t.nominal,0))*100,2)                                  AS persen_actual,
          ROUND(((COALESCE(a.actual_sales,0)/NULLIF(t.nominal,0))-((DATEDIFF(p.as_of_date,p.date_start)+1)/(DATEDIFF(p.date_end,p.date_start)+1)))*100,2) AS persen_gap,
          COALESCE(ca.cleanox_sales,0)       AS cleanox_sales,
          COALESCE(csc.loyal_count,0)        AS loyal_count,
          COALESCE(csc.regular_count,0)      AS regular_count,
          COALESCE(csc.one_time_count,0)     AS one_time_count,
          COALESCE(csc.new_customer_count,0) AS new_customer_count
      FROM param p
      CROSS JOIN target_period t
      LEFT JOIN actual               a   ON a.outlet   COLLATE utf8mb4_unicode_ci = t.outlet COLLATE utf8mb4_unicode_ci
      LEFT JOIN actual_yesterday     ay  ON ay.outlet  COLLATE utf8mb4_unicode_ci = t.outlet COLLATE utf8mb4_unicode_ci
      LEFT JOIN cleanox_actual       ca  ON ca.outlet  COLLATE utf8mb4_unicode_ci = t.outlet COLLATE utf8mb4_unicode_ci
      LEFT JOIN customer_segment_counts csc ON csc.outlet COLLATE utf8mb4_unicode_ci = t.outlet COLLATE utf8mb4_unicode_ci
      ORDER BY t.outlet;
    `;

        // Query 2: Detil Transaksi Cleanox By Waschen (Daftar Nota)
        const query2 = `
      WITH param AS (
          SELECT DATE(@date_start) AS date_start, DATE(@date_end) AS date_end
      ),
      payment_per_nota AS (
          SELECT
              rtrp.outlet COLLATE utf8mb4_unicode_ci AS outlet,
              rtrp.no_nota COLLATE utf8mb4_unicode_ci AS no_nota,
              MIN(rtrp.waktu_pembayaran) AS waktu_pembayaran,
              SUM(rtrp.nominal_bayar)    AS nominal_bayar
          FROM rekap_transaksi_reguler_pembayaran rtrp
          JOIN param p ON DATE(rtrp.waktu_pembayaran) BETWEEN p.date_start AND p.date_end
          WHERE rtrp.jenis_bayar <> 'e-money'
            AND rtrp.no_nota NOT IN (
              'JDS250308134809893','JRC250412083723856','LKZ250422142258203','QSE250429084550314','POS250430090223407',
              'MDR250430160351857','TSI250501092607556','YOX250501094449877','PWX250501094618850','CAY250501162309243',
              'AIR250502165019925','VYO250504101231388','BPZ250505153114890','YNZ250506084550029','LPA250509104354921',
              'JKM250509133602454','ATR250509155731919','UVN250509155937609','COZ250510085855458','KCE250510092127311',
              'PPR250511104248281','ULX250511141125683','CPD250511150921365','MSB250512102328567','YSS250512142214977',
              'ESY250514094634398','VOE250514104206010','NPA250514134849617','KIZ250514150134296','RJR250514150240950',
              'VBJ250521105035645','WSL250612090231990','XND250612090410209','ESZ250622092835859','VRB250705145607387',
              'WNP250707092257535','ZQN250707095003871','ZQG250723150341368','SNR250726152557061','ZTZ250819164141353',
              'MLL250911095440273','OXI250916160645735','TYO250919133458354','OSD250919135615402','QGC250927143951995',
              'FGH251010145932475','EYF251013085108373','VPA251015090406450','LIZ251019134650581','DOT251027093136503',
              'ORC251027100046038','KZZ251119154110977'
            )
          GROUP BY 1, 2
      ),
      nota_flag AS (
          SELECT
              rtr.no_nota COLLATE utf8mb4_unicode_ci AS no_nota,
              MAX(CASE
                  WHEN LOWER(COALESCE(rtr.nama_item,'')) LIKE '%cleanox%'
                    OR LOWER(COALESCE(rtr.nama_item,'')) LIKE '%karpet%'
                  THEN 1 ELSE 0
              END) AS is_cleanox
          FROM rekap_transaksi_reguler rtr
          WHERE rtr.no_nota COLLATE utf8mb4_unicode_ci IN (SELECT no_nota FROM payment_per_nota)
          GROUP BY 1
      ),
      nota_info AS (
          SELECT
              rtr.no_nota COLLATE utf8mb4_unicode_ci AS no_nota,
              MAX(rtr.customer_nama)  AS customer_nama,
              MAX(rtr.outlet)         AS outlet_nota,
              MAX(rtr.tgl_terima)     AS tgl_terima,
              MAX(rtr.tgl_selesai)    AS tgl_selesai,
              MAX(rtr.pembuat_nota)   AS pembuat_nota,
              GROUP_CONCAT(DISTINCT rtr.nama_item ORDER BY rtr.nama_item SEPARATOR ', ') AS daftar_item
          FROM rekap_transaksi_reguler rtr
          WHERE rtr.no_nota COLLATE utf8mb4_unicode_ci IN (SELECT no_nota FROM payment_per_nota)
          GROUP BY 1
      )
      SELECT
          ppn.outlet,
          ppn.no_nota,
          ni.customer_nama,
          ni.pembuat_nota,
          ni.tgl_terima,
          ni.tgl_selesai,
          ppn.waktu_pembayaran,
          ppn.nominal_bayar,
          ni.daftar_item
      FROM payment_per_nota ppn
      LEFT JOIN nota_flag nf ON ppn.no_nota = nf.no_nota
      LEFT JOIN nota_info ni ON ppn.no_nota = ni.no_nota
      WHERE COALESCE(nf.is_cleanox, 0) = 1
      ORDER BY ppn.outlet, ppn.waktu_pembayaran, ppn.no_nota;
    `;

        // Query 5: Trend Penjualan Harian (Total Sales Per Hari, grouped by outlet)
        const query5 = `
      SELECT
          DATE(tanggal) AS tanggal,
          outlet,
          SUM(total)    AS sales
      FROM (
          SELECT rtrp.outlet COLLATE utf8mb4_unicode_ci AS outlet,
                 DATE(rtrp.waktu_pembayaran) AS tanggal,
                 SUM(rtrp.nominal_bayar)     AS total
          FROM rekap_transaksi_reguler_pembayaran rtrp
          WHERE DATE(rtrp.waktu_pembayaran) BETWEEN @date_start AND @as_of_date
            AND rtrp.jenis_bayar <> 'e-money'
            AND rtrp.no_nota NOT IN (
              'JDS250308134809893','JRC250412083723856','LKZ250422142258203','QSE250429084550314','POS250430090223407',
              'MDR250430160351857','TSI250501092607556','YOX250501094449877','PWX250501094618850','CAY250501162309243',
              'AIR250502165019925','VYO250504101231388','BPZ250505153114890','YNZ250506084550029','LPA250509104354921',
              'JKM250509133602454','ATR250509155731919','UVN250509155937609','COZ250510085855458','KCE250510092127311',
              'PPR250511104248281','ULX250511141125683','CPD250511150921365','MSB250512102328567','YSS250512142214977',
              'ESY250514094634398','VOE250514104206010','NPA250514134849617','KIZ250514150134296','RJR250514150240950',
              'VBJ250521105035645','WSL250612090231990','XND250612090410209','ESZ250622092835859','VRB250705145607387',
              'WNP250707092257535','ZQN250707095003871','ZQG250723150341368','SNR250726152557061','ZTZ250819164141353',
              'MLL250911095440273','OXI250916160645735','TYO250919133458354','OSD250919135615402','QGC250927143951995',
              'FGH251010145932475','EYF251013085108373','VPA251015090406450','LIZ251019134650581','DOT251027093136503',
              'ORC251027100046038','KZZ251119154110977'
            )
            AND NOT EXISTS (
                  SELECT 1 FROM rekap_transaksi_reguler rtr
                  WHERE rtr.no_nota = rtrp.no_nota
                    AND rtr.outlet LIKE '%legenda%'
                    AND (rtr.nama_item LIKE '%haji%' OR rtr.customer_nama LIKE '%haji%')
            )
          GROUP BY outlet, tanggal
          UNION ALL
          SELECT rpe.outlet COLLATE utf8mb4_unicode_ci AS outlet,
                 DATE(rpe.tanggal_beli) AS tanggal,
                 SUM(rpe.grand_total)   AS total
          FROM rekap_pembelian_emoney rpe
          WHERE DATE(rpe.tanggal_beli) BETWEEN @date_start AND @as_of_date
          GROUP BY outlet, tanggal
      ) x
      GROUP BY tanggal, outlet
      ORDER BY tanggal;
    `;

        // Query 6: Trend Penjualan Waschen-Only (Tanpa Cleanox & Karpet, grouped by outlet)
        const query6 = `
      SELECT
          DATE(tanggal) AS tanggal,
          outlet,
          SUM(total)    AS sales
      FROM (
          SELECT rtrp.outlet COLLATE utf8mb4_unicode_ci AS outlet,
                 DATE(rtrp.waktu_pembayaran) AS tanggal,
                 SUM(rtrp.nominal_bayar)     AS total
          FROM rekap_transaksi_reguler_pembayaran rtrp
          LEFT JOIN (
              SELECT rtr2.no_nota COLLATE utf8mb4_unicode_ci AS no_nota,
                     MAX(CASE
                         WHEN LOWER(COALESCE(rtr2.nama_item,'')) LIKE '%cleanox%'
                           OR LOWER(COALESCE(rtr2.nama_item,'')) LIKE '%karpet%'
                         THEN 1 ELSE 0 END) AS is_cleanox
              FROM rekap_transaksi_reguler rtr2
              WHERE rtr2.no_nota COLLATE utf8mb4_unicode_ci IN (
                  SELECT no_nota FROM rekap_transaksi_reguler_pembayaran 
                  WHERE DATE(waktu_pembayaran) BETWEEN @date_start AND @as_of_date
              )
              GROUP BY rtr2.no_nota
          ) nf ON rtrp.no_nota COLLATE utf8mb4_unicode_ci = nf.no_nota
          WHERE DATE(rtrp.waktu_pembayaran) BETWEEN @date_start AND @as_of_date
            AND rtrp.jenis_bayar <> 'e-money'
            AND rtrp.no_nota NOT IN (
              'JDS250308134809893','JRC250412083723856','LKZ250422142258203','QSE250429084550314','POS250430090223407',
              'MDR250430160351857','TSI250501092607556','YOX250501094449877','PWX250501094618850','CAY250501162309243',
              'AIR250502165019925','VYO250504101231388','BPZ250505153114890','YNZ250506084550029','LPA250509104354921',
              'JKM250509133602454','ATR250509155731919','UVN250509155937609','COZ250510085855458','KCE250510092127311',
              'PPR250511104248281','ULX250511141125683','CPD250511150921365','MSB250512102328567','YSS250512142214977',
              'ESY250514094634398','VOE250514104206010','NPA250514134849617','KIZ250514150134296','RJR250514150240950',
              'VBJ250521105035645','WSL250612090231990','XND250612090410209','ESZ250622092835859','VRB250705145607387',
              'WNP250707092257535','ZQN250707095003871','ZQG250723150341368','SNR250726152557061','ZTZ250819164141353',
              'MLL250911095440273','OXI250916160645735','TYO250919133458354','OSD250919135615402','QGC250927143951995',
              'FGH251010145932475','EYF251013085108373','VPA251015090406450','LIZ251019134650581','DOT251027093136503',
              'ORC251027100046038','KZZ251119154110977'
            )
            AND COALESCE(nf.is_cleanox, 0) = 0
            AND NOT EXISTS (
                  SELECT 1 FROM rekap_transaksi_reguler rtr
                  WHERE rtr.no_nota = rtrp.no_nota
                    AND rtr.outlet LIKE '%legenda%'
                    AND (rtr.nama_item LIKE '%haji%' OR rtr.customer_nama LIKE '%haji%')
            )
          GROUP BY outlet, tanggal
          UNION ALL
          SELECT rpe.outlet COLLATE utf8mb4_unicode_ci AS outlet,
                 DATE(rpe.tanggal_beli) AS tanggal,
                 SUM(rpe.grand_total)   AS total
          FROM rekap_pembelian_emoney rpe
          WHERE DATE(rpe.tanggal_beli) BETWEEN @date_start AND @as_of_date
          GROUP BY outlet, tanggal
      ) x
      GROUP BY tanggal, outlet
      ORDER BY tanggal;
    `;

        // Query 7: Cleanox Only – Breakdown Tunai vs Non-Tunai per Outlet
        // Matches reference SQL exactly: uses full @date_end (not @as_of_date) and 'E-money' casing.
        // Executed directly on cleanoxSmartlinkPool using query parameters instead of session variables.
        const query7 = `
      SELECT
          rtrp.outlet COLLATE utf8mb4_unicode_ci AS outlet,
          SUM(CASE WHEN rtrp.jenis_bayar = 'Tunai' THEN rtrp.nominal_bayar ELSE 0 END)     AS tunai,
          SUM(CASE WHEN rtrp.jenis_bayar <> 'Tunai' THEN rtrp.nominal_bayar ELSE 0 END)    AS non_tunai,
          SUM(rtrp.nominal_bayar)                                                           AS total
      FROM rekap_transaksi_reguler_pembayaran rtrp
      WHERE rtrp.customer_nama NOT LIKE '%KMP%'
        AND DATE(rtrp.waktu_pembayaran) BETWEEN ? AND ?
        AND rtrp.jenis_bayar <> 'E-money'
        AND NOT EXISTS (
            SELECT 1 FROM rekap_transaksi_reguler rtr2
            WHERE rtr2.no_nota COLLATE utf8mb4_unicode_ci = rtrp.no_nota COLLATE utf8mb4_unicode_ci
              AND rtr2.nama_item LIKE '%(KMP)%'
        )
      GROUP BY rtrp.outlet COLLATE utf8mb4_unicode_ci
      ORDER BY total DESC;
    `;

        // Query 8: Cleanox Only – Detil Transaksi (Daftar Nota beserta Item Layanan)
        const query8 = `
      SELECT
          rtrp.no_nota COLLATE utf8mb4_unicode_ci AS no_nota,
          rtrp.customer_nama,
          rtrp.outlet COLLATE utf8mb4_unicode_ci AS outlet,
          rtrp.waktu_pembayaran,
          rtrp.jenis_bayar,
          rtrp.nominal_bayar,
          GROUP_CONCAT(DISTINCT rtr.nama_item ORDER BY rtr.nama_item SEPARATOR ', ') AS daftar_item
      FROM rekap_transaksi_reguler_pembayaran rtrp
      LEFT JOIN rekap_transaksi_reguler rtr ON rtr.no_nota COLLATE utf8mb4_unicode_ci = rtrp.no_nota COLLATE utf8mb4_unicode_ci
      WHERE rtrp.customer_nama NOT LIKE '%KMP%'
        AND DATE(rtrp.waktu_pembayaran) BETWEEN ? AND ?
        AND rtrp.jenis_bayar <> 'E-money'
        AND NOT EXISTS (
            SELECT 1 FROM rekap_transaksi_reguler rtr2
            WHERE rtr2.no_nota COLLATE utf8mb4_unicode_ci = rtrp.no_nota COLLATE utf8mb4_unicode_ci
              AND rtr2.nama_item LIKE '%(KMP)%'
        )
      GROUP BY rtrp.no_nota COLLATE utf8mb4_unicode_ci, rtrp.customer_nama, rtrp.outlet, rtrp.waktu_pembayaran, rtrp.jenis_bayar, rtrp.nominal_bayar
      ORDER BY rtrp.waktu_pembayaran DESC;
    `;

        const [performanceRows] = await connection.query(query1);
        const [detailRows] = await connection.query(query2);
        const [dailyTotalRows] = await connection.query(query5);
        const [dailyWaschenOnlyRows] = await connection.query(query6);
        const [cleanoxOnlyBreakdownRows] = await cleanoxSmartlinkPool.query(query7, [date_start, date_end]);
        const [cleanoxOnlyDetailsRows] = await cleanoxSmartlinkPool.query(query8, [date_start, date_end]);

        // Filter outputs based on selectedOutlets in JavaScript
        let performanceFiltered = performanceRows;
        let detailsFiltered = detailRows;
        let dailyTotalFiltered = dailyTotalRows;
        let dailyWaschenFiltered = dailyWaschenOnlyRows;
        let cleanoxOnlyBreakdownFiltered = cleanoxOnlyBreakdownRows;
        let cleanoxOnlyDetailsFiltered = cleanoxOnlyDetailsRows;

        if (selectedOutlets.length > 0) {
            performanceFiltered = performanceRows.filter(row => selectedOutlets.includes(row.outlet));
            detailsFiltered = detailRows.filter(row => selectedOutlets.includes(row.outlet));
            dailyTotalFiltered = dailyTotalRows.filter(row => selectedOutlets.includes(row.outlet));
            dailyWaschenFiltered = dailyWaschenOnlyRows.filter(row => selectedOutlets.includes(row.outlet));
            cleanoxOnlyBreakdownFiltered = cleanoxOnlyBreakdownRows.filter(row => selectedOutlets.includes(row.outlet));
            cleanoxOnlyDetailsFiltered = cleanoxOnlyDetailsRows.filter(row => selectedOutlets.includes(row.outlet));
        }

        // Aggregate daily trends by date after filtering
        const dailyTotalAggregatedMap = {};
        dailyTotalFiltered.forEach(row => {
            const dateStr = row.tanggal instanceof Date ? row.tanggal.toISOString().split('T')[0] : String(row.tanggal);
            if (!dailyTotalAggregatedMap[dateStr]) {
                dailyTotalAggregatedMap[dateStr] = { tanggal: dateStr, sales: 0 };
            }
            dailyTotalAggregatedMap[dateStr].sales += Number(row.sales || 0);
        });
        const dailyTotalAggregated = Object.values(dailyTotalAggregatedMap).sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));

        const dailyWaschenAggregatedMap = {};
        dailyWaschenFiltered.forEach(row => {
            const dateStr = row.tanggal instanceof Date ? row.tanggal.toISOString().split('T')[0] : String(row.tanggal);
            if (!dailyWaschenAggregatedMap[dateStr]) {
                dailyWaschenAggregatedMap[dateStr] = { tanggal: dateStr, sales: 0 };
            }
            dailyWaschenAggregatedMap[dateStr].sales += Number(row.sales || 0);
        });
        const dailyWaschenAggregated = Object.values(dailyWaschenAggregatedMap).sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));

        // Compute summary KPIs dynamically
        const total_nota = detailsFiltered.length;
        const total_omzet = detailsFiltered.reduce((sum, r) => sum + Number(r.nominal_bayar || 0), 0);
        const jatah_70 = total_omzet * 0.70;
        const jatah_30 = total_omzet * 0.30;
        const avg_per_nota = total_nota > 0 ? total_omzet / total_nota : 0;
        const summary = { total_nota, total_omzet, jatah_70, jatah_30, avg_per_nota };

        // Compute cashier leaderboard dynamically
        const cashierMap = {};
        detailsFiltered.forEach(row => {
            const key = (row.pembuat_nota || '').trim() || 'Tidak Diketahui';
            if (!cashierMap[key]) {
                cashierMap[key] = {
                    pembuat_nota: key,
                    total_nota: 0,
                    total_omzet: 0,
                    jatah_waschen: 0
                };
            }
            cashierMap[key].total_nota += 1;
            cashierMap[key].total_omzet += Number(row.nominal_bayar || 0);
            cashierMap[key].jatah_waschen = cashierMap[key].total_omzet * 0.30;
        });
        const cashierRows = Object.values(cashierMap).sort((a, b) => b.total_nota - a.total_nota || b.total_omzet - a.total_omzet);

        // Compute cleanox-only totals for grand total row
        const cleanoxTotalTunai = cleanoxOnlyBreakdownFiltered.reduce((s, r) => s + Number(r.tunai || 0), 0);
        const cleanoxTotalNonTunai = cleanoxOnlyBreakdownFiltered.reduce((s, r) => s + Number(r.non_tunai || 0), 0);
        const cleanoxTotalAll = cleanoxOnlyBreakdownFiltered.reduce((s, r) => s + Number(r.total || 0), 0);

        // Realisasi Target = Total Cleanox Only + Jatah 70% Cleanox dari Waschen
        // jatah_70 is total_omzet (Waschen) * 0.70 computed earlier
        const cleanoxRealisasiTotal = cleanoxTotalAll + jatah_70;

        // Query mst_target_cleanox from cleanoxPool (different DB)
        let cleanoxTargetNominal = 0;
        try {
            let targetSql = `SELECT COALESCE(SUM(nominal), 0) AS target_nominal FROM mst_target_cleanox WHERE (tahun * 100 + bulan) BETWEEN ? AND ?`;
            const targetParams = [target_start_ym, target_end_ym];

            // If specific outlets selected, sum only those outlets' targets; otherwise sum all (outlet IS NULL = global)
            if (selectedOutlets.length > 0) {
                const placeholders = selectedOutlets.map(() => '?').join(',');
                targetSql += ` AND (outlet IN (${placeholders}) OR outlet IS NULL OR outlet = '')`;
                targetParams.push(...selectedOutlets);
            }

            const [targetRows] = await cleanoxPool.query(targetSql, targetParams);
            cleanoxTargetNominal = Number(targetRows[0]?.target_nominal || 0);
        } catch (targetErr) {
            console.warn('[dashboardCleanox/target-query-warn]', targetErr.message);
        }

        const cleanoxTargetPct = cleanoxTargetNominal > 0
            ? (cleanoxRealisasiTotal / cleanoxTargetNominal) * 100
            : 0;

        return res.json({
            period: {
                year: Y,
                month: M,
                date_start,
                date_end,
                as_of_date,
                target_start_ym,
                target_end_ym,
            },
            performance: performanceFiltered,
            details: detailsFiltered,
            summary,
            cashier: cashierRows,
            trends: {
                total: dailyTotalAggregated,
                waschenOnly: dailyWaschenAggregated
            },
            cleanoxOnlyBreakdown: {
                rows: cleanoxOnlyBreakdownFiltered.map(r => ({
                    outlet: r.outlet,
                    tunai: Number(r.tunai || 0),
                    non_tunai: Number(r.non_tunai || 0),
                    total: Number(r.total || 0),
                })),
                grand_total: {
                    tunai: cleanoxTotalTunai,
                    non_tunai: cleanoxTotalNonTunai,
                    total: cleanoxTotalAll,
                },
                details: cleanoxOnlyDetailsFiltered.map(r => ({
                    no_nota: r.no_nota,
                    customer_nama: r.customer_nama,
                    outlet: r.outlet,
                    waktu_pembayaran: r.waktu_pembayaran,
                    jenis_bayar: r.jenis_bayar,
                    nominal_bayar: Number(r.nominal_bayar || 0),
                    daftar_item: r.daftar_item || '—'
                }))
            },
            cleanoxTarget: {
                target_nominal: cleanoxTargetNominal,
                realisasi: cleanoxRealisasiTotal,
                cleanox_only_total: cleanoxTotalAll,
                jatah_70_waschen: jatah_70,
                persen: Number(cleanoxTargetPct.toFixed(2)),
            }
        });

    } catch (err) {
        console.error('[dashboardCleanox/getDashboardData]', err.message);
        return res.status(500).json({ message: 'Gagal mengambil data dashboard', error: err.message });
    } finally {
        if (connection) connection.release();
    }
};
