import cleanoxPool from '../db/cleanox.js';

/* ── SSE client store ─────────────────────────────────── */
const sseClients = new Set();

export const subscribeEvents = (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
};

const broadcast = (payload) => {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) client.write(msg);
};

/* ── Get distinct outlets ─────────────────────────────── */
export const getOutlets = async (_req, res) => {
  try {
    const [rows] = await cleanoxPool.query(
      `SELECT DISTINCT outlet
       FROM rekap_transaksi_reguler
       WHERE outlet IS NOT NULL AND outlet <> ''
       ORDER BY outlet`
    );
    return res.json({ outlets: rows.map((r) => r.outlet) });
  } catch (err) {
    console.error('[production/getOutlets]', err.message);
    return res.status(500).json({ message: 'Gagal mengambil data outlet' });
  }
};

/* ── Get employees (for tracking modal) ───────────────── */
export const getEmployees = async (_req, res) => {
  try {
    const [rows] = await cleanoxPool.query(
      `SELECT id, name FROM mst_employee WHERE status = 'active' ORDER BY name`
    );
    return res.json({ employees: rows });
  } catch (err) {
    console.error('[production/getEmployees]', err.message);
    return res.status(500).json({ message: 'Gagal mengambil data karyawan' });
  }
};

/* ── Get production data — per ITEM (not per nota) ────── */
export const getData = async (req, res) => {
  const {
    date_start,
    date_end,
    outlet,
    date_field = 'tgl_terima',
    sort_key,
    sort_dir,
    page  = 1,
    limit = 25,
  } = req.query;

  if (!date_start || !date_end) {
    return res.status(400).json({ message: 'Parameter date_start dan date_end wajib diisi' });
  }

  const pageNum  = Math.max(1, parseInt(page,  10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset   = (pageNum - 1) * limitNum;

  const dateFieldSafe = date_field === 'tgl_selesai' ? 'tgl_selesai' : 'tgl_terima';
  const SORT_WHITELIST = ['tgl_terima', 'tgl_selesai'];
  const sortFieldSafe  = SORT_WHITELIST.includes(sort_key) ? sort_key : dateFieldSafe;
  const sortDirSafe    = sort_dir === 'asc' ? 'ASC' : 'DESC';
  const outletWhere   = outlet ? 'AND outlet = ?' : '';
  const outletParams  = outlet ? [outlet] : [];
  const dateParams    = [date_start, date_end];

  const baseWhere = `
    DATE(${dateFieldSafe}) BETWEEN DATE(?) AND DATE(?)
    AND (LOWER(COALESCE(nama_item,'')) LIKE '%cleanox%'
      OR LOWER(COALESCE(nama_item,'')) LIKE '%karpet%')
    ${outletWhere}
  `;

  const statsQuery = `SELECT COUNT(*) AS total FROM rekap_transaksi_reguler WHERE ${baseWhere}`;

  const dataQuery = `
    SELECT
      outlet,
      no_nota,
      customer_nama,
      nama_item,
      jumlah,
      satuan_item,
      tgl_terima,
      tgl_selesai,
      status,
      pickup_by,    pickup_at,
      cuci_jemur_by, cuci_jemur_at,
      packing_by,   packing_at,
      pengantaran_by, pengantaran_at,
      updated_by,
      updated_at
    FROM rekap_transaksi_reguler
    WHERE ${baseWhere}
    ORDER BY ${sortFieldSafe} ${sortDirSafe}, no_nota DESC, nama_item
    LIMIT ? OFFSET ?
  `;

  const params = [...dateParams, ...outletParams];

  try {
    const [statsResult, dataResult] = await Promise.all([
      cleanoxPool.query(statsQuery, params),
      cleanoxPool.query(dataQuery,  [...params, limitNum, offset]),
    ]);

    const total = Number(statsResult[0][0]?.total || 0);

    return res.json({
      data: dataResult[0],
      stats: { total },
      pagination: {
        total,
        page:       pageNum,
        limit:      limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error('[production/getData]', err.message);
    return res.status(500).json({ message: 'Gagal mengambil data', error: err.message });
  }
};

/* ── Get tracking detail for one item row ─────────────── */
export const getTracking = async (req, res) => {
  const { no_nota, nama_item } = req.query;
  if (!no_nota || !nama_item) {
    return res.status(400).json({ message: 'no_nota dan nama_item wajib diisi' });
  }

  try {
    const [rows] = await cleanoxPool.query(
      `SELECT
        no_nota, outlet, customer_nama, alamat_customer, nama_item,
        jumlah, satuan_item,
        tgl_terima, tgl_selesai, status,
        pickup_by,    pickup_at,
        cuci_jemur_by, cuci_jemur_at,
        packing_by,   packing_at,
        pengantaran_by, pengantaran_at,
        updated_by, updated_at
      FROM rekap_transaksi_reguler
      WHERE no_nota = ? AND nama_item = ?
      LIMIT 1`,
      [no_nota, nama_item]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Data tidak ditemukan' });
    }

    const row = rows[0];
    // Parse JSON fields safely
    const parseJson = (v) => {
      if (!v) return [];
      if (Array.isArray(v)) return v;
      try { return JSON.parse(v); } catch { return []; }
    };
    row.pickup_by      = parseJson(row.pickup_by);
    row.cuci_jemur_by  = parseJson(row.cuci_jemur_by);
    row.packing_by     = parseJson(row.packing_by);
    row.pengantaran_by = parseJson(row.pengantaran_by);

    return res.json({ tracking: row });
  } catch (err) {
    console.error('[production/getTracking]', err.message);
    return res.status(500).json({ message: 'Gagal mengambil data tracking' });
  }
};

/* ── Update tracking stage ────────────────────────────── */
const STAGE_COLUMNS = {
  Pickup:      { by: 'pickup_by',      at: 'pickup_at'      },
  'Cuci Jemur': { by: 'cuci_jemur_by', at: 'cuci_jemur_at'  },
  Packing:     { by: 'packing_by',     at: 'packing_at'     },
  Pengantaran: { by: 'pengantaran_by', at: 'pengantaran_at' },
};

const VALID_STATUSES = ['Pickup', 'Cuci Jemur', 'Packing', 'Pengantaran'];

export const updateTracking = async (req, res) => {
  const { no_nota, nama_item, stage, employee_names, timestamp } = req.body;

  if (!no_nota || !nama_item || !stage) {
    return res.status(400).json({ message: 'no_nota, nama_item, dan stage wajib diisi' });
  }
  if (!STAGE_COLUMNS[stage]) {
    return res.status(400).json({ message: 'Stage tidak valid' });
  }
  if (!Array.isArray(employee_names) || employee_names.length === 0) {
    return res.status(400).json({ message: 'employee_names wajib diisi (array)' });
  }

  const col = STAGE_COLUMNS[stage];
  const ts = timestamp || new Date().toISOString().slice(0, 19).replace('T', ' ');

  // Determine new overall status = latest stage that is filled
  const stageIdx = VALID_STATUSES.indexOf(stage);
  const newStatus = stage;

  try {
    const [result] = await cleanoxPool.query(
      `UPDATE rekap_transaksi_reguler
       SET ${col.by} = ?, ${col.at} = ?,
           status = ?, updated_by = ?, updated_at = NOW()
       WHERE no_nota = ? AND nama_item = ?`,
      [JSON.stringify(employee_names), ts, newStatus, employee_names.join(', '), no_nota, nama_item]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Data tidak ditemukan' });
    }

    const payload = {
      no_nota, nama_item, stage,
      employee_names, timestamp: ts,
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    broadcast(payload);

    return res.json({ message: 'Tracking berhasil diupdate', ...payload });
  } catch (err) {
    console.error('[production/updateTracking]', err.message);
    return res.status(500).json({ message: 'Gagal mengupdate tracking', error: err.message });
  }
};
