import cleanoxPool from '../db/cleanox.js';

function resolvePeriod(filterType, { year, month, startDate, endDate }) {
  if (filterType === 'rentang' && startDate && endDate) {
    return {
      date_start: startDate,
      date_end: endDate,
      year: null,
      month: null,
    };
  }

  if (filterType === 'tahun' && year) {
    const y = Number(year);
    return {
      date_start: `${y}-01-01`,
      date_end: `${y}-12-31`,
      year: y,
      month: null,
    };
  }

  const y = Number(year);
  const m = Number(month);
  if (!y || !m) {
    throw new Error('Periode bulan tidak valid');
  }
  const lastDay = new Date(y, m, 0).getDate();
  return {
    date_start: `${y}-${String(m).padStart(2, '0')}-01`,
    date_end: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    year: y,
    month: m,
  };
}

export const getAvailablePeriods = async (_req, res) => {
  try {
    const [rows] = await cleanoxPool.query(
      `SELECT DISTINCT
        YEAR(service_date) AS yr,
        MONTH(service_date) AS mo
       FROM tr_transactions
       WHERE service_date IS NOT NULL
       ORDER BY yr DESC, mo DESC`
    );

    const now = new Date();
    const activeYear = now.getFullYear();
    const activeMonth = now.getMonth() + 1;
    const exists = rows.some(
      (row) => Number(row.yr) === activeYear && Number(row.mo) === activeMonth
    );
    if (!exists) {
      rows.unshift({ yr: activeYear, mo: activeMonth });
    }

    return res.json({
      periods: rows.map((row) => ({
        yr: Number(row.yr),
        mo: Number(row.mo),
      })),
    });
  } catch (err) {
    console.error('[posDashboard/getAvailablePeriods]', err.message);
    return res.status(500).json({ message: 'Gagal mengambil data periode POS' });
  }
};

export const getDashboardData = async (req, res) => {
  const { filterType, year, month, startDate, endDate } = req.query;

  try {
    const period = resolvePeriod(filterType || 'bulan', {
      year,
      month,
      startDate,
      endDate,
    });
    const { date_start, date_end } = period;

    const [summaryRows] = await cleanoxPool.query(
      `SELECT
        COUNT(*) AS total_transactions,
        SUM(CASE WHEN status <> 'Cancelled' THEN final_amount ELSE 0 END) AS total_revenue,
        SUM(CASE WHEN status IN ('Draft', 'Waiting_Confirmation') THEN 1 ELSE 0 END) AS incoming_transactions,
        SUM(CASE WHEN status IN ('Assigned', 'Scheduled', 'In_Progress') THEN 1 ELSE 0 END) AS active_transactions,
        SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed_transactions,
        SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) AS cancelled_transactions
       FROM tr_transactions
       WHERE DATE(service_date) BETWEEN ? AND ?`,
      [date_start, date_end]
    );

    const summaryRow = summaryRows[0] || {};
    const totalRevenue = Number(summaryRow.total_revenue || 0);
    const nonCancelledCount =
      Number(summaryRow.total_transactions || 0) - Number(summaryRow.cancelled_transactions || 0);
    const avgPerTransaction =
      nonCancelledCount > 0 ? totalRevenue / nonCancelledCount : 0;

    const [trendRows] = await cleanoxPool.query(
      `SELECT
        DATE(service_date) AS tanggal,
        SUM(CASE WHEN status <> 'Cancelled' THEN final_amount ELSE 0 END) AS sales,
        COUNT(*) AS count
       FROM tr_transactions
       WHERE DATE(service_date) BETWEEN ? AND ?
       GROUP BY DATE(service_date)
       ORDER BY tanggal`,
      [date_start, date_end]
    );

    const [statusRows] = await cleanoxPool.query(
      `SELECT
        status,
        COUNT(*) AS total,
        SUM(final_amount) AS revenue
       FROM tr_transactions
       WHERE DATE(service_date) BETWEEN ? AND ?
       GROUP BY status
       ORDER BY total DESC`,
      [date_start, date_end]
    );

    const [categoryRows] = await cleanoxPool.query(
      `SELECT
        COALESCE(c.name, 'Lainnya') AS category_name,
        COUNT(i.id) AS total_items,
        SUM(i.line_total) AS revenue
       FROM tr_transaction_items i
       INNER JOIN tr_transactions t ON t.id = i.transaction_id
       INNER JOIN mst_services s ON s.id = i.service_id
       LEFT JOIN mst_category c ON c.id = s.category_id
       WHERE t.status <> 'Cancelled'
         AND DATE(t.service_date) BETWEEN ? AND ?
       GROUP BY COALESCE(c.name, 'Lainnya')
       ORDER BY revenue DESC`,
      [date_start, date_end]
    );

    const [detailRows] = await cleanoxPool.query(
      `SELECT
        t.id,
        t.transaction_no,
        t.customer_name,
        t.customer_phone,
        t.service_date,
        t.status,
        t.final_amount,
        GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ') AS daftar_item,
        COUNT(DISTINCT a.id) AS total_workers
       FROM tr_transactions t
       LEFT JOIN tr_transaction_items i ON i.transaction_id = t.id
       LEFT JOIN mst_services s ON s.id = i.service_id
       LEFT JOIN tr_worker_assignments a ON a.transaction_id = t.id
       WHERE DATE(t.service_date) BETWEEN ? AND ?
       GROUP BY t.id, t.transaction_no, t.customer_name, t.customer_phone, t.service_date, t.status, t.final_amount
       ORDER BY t.service_date DESC, t.id DESC`,
      [date_start, date_end]
    );

    let targetNominal = 0;
    try {
      if (filterType === 'tahun' && period.year) {
        const [targetRows] = await cleanoxPool.query(
          `SELECT COALESCE(SUM(nominal), 0) AS target_nominal
           FROM mst_target_cleanox
           WHERE tahun = ?`,
          [period.year]
        );
        targetNominal = Number(targetRows[0]?.target_nominal || 0);
      } else if (period.year && period.month) {
        const [targetRows] = await cleanoxPool.query(
          `SELECT COALESCE(SUM(nominal), 0) AS target_nominal
           FROM mst_target_cleanox
           WHERE tahun = ? AND bulan = ?`,
          [period.year, period.month]
        );
        targetNominal = Number(targetRows[0]?.target_nominal || 0);
      }
    } catch (targetErr) {
      console.warn('[posDashboard/target-query-warn]', targetErr.message);
    }

    const targetPct =
      targetNominal > 0 ? Number(((totalRevenue / targetNominal) * 100).toFixed(2)) : 0;

    return res.json({
      period: {
        ...period,
        date_start,
        date_end,
      },
      summary: {
        total_transactions: Number(summaryRow.total_transactions || 0),
        total_revenue: totalRevenue,
        incoming_transactions: Number(summaryRow.incoming_transactions || 0),
        active_transactions: Number(summaryRow.active_transactions || 0),
        completed_transactions: Number(summaryRow.completed_transactions || 0),
        cancelled_transactions: Number(summaryRow.cancelled_transactions || 0),
        avg_per_transaction: Number(avgPerTransaction.toFixed(2)),
      },
      statusBreakdown: statusRows.map((row) => ({
        status: row.status,
        total: Number(row.total || 0),
        revenue: Number(row.revenue || 0),
      })),
      categoryBreakdown: categoryRows.map((row) => ({
        category_name: row.category_name,
        total_items: Number(row.total_items || 0),
        revenue: Number(row.revenue || 0),
      })),
      trends: trendRows.map((row) => ({
        tanggal: row.tanggal,
        sales: Number(row.sales || 0),
        count: Number(row.count || 0),
      })),
      target: {
        target_nominal: targetNominal,
        realisasi: totalRevenue,
        persen: targetPct,
      },
      details: detailRows.map((row) => ({
        id: row.id,
        transaction_no: row.transaction_no,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone || null,
        service_date: row.service_date,
        status: row.status,
        final_amount: Number(row.final_amount || 0),
        daftar_item: row.daftar_item || '—',
        total_workers: Number(row.total_workers || 0),
      })),
    });
  } catch (err) {
    console.error('[posDashboard/getDashboardData]', err.message);
    return res.status(500).json({
      message: err.message || 'Gagal mengambil data dashboard POS',
    });
  }
};
