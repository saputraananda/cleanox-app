import ExcelJS from 'exceljs';
import cleanoxPool from '../../shared/db/cleanox.js';
import { resolveCutoffPeriod } from '../../shared/utils/posCutoffPeriod.js';

function employeeGroupKey(employeeId, employeeName) {
  if (employeeId != null) return `id:${employeeId}`;
  return `name:${String(employeeName || '').trim().toLowerCase()}`;
}

function formatServiceDateYmd(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return raw;
}

/**
 * First non-cancelled transaction per Waschen-referred customer
 * whose first service_date falls within [date_start, date_end].
 */
async function fetchWaschenReferralFirstTxData({ date_start, date_end }) {
  const [rows] = await cleanoxPool.query(
    `SELECT
       c.id AS customer_id,
       c.name AS customer_name,
       c.referral_employee_id,
       c.referral_employee_name,
       t.id AS transaction_id,
       t.transaction_no,
       t.service_date,
       t.final_amount
     FROM mst_customers c
     INNER JOIN mst_referral_sources rs ON rs.id = c.referral_source_id
     INNER JOIN tr_transactions t
       ON t.customer_id = c.id
      AND t.status <> 'Cancelled'
      AND t.id = (
        SELECT t2.id
        FROM tr_transactions t2
        WHERE t2.customer_id = c.id
          AND t2.status <> 'Cancelled'
        ORDER BY t2.service_date ASC, t2.id ASC
        LIMIT 1
      )
     WHERE rs.code = 'waschen'
       AND (
         c.referral_employee_id IS NOT NULL
         OR (
           c.referral_employee_name IS NOT NULL
           AND TRIM(c.referral_employee_name) <> ''
         )
       )
       AND DATE(t.service_date) BETWEEN ? AND ?
     ORDER BY
       COALESCE(c.referral_employee_name, '') ASC,
       t.service_date ASC,
       t.id ASC`,
    [date_start, date_end]
  );

  return rows.map((row) => {
    const employeeId = row.referral_employee_id == null ? null : Number(row.referral_employee_id);
    const employeeName = row.referral_employee_name || null;
    return {
      group_key: employeeGroupKey(employeeId, employeeName),
      employee_id: employeeId,
      employee_name: employeeName,
      is_manual: employeeId == null,
      customer_id: Number(row.customer_id),
      customer_name: row.customer_name || '',
      transaction_id: Number(row.transaction_id),
      transaction_no: row.transaction_no || '',
      service_date: row.service_date,
      final_amount: Number(row.final_amount || 0),
    };
  });
}

function groupLeaderboardRows(flatRows) {
  const map = new Map();

  for (const row of flatRows) {
    let group = map.get(row.group_key);
    if (!group) {
      group = {
        group_key: row.group_key,
        employee_id: row.employee_id,
        employee_name: row.employee_name,
        customer_count: 0,
        is_manual: row.is_manual,
        customers: [],
      };
      map.set(row.group_key, group);
    }
    if (row.employee_id != null) {
      group.employee_id = row.employee_id;
      group.employee_name = row.employee_name || group.employee_name;
      group.is_manual = false;
    } else if (!group.employee_name) {
      group.employee_name = row.employee_name;
    }
    group.customers.push({
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      transaction_id: row.transaction_id,
      transaction_no: row.transaction_no,
      service_date: row.service_date,
      final_amount: row.final_amount,
    });
    group.customer_count += 1;
  }

  const rows = Array.from(map.values()).map((group) => {
    group.customers.sort((a, b) => {
      const da = formatServiceDateYmd(a.service_date);
      const db = formatServiceDateYmd(b.service_date);
      if (da !== db) return da < db ? -1 : 1;
      return a.transaction_id - b.transaction_id;
    });
    return group;
  });

  rows.sort((a, b) => {
    if (b.customer_count !== a.customer_count) return b.customer_count - a.customer_count;
    return String(a.employee_name || '').localeCompare(String(b.employee_name || ''), 'id');
  });

  return rows;
}

function parseLeaderboardQuery(req) {
  const filterType = String(req.query.filter_type || '').trim().toLowerCase();
  const year = Number(req.query.year);
  const month = Number(req.query.month);

  if (!['bulan', 'tahun'].includes(filterType)) {
    const err = new Error('filter_type wajib: bulan atau tahun');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    const err = new Error('Parameter year tidak valid');
    err.status = 400;
    throw err;
  }
  if (filterType === 'bulan' && (!Number.isFinite(month) || month < 1 || month > 12)) {
    const err = new Error('Parameter month wajib 1–12 untuk filter bulanan');
    err.status = 400;
    throw err;
  }

  let period;
  try {
    period = resolveCutoffPeriod(filterType, { year, month });
  } catch (e) {
    const err = new Error(e.message || 'Periode tidak valid');
    err.status = 400;
    throw err;
  }

  return {
    filterType,
    year,
    month: filterType === 'bulan' ? month : null,
    period,
  };
}

export const getWaschenReferralLeaderboard = async (req, res) => {
  try {
    const { filterType, year, month, period } = parseLeaderboardQuery(req);
    const flatRows = await fetchWaschenReferralFirstTxData({
      date_start: period.date_start,
      date_end: period.date_end,
    });
    const rows = groupLeaderboardRows(flatRows);
    const total_customers = rows.reduce((sum, row) => sum + row.customer_count, 0);
    const total_nominal = flatRows.reduce((sum, row) => sum + row.final_amount, 0);

    return res.json({
      filter: {
        filter_type: filterType,
        year,
        month,
        date_start: period.date_start,
        date_end: period.date_end,
      },
      rows,
      total_customers,
      total_nominal,
    });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error('[posWaschenReferral/leaderboard]', error.message);
    return res.status(500).json({ message: 'Gagal memuat leaderboard referral Waschen' });
  }
};

export const exportWaschenReferralExcel = async (req, res) => {
  try {
    const { period } = parseLeaderboardQuery(req);
    const flatRows = await fetchWaschenReferralFirstTxData({
      date_start: period.date_start,
      date_end: period.date_end,
    });

    // Sort flat export: pegawai name, then service_date, then transaction_id
    const sorted = [...flatRows].sort((a, b) => {
      const nameCmp = String(a.employee_name || '').localeCompare(String(b.employee_name || ''), 'id');
      if (nameCmp !== 0) return nameCmp;
      const da = formatServiceDateYmd(a.service_date);
      const db = formatServiceDateYmd(b.service_date);
      if (da !== db) return da < db ? -1 : 1;
      return a.transaction_id - b.transaction_id;
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Referral Waschen');
    sheet.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'Nama Pegawai', key: 'employee_name', width: 28 },
      { header: 'Nama Customer', key: 'customer_name', width: 28 },
      { header: 'Tanggal Trx Awal', key: 'service_date', width: 16 },
      { header: 'No Transaksi', key: 'transaction_no', width: 24 },
      { header: 'Nominal', key: 'final_amount', width: 16 },
    ];

    sorted.forEach((row, index) => {
      sheet.addRow({
        no: index + 1,
        employee_name: row.employee_name || '',
        customer_name: row.customer_name || '',
        service_date: formatServiceDateYmd(row.service_date),
        transaction_no: row.transaction_no || '',
        final_amount: row.final_amount,
      });
    });

    const filename = `referral-waschen-${period.date_start}_sd_${period.date_end}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error('[posWaschenReferral/export]', error.message);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Gagal export Excel referral Waschen' });
    }
    return undefined;
  }
};
