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

/* ── Get production data (status tracking) ────────────── */
export const getData = async (req, res) => {
  const {
    date_start,
    date_end,
    outlet,
    date_field = 'tgl_terima',
    page  = 1,
    limit = 25,
  } = req.query;

  if (!date_start || !date_end) {
    return res.status(400).json({ message: 'Parameter date_start dan date_end wajib diisi' });
  }

  const pageNum  = Math.max(1, parseInt(page,  10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset   = (pageNum - 1) * limitNum;

  const dateFieldSafe  = date_field === 'tgl_selesai' ? 'tgl_selesai' : 'tgl_terima';
  const outletWhere    = outlet ? 'AND nf.outlet = ?' : '';
  const outletParams   = outlet ? [outlet] : [];
  const dateParams     = [date_start, date_end];

  const statsQuery = `
    WITH nota_flag AS (
        SELECT
            no_nota    COLLATE utf8mb4_unicode_ci AS no_nota,
            MAX(outlet) COLLATE utf8mb4_unicode_ci AS outlet,
            MAX(CASE
                WHEN LOWER(COALESCE(nama_item,'')) LIKE '%cleanox%'
                  OR LOWER(COALESCE(nama_item,'')) LIKE '%karpet%'
                THEN 1 ELSE 0
            END) AS is_cleanox
        FROM rekap_transaksi_reguler
        WHERE DATE(${dateFieldSafe}) BETWEEN DATE(?) AND DATE(?)
        GROUP BY 1
        HAVING is_cleanox = 1
    )
    SELECT COUNT(*) AS total
    FROM nota_flag nf
    WHERE 1=1 ${outletWhere}
  `;

  const dataQuery = `
    WITH nota_flag AS (
        SELECT
            no_nota    COLLATE utf8mb4_unicode_ci AS no_nota,
            MAX(outlet)        COLLATE utf8mb4_unicode_ci AS outlet,
            MAX(customer_nama)  AS customer_nama,
            MAX(tgl_terima)     AS tgl_terima,
            MAX(tgl_selesai)    AS tgl_selesai,
            MAX(status)         AS status,
            MAX(updated_by)     AS updated_by,
            MAX(updated_at)     AS updated_at,
            MAX(CASE
                WHEN LOWER(COALESCE(nama_item,'')) LIKE '%cleanox%'
                  OR LOWER(COALESCE(nama_item,'')) LIKE '%karpet%'
                THEN 1 ELSE 0
            END) AS is_cleanox
        FROM rekap_transaksi_reguler
        WHERE DATE(${dateFieldSafe}) BETWEEN DATE(?) AND DATE(?)
        GROUP BY 1
        HAVING is_cleanox = 1
    )
    SELECT
        nf.outlet,
        nf.no_nota,
        nf.customer_nama,
        nf.tgl_terima,
        nf.tgl_selesai,
        nf.status,
        nf.updated_by,
        nf.updated_at
    FROM nota_flag nf
    WHERE 1=1 ${outletWhere}
    ORDER BY nf.tgl_terima DESC, nf.no_nota DESC
    LIMIT ? OFFSET ?
  `;

  try {
    const [statsResult, dataResult] = await Promise.all([
      cleanoxPool.query(statsQuery, [...dateParams, ...outletParams]),
      cleanoxPool.query(dataQuery,  [...dateParams, ...outletParams, limitNum, offset]),
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

/* ── Update status ────────────────────────────────────── */
export const updateStatus = async (req, res) => {
  const { no_nota } = req.params;
  const { status } = req.body;

  const VALID_STATUSES = ['Pickup', 'Cuci Jemur', 'Packing', 'Pengantaran'];
  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Status tidak valid' });
  }

  try {
    const [[employee]] = await cleanoxPool.query(
      'SELECT name FROM mst_employee WHERE id = ? LIMIT 1',
      [req.user?.id]
    );
    const updated_by = employee?.name || req.user?.name || 'unknown';

    const [result] = await cleanoxPool.query(
      `UPDATE rekap_transaksi_reguler
       SET status = ?, updated_by = ?, updated_at = NOW()
       WHERE no_nota = ?`,
      [status, updated_by, no_nota]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Nota tidak ditemukan' });
    }

    const updated_at = new Date().toISOString();
    const payload = { no_nota, status, updated_by, updated_at };
    for (const client of sseClients) {
      client.write(`data: ${JSON.stringify(payload)}\n\n`);
    }

    return res.json({ message: 'Status berhasil diupdate', ...payload });
  } catch (err) {
    console.error('[production/updateStatus]', err.message);
    return res.status(500).json({ message: 'Gagal mengupdate status', error: err.message });
  }
};
