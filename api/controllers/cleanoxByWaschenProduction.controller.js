import cleanoxPool from '../db/cleanox.js';

const TRANSAKSI_TABLE = process.env.NODE_ENV === 'development'
  ? 'rekap_transaksi_reguler_dev'
  : 'rekap_transaksi_reguler';

/* WAHA WhatsApp cabang */
const OUTLET_NUMBER = {
  'Waschen Raffles': '+62 822-1928-1920',
  'Waschen Citra Gran': '+62 821-2779-8574',
  'Wachen Sentrop': '+62 821-2198-5119',
  'Waschen Legenda': '+62 851-2233-2217',
  'Waschen Canadian': '+62 851-8818-8391',
};

/* ── WAHA WhatsApp notification ───────────────────────── */
const OUTLET_MENTION = {
  'Waschen Laundry Raffles Hills': ['6289530162883@c.us', '62895358199284@c.us'],
  'Waschen Citra Grand': ['6289616020108@c.us'],
  'Waschen Laundry Legenda Wisata': ['62895333561086@c.us'],
  'Waschen Laundry Canadian': ['6283896334423@c.us'],
  'Waschen Laundry Kota Wisata': ['628977300965@c.us'],
};

const OUTLET_SHORT = {
  'Waschen Laundry Raffles Hills': 'Raffles',
  'Waschen Citra Grand': 'Citra',
  'Waschen Laundry Legenda Wisata': 'Legenda',
  'Waschen Laundry Canadian': 'Canadian',
  'Waschen Laundry Kota Wisata': 'Kota Wisata',
};

/* WhatsApp link per outlet untuk pembayaran (dari OUTLET_NUMBER) */
const OUTLET_WHATSAPP_LINK = {
  'Waschen Laundry Raffles Hills': 'https://wa.me/6282219281920',
  'Waschen Citra Grand': 'https://wa.me/6282127798574',
  'Waschen Laundry Legenda Wisata': 'https://wa.me/6285122332217',
  'Waschen Laundry Canadian': 'https://wa.me/6285188188391',
  'Waschen Laundry Kota Wisata': 'https://wa.me/628977300965',
};

/* Cutoff waktu: notifikasi hanya untuk pengantaran_at setelah ini */
const NOTIF_START_CUTOFF = '2026-05-12 16:40:00'; // 16:40 WIB, 4 Mei 2026

/* Delay notifikasi setelah pengantaran_at (dalam menit) */
// Development: 1 menit (cepat), Production: 60 menit (1 jam)
const NOTIF_DELAY_MINUTES = process.env.NODE_ENV === 'development' ? 1 : 60;

async function sendOnHoldWaNotification({ id, no_nota, customer_nama, nama_item, outlet }) {
  const wahaUrl = process.env.WAHA_URL;
  const wahaApiKey = process.env.WAHA_API_KEY;
  const wahaSession = process.env.WAHA_SESSION_CLEANOX;
  const appUrl = (process.env.APP_URL || process.env.CORS_ORIGIN || '').replace(/\/$/, '');
  const groupId = process.env.NODE_ENV === 'development'
    ? '120363406439867993@g.us'
    : '120363418441595080@g.us';

  if (!wahaUrl || !wahaApiKey || !wahaSession) {
    console.warn('[production/onHold] WAHA env vars not set, skipping WA notification');
    return;
  }

  const mentionIds = OUTLET_MENTION[outlet] || [];
  const mentions = mentionIds;
  const mentionText = mentionIds.map((m) => `@${m.replace('@c.us', '')}`).join(' ');
  const outletShort = OUTLET_SHORT[outlet] || outlet || '-';

  const deepLink = appUrl
    ? `${appUrl}/cleanox-by-waschen-production?open_id=${id}&status=Tertunda`
    : null;

  const text =
    `🚨WARNING STATUS TERTUNDA🚨\n\n` +
    `No Nota : ${no_nota || '-'}\n` +
    `Nama Customer : ${customer_nama || '-'}\n` +
    `Nama Item : ${nama_item || '-'}\n` +
    `Cabang : ${outletShort}\n` +
    (deepLink ? `\nLink : ${deepLink}\n` : '') +
    `\nMohon dicek yaa! Terima kasih 🙏` +
    (mentionText ? `\n${mentionText}` : '');

  const body = { session: wahaSession, chatId: groupId, text };
  if (mentions.length > 0) body.mentions = mentions;

  const MAX_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 5000; // 5 seconds between retries

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout per attempt

      const resp = await fetch(`${wahaUrl}/api/sendText`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': wahaApiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (resp.ok) {
        console.log(`[production/onHold] WA notification sent to group (attempt ${attempt})`);
        return; // success — stop retrying
      }

      const errText = await resp.text().catch(() => '(no body)');
      console.error(`[production/onHold] WAHA sendText failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${resp.status}`);

      // Don't retry on client-side errors (4xx)
      if (resp.status >= 400 && resp.status < 500) break;

    } catch (err) {
      const reason = err.name === 'AbortError' ? 'request timed out (20s)' : err.message;
      console.error(`[production/onHold] WA notification error (attempt ${attempt}/${MAX_ATTEMPTS}): ${reason}`);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  console.error('[production/onHold] WA notification gave up after all attempts');
}

/* ── Send notification to customer after pengantaran_at + delay ──────── */
// items = array of { id, nama_item } untuk grouping per no_nota
async function sendPengantaranNotificationToCustomer({
  no_nota,
  customer_nama,
  customer_telepon,
  items, // array of { id, nama_item }
  outlet,
  total_tagihan,
  pembayaran,
}) {
  const wahaUrl = process.env.WAHA_URL;
  const wahaApiKey = process.env.WAHA_API_KEY;
  const wahaSession = process.env.WAHA_SESSION_CLEANOX;

  if (!wahaUrl || !wahaApiKey || !wahaSession) {
    console.warn('[production/pengantaranNotif] WAHA env vars not set, skipping');
    return { success: false, reason: 'WAHA not configured' };
  }

  // Format phone number to WhatsApp format (62xxx@c.us)
  let phone = (customer_telepon || '').replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '62' + phone.slice(1);
  if (!phone.startsWith('62')) phone = '62' + phone;
  if (phone.length < 10) {
    console.warn(`[production/pengantaranNotif] Invalid phone: ${customer_telepon}`);
    return { success: false, reason: 'Invalid phone number' };
  }
  const chatId = `${phone}@c.us`;

  const waLink = OUTLET_WHATSAPP_LINK[outlet] || '#';
  const isLunas = (pembayaran || '').toLowerCase() === 'lunas';
  const statusText = isLunas ? 'Lunas' : 'Belum Lunas';
  const formattedTagihan = total_tagihan
    ? `Rp ${Number(total_tagihan).toLocaleString('id-ID')}`
    : 'Rp _';

  // Format items as list
  const itemList = items.map((it, idx) => `${idx + 1}. ${it.nama_item || '-'}`).join('\n');

  let text;
  if (isLunas) {
    text =
      `Halo Kak, Kami dari Cleanox by Waschen 😊\n` +
      `Khusus layanan pencucian item besar seperti karpet, stroller, boneka, dll.\n\n` +
      `Minox ingin menginformasikan bahwa item Kakak sudah selesai diproses & siap diambil di ${outlet || '-'} 🙌\n\n` +
      `Detail:\n` +
      `* Nama: ${customer_nama || '-'}\n` +
      `* No. Nota: ${no_nota || '-'}\n` +
      `* Item:\n${itemList}\n` +
      `* Total Tagihan: ${formattedTagihan}\n` +
      `* Status: ${statusText}\n\n` +
      `Item bisa langsung diambil atau dijadwalkan pengantaran 🚚\n` +
      `Jadwal pengantaran:\n` +
      `* Selasa\n` +
      `* Kamis\n` +
      `* Sabtu\n\n` +
      `Mohon konfirmasinya agar item tetap dalam kondisi fresh & siap digunakan ✨\n` +
      `Terima kasih 🙏`;
  } else {
    text =
      `Halo Kak, Kami dari Cleanox by Waschen 😊\n` +
      `Khusus layanan pencucian item besar seperti karpet, stroller, boneka, dll.\n\n` +
      `Minox ingin menginformasikan bahwa item Kakak sudah selesai diproses & siap diambil di ${outlet || '-'} 🙌\n\n` +
      `Detail:\n` +
      `* Nama: ${customer_nama || '-'}\n` +
      `* No. Nota: ${no_nota || '-'}\n` +
      `* Item:\n${itemList}\n` +
      `* Total Tagihan: ${formattedTagihan}\n` +
      `* Status: ${statusText}\n\n` +
      `Untuk mempercepat proses pengambilan, Kakak bisa langsung konfirmasi pembayaran melalui WhatsApp cabang di bawah ini ya 👇\n` +
      `👉 ${waLink}\n\n` +
      `Setelah pembayaran, item bisa langsung diambil atau dijadwalkan pengantaran 🚚\n\n` +
      `Jadwal pengantaran:\n` +
      `* Selasa\n` +
      `* Kamis\n` +
      `* Sabtu\n\n` +
      `Catatan:\n` +
      `Item akan diprioritaskan untuk pengantaran setelah pembayaran dikonfirmasi ya Kak 🙏\n\n` +
      `Kami sarankan untuk segera diproses agar item tetap dalam kondisi fresh & siap digunakan ✨\n` +
      `Terima kasih 🙏`;
  }

  const body = { session: wahaSession, chatId, text };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const resp = await fetch(`${wahaUrl}/api/sendText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': wahaApiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (resp.ok) {
      console.log(`[production/pengantaranNotif] Sent to ${chatId} (no_nota: ${no_nota}, items: ${items.length})`);
      return { success: true };
    }

    const errText = await resp.text().catch(() => '(no body)');
    console.error(`[production/pengantaranNotif] WAHA failed: ${resp.status} - ${errText}`);
    return { success: false, reason: `WAHA error: ${resp.status}` };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.message;
    console.error(`[production/pengantaranNotif] Error: ${reason}`);
    return { success: false, reason };
  }
}

/* ── Scheduler: check pengantaran_at + delay and send notification ──── */
export async function runPengantaranNotificationScheduler() {
  const wahaUrl = process.env.WAHA_URL;
  const wahaApiKey = process.env.WAHA_API_KEY;
  const wahaSession = process.env.WAHA_SESSION_CLEANOX;

  if (!wahaUrl || !wahaApiKey || !wahaSession) {
    return; // WAHA not configured, skip silently
  }

  try {
    // Find items where:
    // - pengantaran_at is NOT NULL
    // - pengantaran_at + delay <= NOW()
    // - notifikasi_pengantaran_sent_at IS NULL (not yet notified)
    // - pengantaran_at >= NOTIF_START_CUTOFF (hanya data setelah 16:40 WIB 4 Mei 2026)
    const [rows] = await cleanoxPool.query(
      `SELECT
        id, no_nota, customer_nama, customer_telepon, nama_item, outlet,
        total_tagihan, pembayaran, pengantaran_at
       FROM ${TRANSAKSI_TABLE}
       WHERE pengantaran_at IS NOT NULL
         AND DATE_ADD(pengantaran_at, INTERVAL ? MINUTE) <= NOW()
         AND pengantaran_at >= ?
         AND notifikasi_pengantaran_sent_at IS NULL
         AND (LOWER(COALESCE(nama_item,'')) LIKE '%cleanox%'
           OR LOWER(COALESCE(nama_item,'')) LIKE '%karpet%')
       LIMIT 50`,
      [NOTIF_DELAY_MINUTES, NOTIF_START_CUTOFF]
    );

    if (rows.length === 0) return;

    console.log(`[production/scheduler] Found ${rows.length} items for pengantaran notification`);

    // Group by no_nota
    const grouped = {};
    for (const row of rows) {
      const key = row.no_nota || `__no_nota_${row.id}`;
      if (!grouped[key]) {
        grouped[key] = {
          no_nota: row.no_nota,
          customer_nama: row.customer_nama,
          customer_telepon: row.customer_telepon,
          outlet: row.outlet,
          total_tagihan: row.total_tagihan,
          pembayaran: row.pembayaran,
          items: [],
        };
      }
      grouped[key].items.push({ id: row.id, nama_item: row.nama_item });
    }

    // Send 1 notification per no_nota
    for (const group of Object.values(grouped)) {
      const result = await sendPengantaranNotificationToCustomer({
        no_nota: group.no_nota,
        customer_nama: group.customer_nama,
        customer_telepon: group.customer_telepon,
        items: group.items,
        outlet: group.outlet,
        total_tagihan: group.total_tagihan,
        pembayaran: group.pembayaran,
      });

      if (result.success) {
        // Mark all items in this no_nota as sent
        const ids = group.items.map((it) => it.id);
        if (ids.length > 0) {
          await cleanoxPool.query(
            `UPDATE ${TRANSAKSI_TABLE}
             SET notifikasi_pengantaran_sent_at = NOW()
             WHERE id IN (${ids.map(() => '?').join(', ')})`,
            ids
          );
        }
      } else {
        console.warn(`[production/scheduler] Failed to notify no_nota ${group.no_nota}: ${result.reason}`);
      }
    }
  } catch (err) {
    console.error('[production/scheduler] Error:', err.message);
  }
}

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
    page = 1,
    limit = 25,
    search,
    status,
  } = req.query;

  if (!date_start || !date_end) {
    return res.status(400).json({ message: 'Parameter date_start dan date_end wajib diisi' });
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const dateFieldSafe = date_field === 'tgl_selesai' ? 'tgl_selesai' : 'tgl_terima';
  const SORT_WHITELIST = ['tgl_terima', 'tgl_selesai'];
  const sortFieldSafe = SORT_WHITELIST.includes(sort_key) ? sort_key : dateFieldSafe;
  const sortDirSafe = sort_dir === 'asc' ? 'ASC' : 'DESC';
  const outletWhere = outlet ? 'AND outlet = ?' : '';
  const outletParams = outlet ? [outlet] : [];
  const dateParams = [date_start, date_end];
  const searchTerm = typeof search === 'string' ? search.trim().toLowerCase() : '';
  const searchWhere = searchTerm
    ? `AND (
      LOWER(COALESCE(no_nota, '')) LIKE ?
      OR LOWER(COALESCE(customer_nama, '')) LIKE ?
      OR LOWER(COALESCE(outlet, '')) LIKE ?
      OR LOWER(COALESCE(nama_item, '')) LIKE ?
      OR LOWER(COALESCE(status, '')) LIKE ?
    )`
    : '';
  const searchParams = searchTerm ? Array(5).fill(`%${searchTerm}%`) : [];
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
    AND LOWER(COALESCE(customer_nama,'')) NOT LIKE '%dummy%'
    AND LOWER(COALESCE(customer_nama,'')) NOT LIKE '%test%'
    AND LOWER(COALESCE(customer_nama,'')) NOT LIKE '%haji%'
    AND LOWER(COALESCE(customer_nama,'')) NOT LIKE '%tni%'
    AND LOWER(COALESCE(nama_item,'')) NOT LIKE '%haji%'
    AND LOWER(COALESCE(nama_item,'')) NOT LIKE '%tni%'
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
      cleanoxPool.query(dataQuery, [...params, limitNum, offset]),
    ]);

    const total = Number(statsResult[0][0]?.total || 0);

    return res.json({
      data: dataResult[0],
      stats: { total },
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
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
        id, no_nota, outlet, customer_nama, customer_telepon, alamat_customer, nama_item,
        keterangan,
        on_hold,
        isContinue, continue_by, catatan_cuci_jemur,
        jumlah, satuan_item,
        total_tagihan, pembayaran,
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
    row.pickup_by = parseJson(row.pickup_by);
    row.cuci_jemur_by = parseJson(row.cuci_jemur_by);
    row.packing_by = parseJson(row.packing_by);
    row.pengantaran_by = parseJson(row.pengantaran_by);

    // Check if ALL items under same no_nota are fully complete (pengantaran_at filled)
    let all_nota_complete = false;
    if (row.no_nota) {
      const [[notaStats]] = await cleanoxPool.query(
        `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN pengantaran_at IS NOT NULL THEN 1 ELSE 0 END) AS done
         FROM ${TRANSAKSI_TABLE}
         WHERE no_nota = ?
           AND (LOWER(COALESCE(nama_item,'')) LIKE '%cleanox%'
             OR LOWER(COALESCE(nama_item,'')) LIKE '%karpet%')`,
        [row.no_nota]
      );
      const total = Number(notaStats?.total || 0);
      const done = Number(notaStats?.done || 0);
      all_nota_complete = total > 0 && done === total;
    } else {
      // Single item with no nota — complete if this item itself has pengantaran_at
      all_nota_complete = !!row.pengantaran_at;
    }

    return res.json({ tracking: { ...row, all_nota_complete } });
  } catch (err) {
    console.error('[production/getTracking]', err.message);
    return res.status(500).json({ message: 'Gagal mengambil data tracking' });
  }
};

/* ── Update tracking stage ────────────────────────────── */
const STAGE_COLUMNS = {
  Pickup: { by: 'pickup_by', at: 'pickup_at' },
  'Cuci Jemur': { by: 'cuci_jemur_by', at: 'cuci_jemur_at' },
  Packing: { by: 'packing_by', at: 'packing_at' },
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
      'on_hold = 0',
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
/* ── Clear (delete) a tracking stage — admin only ───────── */
const STAGE_ORDER = ['Pickup', 'Cuci Jemur', 'Packing', 'Pengantaran'];

export const clearTracking = async (req, res) => {
  const { id, stage } = req.body;
  if (!id || !stage) {
    return res.status(400).json({ message: 'id dan stage wajib diisi' });
  }
  if (!STAGE_COLUMNS[stage]) {
    return res.status(400).json({ message: 'Stage tidak valid' });
  }
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Hanya admin yang bisa menghapus progres' });
  }

  // Cascade: clear this stage AND all stages after it
  const stageIdx = STAGE_ORDER.indexOf(stage);
  const stagesToClear = STAGE_ORDER.slice(stageIdx);

  // Build SET clauses for each cleared stage
  const setClauses = ['updated_by = ?', 'updated_at = NOW()'];
  const params = [req.user?.name || req.user?.username || 'admin'];

  for (const s of stagesToClear) {
    const col = STAGE_COLUMNS[s];
    setClauses.push(`${col.by} = NULL`, `${col.at} = NULL`);
    if (s === 'Cuci Jemur') setClauses.push('cuci_jemur_deadline_at = NULL');
  }

  // New status = the stage just before the one being cleared, or NULL if clearing Pickup
  const prevStage = stageIdx > 0 ? STAGE_ORDER[stageIdx - 1] : null;
  setClauses.push('status = ?');
  params.push(prevStage);

  // Also reset on_hold / isContinue if Cuci Jemur or earlier is cleared
  if (stageIdx <= 1) {
    setClauses.push('on_hold = 0', 'isContinue = NULL', 'continue_by = NULL', 'catatan_cuci_jemur = NULL');
  }

  params.push(id);

  try {
    const [result] = await cleanoxPool.query(
      `UPDATE ${TRANSAKSI_TABLE} SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Data tidak ditemukan' });
    }

    const [[updatedRow]] = await cleanoxPool.query(
      `SELECT id, no_nota, nama_item, on_hold, isContinue, continue_by, catatan_cuci_jemur, cuci_jemur_deadline_at, status FROM ${TRANSAKSI_TABLE} WHERE id = ?`,
      [id]
    );

    const payload = {
      id,
      no_nota: updatedRow?.no_nota,
      nama_item: updatedRow?.nama_item,
      stage,
      cleared: true,
      cascaded: stagesToClear,
      on_hold: updatedRow?.on_hold ?? 0,
      isContinue: updatedRow?.isContinue ?? null,
      continue_by: updatedRow?.continue_by || null,
      catatan_cuci_jemur: updatedRow?.catatan_cuci_jemur || null,
      cuci_jemur_deadline_at: updatedRow?.cuci_jemur_deadline_at || null,
      status: updatedRow?.status || null,
      updated_at: new Date().toISOString(),
    };
    broadcast(payload);

    return res.json({ message: `Progres ${stage} berhasil dihapus`, ...payload });
  } catch (err) {
    console.error('[production/clearTracking]', err.message);
    return res.status(500).json({ message: 'Gagal menghapus progres', error: err.message });
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
      `SELECT id, no_nota, nama_item, outlet, customer_nama, on_hold, isContinue, cuci_jemur_deadline_at FROM ${TRANSAKSI_TABLE} WHERE id = ?`,
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

    // Send WA notification to production group (fire-and-forget)
    sendOnHoldWaNotification({
      id,
      no_nota: updatedRow?.no_nota,
      customer_nama: updatedRow?.customer_nama,
      nama_item: updatedRow?.nama_item,
      outlet: updatedRow?.outlet,
    });

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

/* ── Manual customer notification (Admin only) ───────── */
export const sendManualCustomerNotification = async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ message: 'id wajib diisi' });

  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Hanya admin yang bisa mengirim notifikasi manual' });
  }

  try {
    // Look up the item
    const [[main]] = await cleanoxPool.query(
      `SELECT id, no_nota, customer_nama, customer_telepon, nama_item, outlet,
              total_tagihan, pembayaran
       FROM ${TRANSAKSI_TABLE} WHERE id = ?`,
      [id]
    );
    if (!main) return res.status(404).json({ message: 'Data tidak ditemukan' });

    // Group all items sharing the same no_nota
    let items;
    if (main.no_nota) {
      const [grouped] = await cleanoxPool.query(
        `SELECT id, nama_item FROM ${TRANSAKSI_TABLE}
         WHERE no_nota = ?
         AND (LOWER(COALESCE(nama_item,'')) LIKE '%cleanox%'
           OR LOWER(COALESCE(nama_item,'')) LIKE '%karpet%')`,
        [main.no_nota]
      );
      items = grouped.length > 0 ? grouped : [{ id: main.id, nama_item: main.nama_item }];
    } else {
      items = [{ id: main.id, nama_item: main.nama_item }];
    }

    const result = await sendPengantaranNotificationToCustomer({
      no_nota: main.no_nota,
      customer_nama: main.customer_nama,
      customer_telepon: main.customer_telepon,
      items,
      outlet: main.outlet,
      total_tagihan: main.total_tagihan,
      pembayaran: main.pembayaran,
    });

    if (result.success) {
      return res.json({ success: true, message: 'Notifikasi berhasil dikirim' });
    }
    return res.status(500).json({ success: false, message: result.reason || 'Gagal mengirim notifikasi' });
  } catch (err) {
    console.error('[production/sendManualNotif]', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
};