import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import sharp from 'sharp';
import jwt from 'jsonwebtoken';
import { cleanoxPosPool, aloraPool } from '../db/cleanox.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ── Storage directory ──────────────────────────────────── */
const STORAGE_BASE = process.env.UPLOAD_BASE_DIR
  ? path.resolve(process.env.UPLOAD_BASE_DIR)
  : path.resolve(__dirname, '../../src/assets');

const TAKEHOME_EVIDENCE_BASE = path.join(STORAGE_BASE, 'worker-takehome-evidence');
if (!fs.existsSync(TAKEHOME_EVIDENCE_BASE)) {
  fs.mkdirSync(TAKEHOME_EVIDENCE_BASE, { recursive: true });
}

/* ── Remote Prod Fallback URL ───────────────────────────── */
const REMOTE_PROD_URL = (process.env.CLEANOX_PROD_API_URL || 'https://app.cleanoxindonesia.com').replace(/\/$/, '');

/* ── Stages Configuration ───────────────────────────────── */
export const TAKEHOME_STAGE_ORDER = [
  'diambil',
  'dicuci',
  'packing',
  'diantar',
  'pengantaran',
];

export const TAKEHOME_STAGE_LABELS = {
  diambil: 'Diambil',
  dicuci: 'Dicuci',
  packing: 'Packing',
  diantar: 'Diantar',
  pengantaran: 'Pengantaran',
};

function isValidStage(stage) {
  return TAKEHOME_STAGE_ORDER.includes(String(stage || '').trim().toLowerCase());
}

function stageColumns(stage) {
  const s = String(stage || '').trim().toLowerCase();
  return {
    by: `${s}_by`,
    at: `${s}_at`,
    file: `${s}_photo_file`,
    path: `${s}_photo_path`,
  };
}

function parseWorkersJson(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return Array.isArray(value) ? value : [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseWorkersBody(input, defaultWorker = null) {
  let list = [];
  if (Array.isArray(input)) list = input;
  else if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) list = parsed;
      else if (parsed) list = [parsed];
    } catch {
      list = input.split(',').map((name) => ({ employee_name: name.trim() }));
    }
  } else if (input && typeof input === 'object') {
    list = [input];
  }

  const normalized = list
    .map((item) => {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        return trimmed ? { employee_id: null, employee_name: trimmed } : null;
      }
      const id = item?.employee_id != null && Number(item.employee_id) > 0 ? Number(item.employee_id) : null;
      const name = String(item?.employee_name || item?.full_name || item?.name || '').trim();
      if (!name) return null;
      return { employee_id: id, employee_name: name };
    })
    .filter(Boolean);

  if (normalized.length === 0 && defaultWorker?.employee_name) {
    normalized.push({
      employee_id: defaultWorker.employee_id || null,
      employee_name: defaultWorker.employee_name,
    });
  }
  return normalized;
}

function formatMysqlDateTime(value) {
  if (!value) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
    if (match) return `${match[1]} ${match[2].length === 5 ? `${match[2]}:00` : match[2]}`;
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function compressImage(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/* ── Multer upload config ───────────────────────────────── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype) || /\.(jpe?g|png|webp)$/i.test(file.originalname)) {
      return cb(null, true);
    }
    cb(new Error('File evidence harus berupa gambar (JPG, PNG, WEBP)'));
  },
});

export const takeHomeUploadMiddleware = upload.single('photo');

/* ── Get Take Home Workers (Company ID = 3 + Admin) ─────── */
export const getTakeHomeWorkers = async (_req, res) => {
  try {
    const [rows] = await aloraPool.query(
      `SELECT employee_id, full_name, phone_number, email
       FROM mst_employee
       WHERE company_id = 3
         AND exit_date IS NULL
       ORDER BY full_name ASC`
    );

    const workers = (rows || []).map((r) => ({
      employee_id: Number(r.employee_id),
      full_name: r.full_name,
      phone_number: r.phone_number,
      email: r.email,
    }));

    return res.json({ workers });
  } catch (err) {
    console.error('[takehome/getTakeHomeWorkers]', err.message);
    return res.status(500).json({ message: 'Gagal mengambil data pekerja Take Home', error: err.message });
  }
};

/* ── Get Take Home Transactions List ────────────────────── */
export const getTakeHomeTransactions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      stage = '',
      status = '',
      date_start = '',
      date_end = '',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const whereClauses = ["t.service_mode = 'take_home'"];
    const params = [];

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      whereClauses.push(
        `(LOWER(COALESCE(t.transaction_no, '')) LIKE ? 
          OR LOWER(COALESCE(t.customer_name, '')) LIKE ? 
          OR LOWER(COALESCE(t.customer_phone, '')) LIKE ?
          OR LOWER(COALESCE(t.customer_address, '')) LIKE ?
          OR LOWER(COALESCE(s.name, '')) LIKE ?)`
      );
      params.push(q, q, q, q, q);
    }

    if (status && status.trim()) {
      whereClauses.push('t.status = ?');
      params.push(status.trim());
    }

    if (date_start && date_start.trim()) {
      whereClauses.push('DATE(t.service_date) >= ?');
      params.push(date_start.trim());
    }
    if (date_end && date_end.trim()) {
      whereClauses.push('DATE(t.service_date) <= ?');
      params.push(date_end.trim());
    }

    if (stage && isValidStage(stage)) {
      whereClauses.push('p.status = ?');
      params.push(stage.trim().toLowerCase());
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count Query (per service item)
    const countSql = `
      SELECT COUNT(*) AS total
      FROM tr_transactions t
      LEFT JOIN tr_transaction_items i ON i.transaction_id = t.id
      LEFT JOIN mst_services s ON s.id = i.service_id
      LEFT JOIN tr_takehome_progress p ON p.transaction_id = t.id
      ${whereSql}
    `;
    const [[{ total }]] = await cleanoxPosPool.query(countSql, params);

    // Data Query (per service item)
    const dataSql = `
      SELECT
        t.id AS transaction_id,
        t.transaction_no,
        t.customer_id,
        t.customer_name,
        t.customer_phone,
        t.customer_address,
        t.service_date,
        t.status AS transaction_status,
        t.service_mode,
        t.total_people,
        t.final_amount AS total_price,
        t.subtotal_amount,
        t.notes,
        t.created_at,
        t.updated_at,
        i.id AS item_id,
        i.service_id,
        i.qty,
        i.meter,
        i.unit_label,
        COALESCE(s.name, 'Layanan') AS service_name,
        s.takehome_days,
        s.sla_hari,
        s.duration_value,
        s.duration_unit,
        p.id AS progress_id,
        p.status AS progress_status,
        p.diambil_by, p.diambil_at, p.diambil_photo_file, p.diambil_photo_path,
        p.dicuci_by, p.dicuci_at, p.dicuci_photo_file, p.dicuci_photo_path,
        p.packing_by, p.packing_at, p.packing_photo_file, p.packing_photo_path,
        p.diantar_by, p.diantar_at, p.diantar_photo_file, p.diantar_photo_path,
        p.pengantaran_by, p.pengantaran_at, p.pengantaran_photo_file, p.pengantaran_photo_path,
        p.updated_at AS progress_updated_at
      FROM tr_transactions t
      LEFT JOIN tr_transaction_items i ON i.transaction_id = t.id
      LEFT JOIN mst_services s ON s.id = i.service_id
      LEFT JOIN tr_takehome_progress p ON p.transaction_id = t.id
      ${whereSql}
      ORDER BY t.service_date DESC, t.id DESC, i.id ASC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await cleanoxPosPool.query(dataSql, [...params, limitNum, offset]);

    // Fetch items for current page transactions (for modal & details)
    const txIds = [...new Set(rows.map((r) => r.transaction_id).filter(Boolean))];
    let itemsMap = new Map();
    if (txIds.length > 0) {
      const [itemRows] = await cleanoxPosPool.query(
        `SELECT i.transaction_id, i.id AS item_id, i.qty, i.unit_label, COALESCE(s.name, 'Layanan') AS service_name,
                s.takehome_days, s.sla_hari, s.duration_value, s.duration_unit
         FROM tr_transaction_items i
         LEFT JOIN mst_services s ON s.id = i.service_id
         WHERE i.transaction_id IN (?)
         ORDER BY i.id ASC`,
        [txIds]
      );
      for (const item of itemRows || []) {
        const id = Number(item.transaction_id);
        if (!itemsMap.has(id)) itemsMap.set(id, []);

        let thDays = null;
        if (item.takehome_days != null && Number(item.takehome_days) > 0) {
          thDays = Number(item.takehome_days);
        } else if (item.sla_hari != null && Number(item.sla_hari) > 0) {
          thDays = Number(item.sla_hari);
        } else if (String(item.duration_unit || '').toLowerCase() === 'hari' && Number(item.duration_value) > 0) {
          thDays = Number(item.duration_value);
        }

        itemsMap.get(id).push({
          item_id: item.item_id,
          service_name: item.service_name,
          qty: item.qty,
          unit: item.unit_label,
          takehome_days: thDays,
        });
      }
    }

    // Format rows with timeline stages
    const transactions = rows.map((r) => {
      // Calculate estimated days specifically for THIS service item
      let itemEstimatedDays = null;
      if (r.takehome_days != null && Number(r.takehome_days) > 0) {
        itemEstimatedDays = Number(r.takehome_days);
      } else if (r.sla_hari != null && Number(r.sla_hari) > 0) {
        itemEstimatedDays = Number(r.sla_hari);
      } else if (String(r.duration_unit || '').toLowerCase() === 'hari' && Number(r.duration_value) > 0) {
        itemEstimatedDays = Number(r.duration_value);
      }

      // Calculate estimated completion date: service_date + itemEstimatedDays
      let estimatedCompletionDate = null;
      if (itemEstimatedDays != null && r.service_date) {
        const d = new Date(r.service_date);
        if (!Number.isNaN(d.getTime())) {
          d.setDate(d.getDate() + itemEstimatedDays);
          estimatedCompletionDate = d.toISOString();
        }
      }

      const txItems = itemsMap.get(Number(r.transaction_id)) || [];

      const stages = TAKEHOME_STAGE_ORDER.map((stg) => {
        const cols = stageColumns(stg);
        const photoFile = r[cols.file] || null;
        // Make sure frontend accesses via /api/cleanox-takehome/evidence/:file
        const photoPath = photoFile ? `/api/cleanox-takehome/evidence/${photoFile}` : (r[cols.path] || null);
        const at = r[cols.at] || null;
        const by = parseWorkersJson(r[cols.by]);
        return {
          key: stg,
          label: TAKEHOME_STAGE_LABELS[stg],
          filled: Boolean(at && (photoFile || photoPath)),
          at,
          by,
          photo_file: photoFile,
          photo_path: photoPath,
        };
      });

      const nextStageObj = stages.find((s) => !s.filled);
      const isAllComplete = stages.every((s) => s.filled);

      return {
        id: r.item_id ? `${r.transaction_id}_${r.item_id}` : r.transaction_id,
        transaction_id: r.transaction_id,
        item_id: r.item_id,
        transaction_no: r.transaction_no,
        customer_name: r.customer_name,
        customer_phone: r.customer_phone,
        customer_address: r.customer_address,
        service_date: r.service_date,
        service_name: r.service_name,
        item_qty: r.qty,
        item_unit: r.unit_label,
        item_meter: r.meter,
        estimated_days: itemEstimatedDays,
        estimated_completion_date: estimatedCompletionDate,
        transaction_status: r.transaction_status,
        service_mode: r.service_mode,
        total_people: r.total_people,
        total_price: r.total_price,
        notes: r.notes,
        items: txItems,
        takehome_progress: {
          id: r.progress_id,
          status: r.progress_status || (isAllComplete ? 'pengantaran' : (nextStageObj?.key || null)),
          next_stage: isAllComplete ? null : (nextStageObj?.key || null),
          all_complete: isAllComplete,
          stages,
          updated_at: r.progress_updated_at || r.updated_at,
        },
      };
    });

    return res.json({
      data: transactions,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error('[takehome/getTakeHomeTransactions]', err.message);
    return res.status(500).json({ message: 'Gagal mengambil data Take Home', error: err.message });
  }
};

/* ── Get Available Cutoff Periods ───────────────────────── */
export const getTakeHomeAvailablePeriods = async (req, res) => {
  try {
    const [rows] = await cleanoxPosPool.query(
      `SELECT DISTINCT
         CASE
           WHEN DAY(service_date) >= 26 THEN
             CASE WHEN MONTH(service_date) = 12 THEN YEAR(service_date) + 1 ELSE YEAR(service_date) END
           ELSE YEAR(service_date)
         END AS yr,
         CASE
           WHEN DAY(service_date) >= 26 THEN
             CASE WHEN MONTH(service_date) = 12 THEN 1 ELSE MONTH(service_date) + 1 END
           ELSE MONTH(service_date)
         END AS mo
       FROM tr_transactions
       WHERE service_mode = 'take_home' AND service_date IS NOT NULL
       ORDER BY yr DESC, mo DESC`
    );

    const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const jktDate = now.getUTCDate();
    const jktMonth = now.getUTCMonth() + 1;
    const jktYear = now.getUTCFullYear();

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

    return res.json({
      periods: rows,
      active: { yr: activeYear, mo: activeMonth },
    });
  } catch (err) {
    console.error('[takehome/getTakeHomeAvailablePeriods]', err.message);
    return res.status(500).json({ message: 'Gagal mengambil periode', error: err.message });
  }
};

/* ── Serve Evidence Photo (Pure Streaming Proxy, No Local Disk Write) ── */
export const serveTakeHomeEvidence = async (req, res) => {
  try {
    const rawName = path.basename(req.params.filename || '');
    if (!rawName) return res.status(400).json({ message: 'Nama file tidak valid' });

    // 1. Check if legacy file already exists on local disk
    const localPath = path.join(TAKEHOME_EVIDENCE_BASE, rawName);
    if (fs.existsSync(localPath)) {
      return res.sendFile(localPath);
    }

    // 2. Check if legacy file exists in cleanox-app sibling directory (read-only, no local copy)
    const siblingPaths = [
      path.resolve(__dirname, '../../../../cleanox-app/src/assets/worker-takehome-evidence', rawName),
      path.resolve('d:/Alora Group Indonesia/Alora Group Indonesia/cleanox-app/src/assets/worker-takehome-evidence', rawName),
    ];
    for (const sib of siblingPaths) {
      if (fs.existsSync(sib)) {
        return res.sendFile(sib);
      }
    }

    // 3. Fetch from remote cleanox-app production and stream directly to client
    const prodSecret = process.env.CLEANOX_PROD_SECRET || 'supersecretcleanox!';
    const prodToken = jwt.sign(
      { id: 1, username: 'admin', role: 'admin', isManagement: true, company_id: 1 },
      prodSecret,
      { expiresIn: '2h' }
    );

    const remoteEndpoints = [
      `${REMOTE_PROD_URL}/api/pos-transactions/takehome-evidence/${encodeURIComponent(rawName)}`,
      `https://app.cleanoxindonesia.com/api/pos-transactions/takehome-evidence/${encodeURIComponent(rawName)}`,
      `${REMOTE_PROD_URL}/api/mobile-tasks/takehome-file/${encodeURIComponent(rawName)}`,
      `${REMOTE_PROD_URL}/api/evidance/file/${encodeURIComponent(rawName)}`,
    ];

    for (const url of remoteEndpoints) {
      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${prodToken}`,
          },
        });
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // Stream directly to client in-memory (DO NOT write to local disk)
          const contentType = response.headers.get('content-type') || 'image/jpeg';
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.send(buffer);
        }
      } catch (fetchErr) {
        // try next endpoint
      }
    }

    return res.status(404).json({ message: 'File evidence tidak ditemukan' });
  } catch (err) {
    console.error('[takehome/serveTakeHomeEvidence]', err.message);
    return res.status(500).json({ message: 'Gagal memuat evidence', error: err.message });
  }
};

/* ── Update Stage & Evidence (Company ID 1 & 3 Only) ─────── */
export const updateTakeHomeStage = async (req, res) => {
  const transactionId = Number(req.params.id);
  const stage = String(req.params.stage || '').trim().toLowerCase();
  const timestampInput = req.body?.timestamp;
  const workersInput = req.body?.workers;

  if (!transactionId) {
    return res.status(400).json({ message: 'ID transaksi tidak valid' });
  }
  if (!isValidStage(stage)) {
    return res.status(400).json({ message: `Stage ${stage} tidak valid` });
  }

  // 1. If photo is uploaded, forward to cleanox-app API (no local disk write)
  if (req.file) {
    try {
      const prodSecret = process.env.CLEANOX_PROD_SECRET || 'supersecretcleanox!';
      const prodToken = jwt.sign(
        { id: req.user?.id || 1, username: req.user?.username || 'admin', role: req.user?.role || 'admin', isManagement: true, company_id: 1 },
        prodSecret,
        { expiresIn: '15m' }
      );

      const formData = new FormData();
      const fileBlob = new Blob([req.file.buffer], { type: req.file.mimetype || 'image/jpeg' });
      formData.append('photo', fileBlob, req.file.originalname || `${transactionId}_${stage}.jpg`);
      if (workersInput) {
        formData.append('workers', typeof workersInput === 'string' ? workersInput : JSON.stringify(workersInput));
      }
      if (timestampInput) {
        formData.append('timestamp', timestampInput);
      }

      const targetUrl = `${REMOTE_PROD_URL}/api/pos-transactions/${transactionId}/takehome-stages/${stage}/evidence`;
      const uploadResp = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${prodToken}`,
        },
        body: formData,
      });

      if (!uploadResp.ok) {
        const errData = await uploadResp.json().catch(() => ({}));
        return res.status(uploadResp.status).json({
          message: errData.message || `Gagal mengunggah foto ke server cleanox-app (${uploadResp.status})`,
        });
      }

      // Update status in tr_transactions & tracking log if needed
      try {
        if (stage === 'diambil') {
          await cleanoxPosPool.query(
            `UPDATE tr_transactions SET status = 'In_Progress', updated_at = NOW() WHERE id = ? AND status = 'Scheduled'`,
            [transactionId]
          );
        } else if (stage === 'pengantaran') {
          await cleanoxPosPool.query(
            `UPDATE tr_transactions SET status = 'Done', updated_at = NOW() WHERE id = ?`,
            [transactionId]
          );
        }

        await cleanoxPosPool.query(
          `INSERT INTO tr_tracking (transaction_id, status, title, description, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [
            transactionId,
            stage === 'pengantaran' ? 'Done' : 'In_Progress',
            `Take Home: ${TAKEHOME_STAGE_LABELS[stage]}`,
            `Pembaruan stage ${TAKEHOME_STAGE_LABELS[stage]} melalui Cleanox Main App`,
            req.user?.id || null,
          ]
        );
      } catch (trackErr) {
        // non-fatal
      }

      const [[updated]] = await cleanoxPosPool.query(
        `SELECT * FROM tr_takehome_progress WHERE transaction_id = ? LIMIT 1`,
        [transactionId]
      );

      return res.json({
        message: `Stage ${TAKEHOME_STAGE_LABELS[stage]} berhasil diperbarui & foto tersimpan di server cleanox-app`,
        takehome_progress: updated,
      });
    } catch (apiErr) {
      console.error('[takehome/updateTakeHomeStage/apiForward]', apiErr.message);
      return res.status(500).json({
        message: 'Gagal menghubungkan ke server cleanox-app untuk upload foto',
        error: apiErr.message,
      });
    }
  }

  // 2. If no photo uploaded (update workers/timestamp/stage only), update DB directly without touching disk
  const connection = await cleanoxPosPool.getConnection();
  try {
    await connection.beginTransaction();

    // Verify transaction exists and is take_home
    const [[tx]] = await connection.query(
      `SELECT id, transaction_no, customer_name, service_mode, status
       FROM tr_transactions
       WHERE id = ? FOR UPDATE`,
      [transactionId]
    );

    if (!tx) {
      await connection.rollback();
      return res.status(404).json({ message: 'Transaksi tidak ditemukan' });
    }
    if (String(tx.service_mode) !== 'take_home') {
      await connection.rollback();
      return res.status(400).json({ message: 'Hanya transaksi Take Home yang memiliki stage ini' });
    }

    // Ensure tr_takehome_progress row exists
    let [[progress]] = await connection.query(
      `SELECT * FROM tr_takehome_progress WHERE transaction_id = ? LIMIT 1 FOR UPDATE`,
      [transactionId]
    );
    if (!progress) {
      await connection.query(
        `INSERT INTO tr_takehome_progress (transaction_id) VALUES (?)`,
        [transactionId]
      );
      const [[created]] = await connection.query(
        `SELECT * FROM tr_takehome_progress WHERE transaction_id = ? LIMIT 1 FOR UPDATE`,
        [transactionId]
      );
      progress = created;
    }

    // Validate sequential stage progression
    const stageIdx = TAKEHOME_STAGE_ORDER.indexOf(stage);
    for (let i = 0; i < stageIdx; i += 1) {
      const prev = TAKEHOME_STAGE_ORDER[i];
      const prevCols = stageColumns(prev);
      if (!progress[prevCols.at]) {
        await connection.rollback();
        return res.status(400).json({
          message: `Lengkapi stage ${TAKEHOME_STAGE_LABELS[prev]} terlebih dahulu`,
        });
      }
    }

    const cols = stageColumns(stage);
    const savedFile = progress[cols.file] || null;
    const savedPath = progress[cols.path] || null;

    // Parse workers
    const currentWorker = {
      employee_id: req.user?.id || null,
      employee_name: req.user?.name || req.user?.username || 'Admin',
    };
    const incomingWorkers = parseWorkersBody(workersInput, null);
    const existingWorkers = parseWorkersJson(progress[cols.by]);
    const workers =
      incomingWorkers.length > 0
        ? incomingWorkers
        : existingWorkers.length > 0
          ? existingWorkers
          : [currentWorker];

    const atValue = formatMysqlDateTime(timestampInput || progress[cols.at] || new Date());

    // Update tr_takehome_progress
    await connection.query(
      `UPDATE tr_takehome_progress
       SET ${cols.file} = ?,
           ${cols.path} = ?,
           ${cols.by} = ?,
           ${cols.at} = ?,
           status = ?,
           updated_at = NOW()
       WHERE transaction_id = ?`,
      [savedFile, savedPath, JSON.stringify(workers), atValue, stage, transactionId]
    );

    // Update status in tr_transactions if needed
    if (stage === 'diambil' && tx.status === 'Scheduled') {
      await connection.query(
        `UPDATE tr_transactions SET status = 'In_Progress', updated_at = NOW() WHERE id = ?`,
        [transactionId]
      );
    } else if (stage === 'pengantaran') {
      await connection.query(
        `UPDATE tr_transactions SET status = 'Done', updated_at = NOW() WHERE id = ?`,
        [transactionId]
      );
    }

    // Create tracking log entry in tr_tracking if table exists
    try {
      await connection.query(
        `INSERT INTO tr_tracking (transaction_id, status, title, description, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [
          transactionId,
          stage === 'pengantaran' ? 'Done' : 'In_Progress',
          `Take Home: ${TAKEHOME_STAGE_LABELS[stage]}`,
          `Pembaruan stage ${TAKEHOME_STAGE_LABELS[stage]} melalui Cleanox Main App`,
          req.user?.id || null,
        ]
      );
    } catch (trackErr) {
      // non-fatal
    }

    await connection.commit();

    // Fetch updated progress
    const [[updated]] = await cleanoxPosPool.query(
      `SELECT * FROM tr_takehome_progress WHERE transaction_id = ? LIMIT 1`,
      [transactionId]
    );

    return res.json({
      message: `Stage ${TAKEHOME_STAGE_LABELS[stage]} berhasil diperbarui`,
      takehome_progress: updated,
    });
  } catch (err) {
    await connection.rollback();
    console.error('[takehome/updateTakeHomeStage]', err.message);
    return res.status(500).json({ message: 'Gagal memperbarui stage Take Home', error: err.message });
  } finally {
    connection.release();
  }
};

/* ── Clear Stage and Subsequent Stages ──────────────────── */
export const clearTakeHomeStage = async (req, res) => {
  const connection = await cleanoxPosPool.getConnection();
  try {
    const transactionId = Number(req.params.id);
    const stage = String(req.params.stage || '').trim().toLowerCase();

    if (!transactionId) {
      return res.status(400).json({ message: 'ID transaksi tidak valid' });
    }
    if (!isValidStage(stage)) {
      return res.status(400).json({ message: `Stage ${stage} tidak valid` });
    }

    await connection.beginTransaction();

    const [[progress]] = await connection.query(
      `SELECT * FROM tr_takehome_progress WHERE transaction_id = ? LIMIT 1 FOR UPDATE`,
      [transactionId]
    );
    if (!progress) {
      await connection.rollback();
      return res.status(404).json({ message: 'Progress take home belum ada' });
    }

    const startIdx = TAKEHOME_STAGE_ORDER.indexOf(stage);
    const clearStages = TAKEHOME_STAGE_ORDER.slice(startIdx);

    const setClauses = [];
    const setParams = [];

    for (const stg of clearStages) {
      const cols = stageColumns(stg);
      setClauses.push(`${cols.file} = NULL`, `${cols.path} = NULL`, `${cols.by} = NULL`, `${cols.at} = NULL`);
    }

    const prevStage = startIdx > 0 ? TAKEHOME_STAGE_ORDER[startIdx - 1] : null;
    setClauses.push('status = ?', 'updated_at = NOW()');
    setParams.push(prevStage, transactionId);

    await connection.query(
      `UPDATE tr_takehome_progress
       SET ${setClauses.join(', ')}
       WHERE transaction_id = ?`,
      setParams
    );

    await connection.commit();

    const [[updated]] = await cleanoxPosPool.query(
      `SELECT * FROM tr_takehome_progress WHERE transaction_id = ? LIMIT 1`,
      [transactionId]
    );

    return res.json({
      message: `Stage ${TAKEHOME_STAGE_LABELS[stage]} dan tahapan setelahnya telah di-reset`,
      takehome_progress: updated,
    });
  } catch (err) {
    await connection.rollback();
    console.error('[takehome/clearTakeHomeStage]', err.message);
    return res.status(500).json({ message: 'Gagal mereset stage', error: err.message });
  } finally {
    connection.release();
  }
};
