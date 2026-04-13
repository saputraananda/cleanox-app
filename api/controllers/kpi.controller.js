import cleanoxPool from '../db/cleanox.js';

const TRANSAKSI_TABLE = process.env.NODE_ENV === 'development'
  ? 'rekap_transaksi_reguler'
  : 'rekap_transaksi_reguler';

/* ── KPI Summary — all employees for a period ─────────── */
export const getKpiSummary = async (req, res) => {
  const { date_start, date_end, date_field = 'tgl_terima' } = req.query;

  if (!date_start || !date_end) {
    return res.status(400).json({ message: 'date_start dan date_end wajib diisi' });
  }

  const dateFieldSafe = date_field === 'tgl_selesai' ? 'tgl_selesai' : 'tgl_terima';

  const baseWhere = `
    DATE(${dateFieldSafe}) BETWEEN DATE(?) AND DATE(?)
    AND (LOWER(COALESCE(nama_item,'')) LIKE '%cleanox%'
      OR LOWER(COALESCE(nama_item,'')) LIKE '%karpet%')
  `;

  try {
    // Fetch all relevant rows — we'll aggregate per employee in JS
    // because employees are stored as JSON arrays in each stage column
    const [rows] = await cleanoxPool.query(
      `SELECT
         id, nama_item, jumlah, satuan_item,
         pickup_by, pickup_at,
         cuci_jemur_by, cuci_jemur_at,
         packing_by, packing_at,
         pengantaran_by, pengantaran_at
       FROM ${TRANSAKSI_TABLE}
       WHERE ${baseWhere}`,
      [date_start, date_end]
    );

    const parseJson = (v) => {
      if (!v) return [];
      if (Array.isArray(v)) return v;
      try { return JSON.parse(v); } catch { return []; }
    };

    // Aggregate per employee
    const empMap = {}; // name -> stats

    const ensure = (name) => {
      if (!empMap[name]) {
        empMap[name] = {
          name,
          pickup: 0,
          cuci_jemur: 0,
          packing: 0,
          pengantaran: 0,
          total: 0,
        };
      }
      return empMap[name];
    };

    for (const r of rows) {
      const stages = [
        { names: parseJson(r.pickup_by),       key: 'pickup'       },
        { names: parseJson(r.cuci_jemur_by),   key: 'cuci_jemur'   },
        { names: parseJson(r.packing_by),       key: 'packing'      },
        { names: parseJson(r.pengantaran_by),   key: 'pengantaran'  },
      ];
      for (const { names, key } of stages) {
        for (const name of names) {
          if (!name) continue;
          const emp = ensure(name);
          emp[key] += 1;
        }
      }
    }

    // Compute totals and rank
    const list = Object.values(empMap).map((e) => ({
      ...e,
      total: e.pickup + e.cuci_jemur + e.packing + e.pengantaran,
    }));

    list.sort((a, b) => b.total - a.total);
    list.forEach((e, i) => { e.rank = i + 1; });

    // Overall stats
    const overall = {
      total_items: rows.length,
      pickup_done:       rows.filter((r) => parseJson(r.pickup_by).length > 0).length,
      cuci_jemur_done:   rows.filter((r) => parseJson(r.cuci_jemur_by).length > 0).length,
      packing_done:      rows.filter((r) => parseJson(r.packing_by).length > 0).length,
      pengantaran_done:  rows.filter((r) => parseJson(r.pengantaran_by).length > 0).length,
    };

    return res.json({ summary: list, overall });
  } catch (err) {
    console.error('[kpi/getKpiSummary]', err.message);
    return res.status(500).json({ message: 'Gagal mengambil data KPI', error: err.message });
  }
};

/* ── KPI Detail — per employee, list all items worked ─── */
export const getKpiDetail = async (req, res) => {
  const { employee_name, date_start, date_end, date_field = 'tgl_terima' } = req.query;

  if (!employee_name || !date_start || !date_end) {
    return res.status(400).json({ message: 'employee_name, date_start, date_end wajib diisi' });
  }

  const dateFieldSafe = date_field === 'tgl_selesai' ? 'tgl_selesai' : 'tgl_terima';

  try {
    // Use JSON_CONTAINS to search within JSON arrays
    const [rows] = await cleanoxPool.query(
      `SELECT
         id, no_nota, outlet, customer_nama, nama_item, jumlah, satuan_item,
         pickup_by, pickup_at,
         cuci_jemur_by, cuci_jemur_at,
         packing_by, packing_at,
         pengantaran_by, pengantaran_at,
         status, tgl_terima, tgl_selesai
       FROM ${TRANSAKSI_TABLE}
       WHERE DATE(${dateFieldSafe}) BETWEEN DATE(?) AND DATE(?)
         AND (LOWER(COALESCE(nama_item,'')) LIKE '%cleanox%'
           OR LOWER(COALESCE(nama_item,'')) LIKE '%karpet%')
         AND (
           JSON_CONTAINS(pickup_by,      JSON_QUOTE(?)) = 1
        OR JSON_CONTAINS(cuci_jemur_by,  JSON_QUOTE(?)) = 1
        OR JSON_CONTAINS(packing_by,     JSON_QUOTE(?)) = 1
        OR JSON_CONTAINS(pengantaran_by, JSON_QUOTE(?)) = 1
         )
       ORDER BY tgl_terima DESC`,
      [date_start, date_end, employee_name, employee_name, employee_name, employee_name]
    );

    const parseJson = (v) => {
      if (!v) return [];
      if (Array.isArray(v)) return v;
      try { return JSON.parse(v); } catch { return []; }
    };

    const items = rows.map((r) => {
      const pd = parseJson(r.pickup_by);
      const cj = parseJson(r.cuci_jemur_by);
      const pk = parseJson(r.packing_by);
      const pg = parseJson(r.pengantaran_by);

      return {
        id: r.id,
        no_nota: r.no_nota,
        outlet: r.outlet,
        customer_nama: r.customer_nama,
        nama_item: r.nama_item,
        jumlah: r.jumlah,
        satuan_item: r.satuan_item,
        status: r.status,
        tgl_terima: r.tgl_terima,
        tgl_selesai: r.tgl_selesai,
        did_pickup:      pd.includes(employee_name) ? r.pickup_at      : null,
        did_cuci_jemur:  cj.includes(employee_name) ? r.cuci_jemur_at  : null,
        did_packing:     pk.includes(employee_name) ? r.packing_at     : null,
        did_pengantaran: pg.includes(employee_name) ? r.pengantaran_at : null,
      };
    });

    return res.json({ employee_name, items });
  } catch (err) {
    console.error('[kpi/getKpiDetail]', err.message);
    return res.status(500).json({ message: 'Gagal mengambil detail KPI', error: err.message });
  }
};
