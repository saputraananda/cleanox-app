import cleanoxPool from '../db/cleanox.js';

const TRANSAKSI_TABLE = process.env.NODE_ENV === 'development'
  ? 'rekap_transaksi_reguler'
  : 'rekap_transaksi_reguler';

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

const STATUS_VALUES = ['Pickup', 'Cuci Jemur', 'Packing', 'Pengantaran'];
const FILTER_STATUS_VALUES = [...STATUS_VALUES, 'Tertunda'];

/* ── Get distinct outlets ─────────────────────────────── */
export const getOutlets = async (_req, res) => {
  try {
    const [rows] = await cleanoxPool.query(
      `SELECT DISTINCT outlet
       FROM ${TRANSAKSI_TABLE}
       WHERE outlet IS NOT NULL AND outlet <> ''
       ORDER BY outlet`
    );
    return res.json({ outlets: rows.map((r) => r.outlet) });
  } catch (err) {
    console.error('[production/getOutlets]', err.message);
    return res.status(500).json({ message: 'Gagal mengambil data outlet' });
  }
};

/* ── Get employees (for tracking modal) — only role 'cleanox' ── */
export const getEmployees = async (_req, res) => {
  try {
    const [rows] = await cleanoxPool.query(
      `SELECT id, name FROM users WHERE role = 'cleanox' and name <> 'Tim Produksi Cleanox' ORDER BY name`
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
    search,
    status,
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
  const searchTerm    = typeof search === 'string' ? search.trim().toLowerCase() : '';
  const searchWhere   = searchTerm
    ? `AND (
      LOWER(COALESCE(no_nota, '')) LIKE ?
      OR LOWER(COALESCE(customer_nama, '')) LIKE ?
      OR LOWER(COALESCE(outlet, '')) LIKE ?
      OR LOWER(COALESCE(nama_item, '')) LIKE ?
      OR LOWER(COALESCE(status, '')) LIKE ?
    )`
    : '';
  const searchParams  = searchTerm ? Array(5).fill(`%${searchTerm}%`) : [];
  const statusTokens = typeof status === 'string'
    ? status.split(',').map((s) => s.trim()).filter((s) => FILTER_STATUS_VALUES.includes(s))
    : [];
  const includeHold = statusTokens.includes('Tertunda');
  const statusList = statusTokens.filter((s) => STATUS_VALUES.includes(s));
  let statusWhere = '';
  const statusParams = [];
  if (statusTokens.length > 0) {
    if (includeHold && statusList.length > 0) {
      statusWhere = `AND ((status IN (${statusList.map(() => '?').join(', ')})) OR COALESCE(on_hold, 0) = 1 OR status = 'Tertunda')`;
      statusParams.push(...statusList);
    } else if (includeHold) {
      statusWhere = "AND (COALESCE(on_hold, 0) = 1 OR status = 'Tertunda')";
    } else if (statusList.length > 0) {
      statusWhere = `AND status IN (${statusList.map(() => '?').join(', ')}) AND COALESCE(on_hold, 0) = 0`;
      statusParams.push(...statusList);
    }
  }

  const baseWhere = `
    DATE(${dateFieldSafe}) BETWEEN DATE(?) AND DATE(?)
    AND (LOWER(COALESCE(nama_item,'')) LIKE '%cleanox%'
      OR LOWER(COALESCE(nama_item,'')) LIKE '%karpet%') 
    ${outletWhere}
    ${searchWhere}
    ${statusWhere}
  `;

  const statsQuery = `SELECT COUNT(*) AS total FROM ${TRANSAKSI_TABLE} WHERE ${baseWhere}`;

  const dataQuery = `
    SELECT
      id,
      outlet,
      no_nota,
      customer_nama,
      nama_item,
      keterangan,
      on_hold,
      isContinue,
      jumlah,
      satuan_item,
      tgl_terima,
      tgl_selesai,
      status,
      pickup_by,    pickup_at,
      cuci_jemur_by, cuci_jemur_at,
      cuci_jemur_deadline_at,
      packing_by,   packing_at,
      pengantaran_by, pengantaran_at,
      updated_by,
      updated_at
    FROM ${TRANSAKSI_TABLE}
    WHERE ${baseWhere}
    ORDER BY ${sortFieldSafe} ${sortDirSafe}, no_nota DESC, nama_item
    LIMIT ? OFFSET ?
  `;

  const params = [...dateParams, ...outletParams, ...searchParams, ...statusParams];

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
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ message: 'id wajib diisi' });
  }

  try {
    const [rows] = await cleanoxPool.query(
      `SELECT
        id, no_nota, outlet, customer_nama, alamat_customer, nama_item,
        keterangan,
        on_hold,
        isContinue, continue_by, catatan_cuci_jemur,
        jumlah, satuan_item,
        tgl_terima, tgl_selesai, status,
        pickup_by,    pickup_at,
        cuci_jemur_by, cuci_jemur_at,
        cuci_jemur_deadline_at,
        packing_by,   packing_at,
        pengantaran_by, pengantaran_at,
        catatan_by_cleanox,
        pickup_evidance_file, pickup_evidance_path,
        packing_evidance_file, packing_evidance_path,
        updated_by, updated_at
      FROM ${TRANSAKSI_TABLE}
      WHERE id = ?`,
      [id]
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

const VALID_STATUSES = STATUS_VALUES;

export const updateTracking = async (req, res) => {
  const { id, stage, employee_names, timestamp } = req.body;

  if (!id || !stage) {
    return res.status(400).json({ message: 'id dan stage wajib diisi' });
  }
  if (!STAGE_COLUMNS[stage]) {
    return res.status(400).json({ message: 'Stage tidak valid' });
  }
  if (!Array.isArray(employee_names) || employee_names.length === 0) {
    return res.status(400).json({ message: 'employee_names wajib diisi (array)' });
  }

  const col = STAGE_COLUMNS[stage];
  const ts = timestamp || new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

  const newStatus = stage;

  try {
    const [[currentRow]] = await cleanoxPool.query(
      `SELECT id, isContinue FROM ${TRANSAKSI_TABLE} WHERE id = ?`,
      [id]
    );

    if (!currentRow) {
      return res.status(404).json({ message: 'Data tidak ditemukan' });
    }

    const isProduksi = ['cleanox', 'produksi'].includes(req.user?.role);
    const isRejected = currentRow.isContinue === 0 || currentRow.isContinue === '0';
    if (isProduksi && isRejected) {
      return res.status(403).json({ message: 'Item dibatalkan frontliner. Tim produksi tidak dapat melanjutkan progres.' });
    }

    const setClauses = [
      `${col.by} = ?`,
      `${col.at} = ?`,
      'status = ?',
      'updated_by = ?',
      'updated_at = NOW()',
    ];
    const updateParams = [JSON.stringify(employee_names), ts, newStatus, employee_names.join(', ')];

    // Deadline tahap Cuci Jemur = 10 hari dari timestamp saat disimpan.
    if (stage === 'Cuci Jemur') {
      setClauses.push('cuci_jemur_deadline_at = DATE_ADD(?, INTERVAL 10 DAY)');
      updateParams.push(ts);
    }

    const [result] = await cleanoxPool.query(
      `UPDATE ${TRANSAKSI_TABLE}
       SET ${setClauses.join(', ')}
       WHERE id = ?`,
      [...updateParams, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Data tidak ditemukan' });
    }

    // Fetch updated row to get no_nota/nama_item for SSE payload
    const [[updatedRow]] = await cleanoxPool.query(
      `SELECT id, no_nota, nama_item, on_hold, isContinue, continue_by, catatan_cuci_jemur, cuci_jemur_deadline_at FROM ${TRANSAKSI_TABLE} WHERE id = ?`,
      [id]
    );

    const payload = {
      id, no_nota: updatedRow?.no_nota, nama_item: updatedRow?.nama_item, stage,
      on_hold: updatedRow?.on_hold ?? 0,
      isContinue: updatedRow?.isContinue ?? null,
      continue_by: updatedRow?.continue_by || null,
      catatan_cuci_jemur: updatedRow?.catatan_cuci_jemur || null,
      cuci_jemur_deadline_at: updatedRow?.cuci_jemur_deadline_at || null,
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
/* ── Update / delete catatan_by_cleanox ───────────────── */
export const updateCatatan = async (req, res) => {
  const { id, catatan } = req.body;

  if (!id) {
    return res.status(400).json({ message: 'id wajib diisi' });
  }

  // catatan can be empty string (to clear/delete)
  const catatanValue = catatan !== undefined ? catatan : null;

  try {
    const [result] = await cleanoxPool.query(
      `UPDATE ${TRANSAKSI_TABLE}
       SET catatan_by_cleanox = ?, updated_at = NOW()
       WHERE id = ?`,
      [catatanValue || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Data tidak ditemukan' });
    }

    return res.json({ message: 'Catatan berhasil diupdate', catatan: catatanValue || null });
  } catch (err) {
    console.error('[production/updateCatatan]', err.message);
    return res.status(500).json({ message: 'Gagal mengupdate catatan', error: err.message });
  }
};

/* ── On-hold request from Cleanox (Cuci Jemur) ───────── */
export const requestOnHold = async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ message: 'id wajib diisi' });
  }

  if (!['cleanox', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Hanya cleanox/admin yang bisa mengajukan on hold' });
  }

  try {
    const [result] = await cleanoxPool.query(
      `UPDATE ${TRANSAKSI_TABLE}
       SET on_hold = 1,
           isContinue = NULL,
           continue_by = NULL,
           catatan_cuci_jemur = NULL,
           updated_by = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [req.user?.name || req.user?.username || 'system', id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Data tidak ditemukan' });
    }

    const [[updatedRow]] = await cleanoxPool.query(
      `SELECT id, no_nota, nama_item, on_hold, isContinue, cuci_jemur_deadline_at FROM ${TRANSAKSI_TABLE} WHERE id = ?`,
      [id]
    );

    const payload = {
      id,
      no_nota: updatedRow?.no_nota,
      nama_item: updatedRow?.nama_item,
      on_hold: updatedRow?.on_hold ?? 1,
      isContinue: updatedRow?.isContinue ?? null,
      cuci_jemur_deadline_at: updatedRow?.cuci_jemur_deadline_at || null,
      status: updatedRow?.on_hold ? 'Tertunda' : updatedRow?.status,
      updated_at: new Date().toISOString(),
    };
    broadcast(payload);

    return res.json({ message: 'Item di-hold', ...payload });
  } catch (err) {
    console.error('[production/requestOnHold]', err.message);
    return res.status(500).json({ message: 'Gagal mengajukan on hold', error: err.message });
  }
};

/* ── Frontliner decision (Lanjut/Batal) ─────────────── */
export const decideCuciJemur = async (req, res) => {
  const { id, decision, catatan } = req.body;
  if (!id || !decision) {
    return res.status(400).json({ message: 'id dan decision wajib diisi' });
  }
  if (!['lanjut', 'batal'].includes(String(decision).toLowerCase())) {
    return res.status(400).json({ message: 'decision harus lanjut atau batal' });
  }
  if (!['frontliner', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Hanya frontliner/admin yang bisa melakukan keputusan' });
  }

  const isContinue = String(decision).toLowerCase() === 'lanjut' ? 1 : 0;
  const statusValue = 'Cuci Jemur';

  try {
    const [result] = await cleanoxPool.query(
      `UPDATE ${TRANSAKSI_TABLE}
       SET on_hold = 0,
           isContinue = ?,
           continue_by = ?,
           catatan_cuci_jemur = ?,
           status = ?,
           updated_by = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        isContinue,
        req.user?.name || req.user?.username || 'frontliner',
        catatan || null,
        statusValue,
        req.user?.name || req.user?.username || 'frontliner',
        id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Data tidak ditemukan' });
    }

    const [[updatedRow]] = await cleanoxPool.query(
      `SELECT id, no_nota, nama_item, on_hold, isContinue, continue_by, catatan_cuci_jemur, cuci_jemur_deadline_at FROM ${TRANSAKSI_TABLE} WHERE id = ?`,
      [id]
    );

    const payload = {
      id,
      no_nota: updatedRow?.no_nota,
      nama_item: updatedRow?.nama_item,
      on_hold: updatedRow?.on_hold ?? 0,
      isContinue: updatedRow?.isContinue ?? isContinue,
      continue_by: updatedRow?.continue_by || null,
      catatan_cuci_jemur: updatedRow?.catatan_cuci_jemur || null,
      cuci_jemur_deadline_at: updatedRow?.cuci_jemur_deadline_at || null,
      status: updatedRow?.on_hold ? 'Tertunda' : statusValue,
      updated_at: new Date().toISOString(),
    };
    broadcast(payload);

    return res.json({ message: 'Keputusan tersimpan', ...payload });
  } catch (err) {
    console.error('[production/decideCuciJemur]', err.message);
    return res.status(500).json({ message: 'Gagal menyimpan keputusan', error: err.message });
  }
};