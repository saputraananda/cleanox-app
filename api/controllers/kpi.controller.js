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

  const parseJson = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    try { return JSON.parse(v); } catch { return []; }
  };

  const parseDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const toLocalDateKey = (v) => {
    const d = parseDate(v);
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const diffHours = (a, b) => {
    const da = parseDate(a);
    const db = parseDate(b);
    if (!da || !db) return null;
    const h = (db.getTime() - da.getTime()) / 36e5;
    return h >= 0 ? h : null;
  };

  const summarizeHours = (arr) => {
    if (!arr.length) {
      return { sample_count: 0, avg_hours: null, min_hours: null, max_hours: null };
    }
    const sum = arr.reduce((s, v) => s + v, 0);
    return {
      sample_count: arr.length,
      avg_hours: Number((sum / arr.length).toFixed(2)),
      min_hours: Number(Math.min(...arr).toFixed(2)),
      max_hours: Number(Math.max(...arr).toFixed(2)),
    };
  };

  const normalizeServiceName = (name) => {
    const s = String(name || '').trim().replace(/\s+/g, ' ');
    return s || 'Tanpa Nama Item';
  };

  try {
    // Fetch all relevant rows — we'll aggregate per employee in JS
    // because employees are stored as JSON arrays in each stage column
    const [rows] = await cleanoxPool.query(
      `SELECT
         id, no_nota, nama_item, jumlah, satuan_item,
         COALESCE(total_tagihan, 0) AS total_tagihan,
         pickup_by, pickup_at,
         cuci_jemur_by, cuci_jemur_at,
         packing_by, packing_at,
         pengantaran_by, pengantaran_at
       FROM ${TRANSAKSI_TABLE}
       WHERE ${baseWhere}`,
      [date_start, date_end]
    );

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

    // 1) Total item per stage per day
    const dailyMap = new Map(); // date -> counters
    const ensureDaily = (dateKey) => {
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          date: dateKey,
          pickup: 0,
          cuci_jemur: 0,
          packing: 0,
          pengantaran: 0,
          total: 0,
        });
      }
      return dailyMap.get(dateKey);
    };

    for (const r of rows) {
      const stageAtList = [
        { key: 'pickup', at: r.pickup_at },
        { key: 'cuci_jemur', at: r.cuci_jemur_at },
        { key: 'packing', at: r.packing_at },
        { key: 'pengantaran', at: r.pengantaran_at },
      ];
      for (const { key, at } of stageAtList) {
        const dateKey = toLocalDateKey(at);
        if (!dateKey) continue;
        const d = ensureDaily(dateKey);
        d[key] += 1;
        d.total += 1;
      }
    }

    const dailyStage = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // 2) Aging processing time (hours)
    const pickupToCuci = [];
    const cuciToPacking = [];
    const packingToDelivery = [];
    const pickupToDelivery = [];

    for (const r of rows) {
      const h1 = diffHours(r.pickup_at, r.cuci_jemur_at);
      const h2 = diffHours(r.cuci_jemur_at, r.packing_at);
      const h3 = diffHours(r.packing_at, r.pengantaran_at);
      const h4 = diffHours(r.pickup_at, r.pengantaran_at);
      if (h1 !== null) pickupToCuci.push(h1);
      if (h2 !== null) cuciToPacking.push(h2);
      if (h3 !== null) packingToDelivery.push(h3);
      if (h4 !== null) pickupToDelivery.push(h4);
    }

    const agingProcessingHours = {
      pickup_to_cuci_jemur: summarizeHours(pickupToCuci),
      cuci_jemur_to_packing: summarizeHours(cuciToPacking),
      packing_to_delivery: summarizeHours(packingToDelivery),
      pickup_to_delivery: summarizeHours(pickupToDelivery),
    };

    // 3) Top 5 services (volume, estimated revenue, avg cycle time)
    const notaItemCount = {};
    for (const r of rows) {
      const notaKey = String(r.no_nota || '').trim();
      if (!notaKey) continue;
      notaItemCount[notaKey] = (notaItemCount[notaKey] || 0) + 1;
    }

    const serviceMap = new Map(); // nama_item -> stats
    const ensureService = (serviceName) => {
      if (!serviceMap.has(serviceName)) {
        serviceMap.set(serviceName, {
          service_name: serviceName,
          volume: 0,
          revenue: 0,
          _cycle_sum: 0,
          _cycle_count: 0,
        });
      }
      return serviceMap.get(serviceName);
    };

    for (const r of rows) {
      const serviceName = normalizeServiceName(r.nama_item);
      const svc = ensureService(serviceName);
      svc.volume += 1;

      const rowRevenue = Number(r.total_tagihan || 0);
      if (Number.isFinite(rowRevenue)) {
        const notaKey = String(r.no_nota || '').trim();
        const divisor = notaKey ? (notaItemCount[notaKey] || 1) : 1;
        svc.revenue += rowRevenue / Math.max(1, divisor);
      }

      const cycle = diffHours(r.pickup_at, r.pengantaran_at);
      if (cycle !== null) {
        svc._cycle_sum += cycle;
        svc._cycle_count += 1;
      }
    }

    const topServices = Array.from(serviceMap.values())
      .map((s) => ({
        service_name: s.service_name,
        volume: s.volume,
        revenue: Math.round(s.revenue),
        avg_cycle_hours: s._cycle_count > 0 ? Number((s._cycle_sum / s._cycle_count).toFixed(2)) : null,
        cycle_sample_count: s._cycle_count,
      }))
      .sort((a, b) => {
        if (b.volume !== a.volume) return b.volume - a.volume;
        return b.revenue - a.revenue;
      })
      .slice(0, 5);

    return res.json({
      summary: list,
      overall,
      insights: {
        daily_stage: dailyStage,
        aging_processing_hours: agingProcessingHours,
        top_services: topServices,
      },
    });
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
