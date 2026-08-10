import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import sharp from 'sharp';
import cleanoxPool, { aloraPool } from '../db/cleanox.js';
import { buildCustomerOrderMessage } from '../utils/posCustomerOrderMessage.js';
import { buildGroupOrderMessage } from '../utils/posGroupOrderMessage.js';
import {
  isGeneralCleaningCategory,
  parseGcCrewSizeFromServiceName,
} from '../utils/posGeneralCleaningBilling.js';
import { createPosTracking } from '../utils/posTracking.js';
import {
  buildBusyReason,
  formatServiceDateKey,
  getBusyEmployeeIdsOnServiceDate,
  getBusyWorkerDetails,
  todayDateStringJakarta,
  addDaysToDateKey,
} from '../utils/posWorkerBusy.js';
import { syncTransactionStatusFromAssignments } from '../utils/posTransactionStatusSync.js';
import { resolveEffectiveBasePrice } from '../utils/posServicePrice.js';
import {
  TAKEHOME_STAGE_LABELS,
  TAKEHOME_STAGE_ORDER,
  isValidServiceMode,
  isValidTakehomeStage,
  mapTakehomeProgressDto,
  parseWorkersBody,
  parseWorkersJson,
  stageColumns,
  stagesFromIndex,
} from '../utils/posTakehomeStages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_BASE = process.env.UPLOAD_BASE_DIR
  ? path.resolve(process.env.UPLOAD_BASE_DIR)
  : path.resolve(__dirname, '../../src/assets');
const TASK_EVIDENCE_BASE = path.join(STORAGE_BASE, 'worker-task-evidence');
const CUSTOMER_PHOTO_BASE = path.join(STORAGE_BASE, 'transaction-customer-photos');
const TAKEHOME_EVIDENCE_BASE = path.join(STORAGE_BASE, 'worker-takehome-evidence');
const MAX_CUSTOMER_PHOTOS = 10;

if (!fs.existsSync(CUSTOMER_PHOTO_BASE)) fs.mkdirSync(CUSTOMER_PHOTO_BASE, { recursive: true });
if (!fs.existsSync(TAKEHOME_EVIDENCE_BASE)) fs.mkdirSync(TAKEHOME_EVIDENCE_BASE, { recursive: true });

const customerPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('File referensi customer harus berupa gambar'));
  },
});

const takehomeEvidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('File evidence take-home harus berupa gambar'));
  },
});

export const customerPhotoUploadMiddleware = customerPhotoUpload.single('photo');
export const takehomeEvidenceUploadMiddleware = takehomeEvidenceUpload.single('photo');

const WA_URL = (process.env.ALORA_WA_URL || 'http://43.129.37.205:3000').replace(/\/$/, '');
const WA_SESSION = process.env.ALORA_WA_CLEANOX_SESSION || 'cleanox';

function toAdminEvidencePath(photoFile) {
  if (!photoFile) return null;
  return `/pos-transactions/task-evidence/${path.basename(String(photoFile))}`;
}

function toAdminCustomerPhotoPath(photoFile) {
  if (!photoFile) return null;
  return `/pos-transactions/customer-photo/${path.basename(String(photoFile))}`;
}

function toAdminTakehomePhotoPath(photoFile) {
  if (!photoFile) return null;
  return `/pos-transactions/takehome-evidence/${path.basename(String(photoFile))}`;
}

async function compressTakehomePhoto(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

async function saveTakehomePhotoFile(transactionId, stage, file) {
  const fileName = `${transactionId}_${stage}_${Date.now()}.jpg`;
  const filePath = path.join(TAKEHOME_EVIDENCE_BASE, fileName);
  const buffer = await compressTakehomePhoto(file.buffer);
  fs.writeFileSync(filePath, buffer);
  return {
    file: fileName,
    path: toAdminTakehomePhotoPath(fileName),
  };
}

function unlinkTakehomePhotoIfExists(photoFile) {
  if (!photoFile) return;
  const fullPath = path.join(TAKEHOME_EVIDENCE_BASE, path.basename(String(photoFile)));
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch {
      /* ignore */
    }
  }
}

async function ensureTakehomeProgressRow(connection, transactionId) {
  const [[existing]] = await connection.query(
    `SELECT * FROM tr_takehome_progress WHERE transaction_id = ? LIMIT 1`,
    [transactionId]
  );
  if (existing) return existing;

  await connection.query(
    `INSERT INTO tr_takehome_progress (transaction_id) VALUES (?)`,
    [transactionId]
  );
  const [[created]] = await connection.query(
    `SELECT * FROM tr_takehome_progress WHERE transaction_id = ? LIMIT 1`,
    [transactionId]
  );
  return created;
}

function formatMysqlDateTime(value) {
  if (!value) {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const jakarta = new Date(utc + 7 * 60 * 60000);
    return jakarta.toISOString().slice(0, 19).replace('T', ' ');
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw)) {
    return raw.replace('T', ' ').slice(0, 19);
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function compressCustomerPhoto(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

async function saveCustomerPhotoFile(transactionId, file) {
  const fileName = `${transactionId}_${Date.now()}.jpg`;
  const filePath = path.join(CUSTOMER_PHOTO_BASE, fileName);
  const buffer = await compressCustomerPhoto(file.buffer);
  fs.writeFileSync(filePath, buffer);
  return {
    file: fileName,
    path: `/pos-transactions/customer-photo/${fileName}`,
  };
}

function mapAssignmentEvidencePhotos(assignment, photos = []) {
  const before = [];
  const after = [];

  for (const photo of photos) {
    const item = {
      id: photo.id,
      photo_file: photo.photo_file,
      photo_path: toAdminEvidencePath(photo.photo_file) || photo.photo_path,
      created_at: photo.created_at,
    };
    if (photo.kind === 'before') before.push(item);
    if (photo.kind === 'after') after.push(item);
  }

  if (before.length === 0 && assignment.before_photo_file) {
    before.push({
      id: null,
      photo_file: assignment.before_photo_file,
      photo_path: toAdminEvidencePath(assignment.before_photo_file) || assignment.before_photo_path,
      created_at: assignment.before_photo_at || null,
    });
  }

  if (after.length === 0 && assignment.after_photo_file) {
    after.push({
      id: null,
      photo_file: assignment.after_photo_file,
      photo_path: toAdminEvidencePath(assignment.after_photo_file) || assignment.after_photo_path,
      created_at: assignment.after_photo_at || null,
    });
  }

  return {
    before_photos: before,
    after_photos: after,
    before_count: before.length,
    after_count: after.length,
  };
}

export const servePosTaskEvidenceFile = (req, res) => {
  const safeFileName = path.basename(req.params.filename || '');
  const fullPath = path.join(TASK_EVIDENCE_BASE, safeFileName);

  if (!safeFileName || !fs.existsSync(fullPath)) {
    return res.status(404).json({ message: 'File bukti pengerjaan tidak ditemukan' });
  }

  return res.sendFile(fullPath);
};

export const servePosCustomerPhoto = (req, res) => {
  const safeFileName = path.basename(req.params.filename || '');
  const fullPath = path.join(CUSTOMER_PHOTO_BASE, safeFileName);

  if (!safeFileName || !fs.existsSync(fullPath)) {
    return res.status(404).json({ message: 'File referensi customer tidak ditemukan' });
  }

  return res.sendFile(fullPath);
};

function formatWaRecipient(to) {
  if (!to) return null;
  const text = String(to).trim();
  if (text.endsWith('@g.us')) return text;

  let digits = text.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  if (!digits.startsWith('62')) digits = `62${digits}`;
  return digits || null;
}

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function buildTransactionNo() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  return `CLX${stamp}${Math.floor(Math.random() * 90 + 10)}`;
}

async function sendWaMessage(recipient, message) {
  if (!recipient || !message) {
    return { success: false, error: 'Recipient atau message kosong' };
  }

  const payload = {
    session: WA_SESSION,
    to: formatWaRecipient(recipient),
    message,
  };

  const response = await fetch(`${WA_URL}/api/send-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'WA gateway error');
    throw new Error(errorText || `WA gateway ${response.status}`);
  }

  return { success: true };
}

export const getPosServices = async (_req, res) => {
  try {
    const [rows] = await cleanoxPool.query(
      `SELECT
        s.id,
        s.name,
        s.satuan_name,
        s.duration_value,
        s.duration_unit,
        s.status,
        s.category_id,
        c.name AS category_name,
        sp.price,
        sp.coret_price,
        GROUP_CONCAT(
          DISTINCT CASE
            WHEN p.id IS NOT NULL THEN CONCAT(p.id, '::', p.name, '::', p.promo_type, '::', p.promo_value)
            ELSE NULL
          END
          SEPARATOR '||'
        ) AS promos
      FROM mst_services s
      INNER JOIN mst_service_prices sp ON sp.service_id = s.id
      LEFT JOIN mst_category c ON c.id = s.category_id
      LEFT JOIN mst_service_promos sps ON sps.service_id = s.id
      LEFT JOIN mst_promos p ON p.id = sps.promo_id AND COALESCE(p.status, 'Aktif') = 'Aktif'
      WHERE COALESCE(s.status, 'Aktif') = 'Aktif'
      GROUP BY
        s.id,
        s.name,
        s.satuan_name,
        s.duration_value,
        s.duration_unit,
        s.status,
        s.category_id,
        c.name,
        sp.price,
        sp.coret_price
      ORDER BY s.name`
    );

    const services = rows.map((row) => {
      const price = Number(row.price || 0);
      const coret_price = row.coret_price == null ? null : Number(row.coret_price);
      return {
        id: row.id,
        name: row.name,
        satuan_name: row.satuan_name,
        duration_value: row.duration_value,
        duration_unit: row.duration_unit,
        status: row.status,
        category_id: row.category_id == null ? null : Number(row.category_id),
        category_name: row.category_name || null,
        price,
        coret_price,
        effective_price: resolveEffectiveBasePrice({ price, coret_price }),
        promos: String(row.promos || '')
          .split('||')
          .filter(Boolean)
          .map((promoText) => {
            const [id, name, promo_type, promo_value] = promoText.split('::');
            return {
              id: Number(id),
              name,
              promo_type,
              promo_value: Number(promo_value || 0),
            };
          }),
      };
    });

    const [categoryRows] = await cleanoxPool.query(
      `SELECT id, name FROM mst_category ORDER BY name`
    );
    const categories = categoryRows.map((row) => ({
      id: Number(row.id),
      name: row.name,
    }));

    return res.json({ services, categories });
  } catch (error) {
    console.error('[pos/getPosServices]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil master service POS' });
  }
};

export const getPosWorkers = async (req, res) => {
  try {
    const serviceDateTime = req.query.service_date || null;
    const excludeTransactionId = Number(req.query.exclude_transaction_id) || null;

    const [rows] = await aloraPool.query(
      `SELECT employee_id, full_name, phone_number
       FROM mst_employee
       WHERE company_id = 3
         AND exit_date IS NULL
       ORDER BY full_name`
    );

    let busyMap = new Map();
    if (serviceDateTime) {
      busyMap = await getBusyWorkerDetails(cleanoxPool, serviceDateTime, {
        excludeTransactionId: excludeTransactionId || null,
      });
    }

    const workers = rows.map((row) => {
      const id = Number(row.employee_id);
      const busy = busyMap.get(id) || null;
      return {
        employee_id: id,
        full_name: row.full_name,
        phone_number: row.phone_number,
        is_busy: Boolean(busy),
        busy_reason: buildBusyReason(busy),
      };
    });

    return res.json({ workers, service_date: serviceDateTime });
  } catch (error) {
    console.error('[pos/getPosWorkers]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil data worker' });
  }
};

export const getPosSummary = async (_req, res) => {
  try {
    const [summaryRows] = await cleanoxPool.query(
      `SELECT
        COUNT(*) AS total_transactions,
        SUM(CASE WHEN status IN ('Draft', 'Waiting_Confirmation') THEN 1 ELSE 0 END) AS incoming_transactions,
        SUM(CASE WHEN status IN ('Assigned', 'Scheduled', 'In_Progress') THEN 1 ELSE 0 END) AS active_transactions,
        SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed_transactions,
        COALESCE(SUM(final_amount), 0) AS total_revenue
      FROM tr_transactions`
    );

    const [trackingRows] = await cleanoxPool.query(
      `SELECT status, COUNT(*) AS total
       FROM tr_tracking
       GROUP BY status
       ORDER BY status`
    );

    return res.json({
      summary: {
        ...(summaryRows[0] || {}),
        total_revenue: Number(summaryRows[0]?.total_revenue || 0),
      },
      tracking: trackingRows,
    });
  } catch (error) {
    console.error('[pos/getPosSummary]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil ringkasan POS' });
  }
};

export const getPosTransactions = async (req, res) => {
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();

  try {
    let sql = `
      SELECT
        t.id,
        t.transaction_no,
        t.customer_name,
        t.customer_phone,
        t.service_date,
        t.total_people,
        t.final_amount,
        t.pricing_finalized_at,
        t.service_mode,
        t.status,
        t.created_at,
        COUNT(DISTINCT i.id) AS total_items,
        COUNT(DISTINCT a.id) AS total_workers,
        SUM(CASE WHEN c.name = 'General Cleaning' THEN 1 ELSE 0 END) AS gc_item_count
      FROM tr_transactions t
      LEFT JOIN tr_transaction_items i ON i.transaction_id = t.id
      LEFT JOIN mst_services s ON s.id = i.service_id
      LEFT JOIN mst_category c ON c.id = s.category_id
      LEFT JOIN tr_worker_assignments a ON a.transaction_id = t.id
      WHERE 1 = 1`;
    const params = [];

    if (search) {
      sql += ` AND (
        t.transaction_no LIKE ?
        OR t.customer_name LIKE ?
        OR COALESCE(t.customer_phone, '') LIKE ?
      )`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status) {
      sql += ` AND t.status = ?`;
      params.push(status);
    }

    sql += `
      GROUP BY
        t.id, t.transaction_no, t.customer_name, t.customer_phone,
        t.service_date, t.total_people, t.final_amount, t.pricing_finalized_at,
        t.service_mode, t.status, t.created_at
      ORDER BY t.created_at DESC`;

    const [rows] = await cleanoxPool.query(sql, params);
    return res.json({
      transactions: rows.map((row) => ({
        ...row,
        final_amount: Number(row.final_amount || 0),
        has_gc: Number(row.gc_item_count || 0) > 0,
        pricing_pending:
          Number(row.gc_item_count || 0) > 0 && !row.pricing_finalized_at,
      })),
    });
  } catch (error) {
    console.error('[pos/getPosTransactions]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil daftar transaksi POS' });
  }
};

export const getPosTransactionDetail = async (req, res) => {
  const transactionId = Number(req.params.id);
  if (!transactionId) {
    return res.status(400).json({ message: 'ID transaksi tidak valid' });
  }

  try {
    const [[transaction]] = await cleanoxPool.query(
      `SELECT *
       FROM tr_transactions
       WHERE id = ?`,
      [transactionId]
    );

    if (!transaction) {
      return res.status(404).json({ message: 'Transaksi POS tidak ditemukan' });
    }

    const [items] = await cleanoxPool.query(
      `SELECT
        i.*,
        s.name AS service_name,
        c.name AS category_name
       FROM tr_transaction_items i
       INNER JOIN mst_services s ON s.id = i.service_id
       LEFT JOIN mst_category c ON c.id = s.category_id
       WHERE i.transaction_id = ?
       ORDER BY i.id`,
      [transactionId]
    );

    const [assignments] = await cleanoxPool.query(
      `SELECT *
       FROM tr_worker_assignments
       WHERE transaction_id = ?
       ORDER BY assigned_at DESC, id DESC`,
      [transactionId]
    );

    let enrichedAssignments = assignments;
    if (assignments.length > 0) {
      const employeeIds = [...new Set(assignments.map((row) => row.employee_id).filter(Boolean))];
      const assignmentIds = assignments.map((row) => row.id).filter(Boolean);
      const [employeeRows] = await aloraPool.query(
        `SELECT employee_id, phone_number
         FROM mst_employee
         WHERE employee_id IN (${employeeIds.map(() => '?').join(',')})`,
        employeeIds
      );
      const phoneMap = new Map(
        employeeRows.map((row) => [row.employee_id, row.phone_number || null])
      );

      const photosByAssignment = new Map();
      if (assignmentIds.length > 0) {
        const [photoRows] = await cleanoxPool.query(
          `SELECT id, assignment_id, kind, photo_file, photo_path, sort_order, created_at
           FROM tr_worker_assignment_photos
           WHERE assignment_id IN (?)
           ORDER BY sort_order ASC, id ASC`,
          [assignmentIds]
        );
        for (const photo of photoRows) {
          const key = Number(photo.assignment_id);
          if (!photosByAssignment.has(key)) photosByAssignment.set(key, []);
          photosByAssignment.get(key).push(photo);
        }
      }

      enrichedAssignments = assignments.map((row) => ({
        ...row,
        employee_phone: phoneMap.get(row.employee_id) || null,
        ...mapAssignmentEvidencePhotos(row, photosByAssignment.get(Number(row.id)) || []),
      }));
    }

    const [tracking] = await cleanoxPool.query(
      `SELECT *
       FROM tr_tracking
       WHERE transaction_id = ?
       ORDER BY created_at DESC, id DESC`,
      [transactionId]
    );

    const [notifications] = await cleanoxPool.query(
      `SELECT *
       FROM tr_notifications
       WHERE transaction_id = ?
       ORDER BY created_at DESC, id DESC`,
      [transactionId]
    );

    const [customerPhotoRows] = await cleanoxPool.query(
      `SELECT id, photo_file, photo_path, sort_order, created_at
       FROM tr_transaction_customer_photos
       WHERE transaction_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [transactionId]
    );

    const customer_photos = customerPhotoRows.map((row) => ({
      id: row.id,
      photo_file: row.photo_file,
      photo_path: toAdminCustomerPhotoPath(row.photo_file) || row.photo_path,
      created_at: row.created_at,
    }));

    let takehome_progress = null;
    if (String(transaction.service_mode || 'home_service') === 'take_home') {
      const [[progressRow]] = await cleanoxPool.query(
        `SELECT * FROM tr_takehome_progress WHERE transaction_id = ? LIMIT 1`,
        [transactionId]
      );
      takehome_progress = mapTakehomeProgressDto(progressRow || null, {
        photoPathBuilder: toAdminTakehomePhotoPath,
      });
    }

    return res.json({
      transaction: {
        ...transaction,
        service_mode: transaction.service_mode || 'home_service',
        subtotal_amount: Number(transaction.subtotal_amount || 0),
        discount_amount: Number(transaction.discount_amount || 0),
        final_amount: Number(transaction.final_amount || 0),
      },
      items: items.map((item) => ({
        ...item,
        base_price_snapshot: Number(item.base_price_snapshot || 0),
        original_price_snapshot:
          item.original_price_snapshot == null ? null : Number(item.original_price_snapshot),
        promo_value_snapshot: item.promo_value_snapshot == null ? null : Number(item.promo_value_snapshot),
        promo_discount_amount: Number(item.promo_discount_amount || 0),
        final_price_snapshot: Number(item.final_price_snapshot || 0),
        line_total: Number(item.line_total || 0),
      })),
      assignments: enrichedAssignments,
      customer_photos,
      takehome_progress,
      tracking,
      notifications,
    });
  } catch (error) {
    console.error('[pos/getPosTransactionDetail]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil detail transaksi POS' });
  }
};

export const uploadPosCustomerPhoto = async (req, res) => {
  const transactionId = Number(req.params.id);
  if (!transactionId) {
    return res.status(400).json({ message: 'ID transaksi tidak valid' });
  }
  if (!req.file) {
    return res.status(400).json({ message: 'Foto referensi customer wajib diunggah' });
  }

  try {
    const [[transaction]] = await cleanoxPool.query(
      `SELECT id, status FROM tr_transactions WHERE id = ?`,
      [transactionId]
    );
    if (!transaction) {
      return res.status(404).json({ message: 'Transaksi POS tidak ditemukan' });
    }
    if (transaction.status === 'Cancelled') {
      return res.status(409).json({ message: 'Cancelled transactions cannot receive customer reference photos' });
    }

    const [[countRow]] = await cleanoxPool.query(
      `SELECT COUNT(*) AS total FROM tr_transaction_customer_photos WHERE transaction_id = ?`,
      [transactionId]
    );
    if (Number(countRow?.total || 0) >= MAX_CUSTOMER_PHOTOS) {
      return res.status(400).json({ message: `Maksimal ${MAX_CUSTOMER_PHOTOS} foto referensi customer` });
    }

    const saved = await saveCustomerPhotoFile(transactionId, req.file);
    const sortOrder = Number(countRow?.total || 0);
    const [insertResult] = await cleanoxPool.query(
      `INSERT INTO tr_transaction_customer_photos
        (transaction_id, photo_file, photo_path, sort_order, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [transactionId, saved.file, saved.path, sortOrder, req.user?.id || null]
    );

    return res.status(201).json({
      message: 'Foto referensi customer tersimpan',
      photo: {
        id: insertResult.insertId,
        photo_file: saved.file,
        photo_path: saved.path,
      },
    });
  } catch (error) {
    console.error('[pos/uploadPosCustomerPhoto]', error.message);
    return res.status(500).json({ message: 'Gagal menyimpan foto referensi customer' });
  }
};

export const deletePosCustomerPhoto = async (req, res) => {
  const transactionId = Number(req.params.id);
  const photoId = Number(req.params.photoId);
  if (!transactionId || !photoId) {
    return res.status(400).json({ message: 'ID transaksi/foto tidak valid' });
  }

  try {
    const [[photo]] = await cleanoxPool.query(
      `SELECT id, photo_file
       FROM tr_transaction_customer_photos
       WHERE id = ? AND transaction_id = ?`,
      [photoId, transactionId]
    );
    if (!photo) {
      return res.status(404).json({ message: 'Foto referensi tidak ditemukan' });
    }

    await cleanoxPool.query(
      `DELETE FROM tr_transaction_customer_photos WHERE id = ? AND transaction_id = ?`,
      [photoId, transactionId]
    );

    if (photo.photo_file) {
      const fullPath = path.join(CUSTOMER_PHOTO_BASE, path.basename(photo.photo_file));
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch {
          // ignore unlink errors
        }
      }
    }

    return res.json({ message: 'Foto referensi customer dihapus' });
  } catch (error) {
    console.error('[pos/deletePosCustomerPhoto]', error.message);
    return res.status(500).json({ message: 'Gagal menghapus foto referensi customer' });
  }
};

export const createPosTransaction = async (req, res) => {
  const {
    customer_id,
    customer_name,
    customer_phone,
    customer_address,
    service_date,
    total_people,
    notes,
    items,
    worker_ids,
    service_mode: serviceModeRaw,
  } = req.body;

  const service_mode = String(serviceModeRaw || 'home_service').trim();

  if (!customer_id || !service_date || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Customer, tanggal layanan, dan item wajib diisi' });
  }
  if (!isValidServiceMode(service_mode)) {
    return res.status(400).json({ message: 'service_mode wajib home_service atau take_home' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [customerRows] = await connection.query(
      `SELECT id, name, phone, address
       FROM mst_customers
       WHERE id = ? AND COALESCE(status, 'Aktif') = 'Aktif'
       LIMIT 1`,
      [Number(customer_id)]
    );

    if (!customerRows.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Customer tidak ditemukan atau tidak aktif' });
    }

    const customer = customerRows[0];
    const snapshotName = customer.name || customer_name;
    const snapshotPhone = customer.phone || customer_phone || null;
    const snapshotAddress = customer.address || customer_address || null;

    if (!snapshotName) {
      await connection.rollback();
      return res.status(400).json({ message: 'Nama customer wajib tersedia' });
    }

    const serviceIds = [...new Set(items.map((item) => Number(item.service_id)).filter(Boolean))];
    const promoIds = [...new Set(items.map((item) => Number(item.promo_id)).filter(Boolean))];

    const [serviceRows] = await connection.query(
      `SELECT s.id, s.name, s.satuan_name, sp.price, sp.coret_price, c.name AS category_name
       FROM mst_services s
       INNER JOIN mst_service_prices sp ON sp.service_id = s.id
       LEFT JOIN mst_category c ON c.id = s.category_id
       WHERE s.id IN (${serviceIds.map(() => '?').join(',')})`,
      serviceIds
    );

    const servicesMap = new Map(serviceRows.map((row) => [row.id, row]));
    let promosMap = new Map();

    if (promoIds.length > 0) {
      const [promoRows] = await connection.query(
        `SELECT p.id, p.name, p.promo_type, p.promo_value, sp.service_id
         FROM mst_promos p
         INNER JOIN mst_service_promos sp ON sp.promo_id = p.id
         WHERE p.id IN (${promoIds.map(() => '?').join(',')})`,
        promoIds
      );
      promosMap = new Map(promoRows.map((row) => [`${row.service_id}:${row.id}`, row]));
    }

    const gcCrewSizes = [];
    for (const rawItem of items) {
      const service = servicesMap.get(Number(rawItem.service_id));
      if (!service) continue;
      if (!isGeneralCleaningCategory(service.category_name)) continue;
      const crew = parseGcCrewSizeFromServiceName(service.name);
      if (crew == null) {
        await connection.rollback();
        return res.status(400).json({
          message: `Nama service General Cleaning tidak valid: ${service.name}`,
        });
      }
      gcCrewSizes.push(crew);
    }

    const hasGc = gcCrewSizes.length > 0;
    let gcCrewSize = null;
    if (hasGc) {
      const uniqueCrew = [...new Set(gcCrewSizes)];
      if (uniqueCrew.length > 1) {
        await connection.rollback();
        return res.status(400).json({
          message: 'Paket General Cleaning harus ukuran teknisi yang sama',
        });
      }
      gcCrewSize = uniqueCrew[0];
    }

    const totalPeopleCount = Math.max(1, Number(total_people || 1));
    if (hasGc && totalPeopleCount !== gcCrewSize) {
      await connection.rollback();
      return res.status(400).json({
        message: `Jumlah orang harus ${gcCrewSize} sesuai paket General Cleaning`,
      });
    }

    const uniqueWorkerIds = Array.isArray(worker_ids)
      ? [...new Set(worker_ids.map((id) => Number(id)).filter(Boolean))]
      : [];
    if (hasGc && uniqueWorkerIds.length !== totalPeopleCount) {
      await connection.rollback();
      return res.status(400).json({
        message: `Pilih tepat ${totalPeopleCount} pekerja sesuai paket General Cleaning`,
      });
    }

    let subtotal = 0;
    let discount = 0;
    const normalizedItems = items.map((item) => {
      const service = servicesMap.get(Number(item.service_id));
      if (!service) {
        throw new Error(`Service ${item.service_id} tidak ditemukan`);
      }

      const isGc = isGeneralCleaningCategory(service.category_name);
      const qty = isGc ? 1 : Math.max(1, Number(item.qty || 1));
      const listPrice = Number(service.price || 0);
      const coretPrice = service.coret_price == null ? null : Number(service.coret_price);
      const basePrice = resolveEffectiveBasePrice({
        price: listPrice,
        coret_price: coretPrice,
      });
      const originalPriceSnapshot =
        coretPrice != null && Number.isFinite(coretPrice) ? toMoney(listPrice) : null;
      const promo = item.promo_id ? promosMap.get(`${service.id}:${Number(item.promo_id)}`) : null;
      const rawPromoValue = Number(promo?.promo_value || 0);
      const discountPerUnit = promo
        ? promo.promo_type === 'persen'
          ? (basePrice * rawPromoValue) / 100
          : rawPromoValue
        : 0;
      const safeDiscountPerUnit = Math.min(basePrice, discountPerUnit);
      const finalPrice = Math.max(0, basePrice - safeDiscountPerUnit);

      if (isGc) {
        return {
          service_id: service.id,
          qty,
          unit_label: item.unit_label || service.satuan_name || 'jam',
          base_price_snapshot: toMoney(basePrice),
          original_price_snapshot: originalPriceSnapshot,
          promo_name_snapshot: promo?.name || null,
          promo_type_snapshot: promo?.promo_type || null,
          promo_value_snapshot: promo ? toMoney(rawPromoValue) : null,
          promo_discount_amount: toMoney(0),
          final_price_snapshot: toMoney(finalPrice),
          line_total: toMoney(0),
          category_name: service.category_name || null,
        };
      }

      const lineTotal = finalPrice * qty;
      subtotal += basePrice * qty;
      discount += safeDiscountPerUnit * qty;

      return {
        service_id: service.id,
        qty,
        unit_label: item.unit_label || service.satuan_name || null,
        base_price_snapshot: toMoney(basePrice),
        original_price_snapshot: originalPriceSnapshot,
        promo_name_snapshot: promo?.name || null,
        promo_type_snapshot: promo?.promo_type || null,
        promo_value_snapshot: promo ? toMoney(rawPromoValue) : null,
        promo_discount_amount: toMoney(safeDiscountPerUnit * qty),
        final_price_snapshot: toMoney(finalPrice),
        line_total: toMoney(lineTotal),
        category_name: service.category_name || null,
      };
    });

    const finalAmount = subtotal - discount;
    const transactionNo = buildTransactionNo();

    let assignedWorkers = [];
    if (uniqueWorkerIds.length > 0) {
      const [workerRows] = await aloraPool.query(
        `SELECT employee_id, full_name, phone_number
         FROM mst_employee
         WHERE company_id = 3
           AND exit_date IS NULL
           AND employee_id IN (${uniqueWorkerIds.map(() => '?').join(',')})`,
        uniqueWorkerIds
      );
      assignedWorkers = workerRows;

      const busyIds = await getBusyEmployeeIdsOnServiceDate(connection, service_date);
      const busyWorkers = assignedWorkers.filter((w) => busyIds.has(Number(w.employee_id)));
      if (busyWorkers.length > 0) {
        await connection.rollback();
        const names = busyWorkers.map((w) => w.full_name).join(', ');
        return res.status(400).json({
          message: `Worker already has an active task at the same service date and time: ${names}`,
        });
      }
    }

    const messageItems = normalizedItems.map((item) => {
      const service = servicesMap.get(item.service_id);
      return {
        service_name: service?.name || `Service #${item.service_id}`,
        qty: item.qty,
        base_price: item.base_price_snapshot,
        original_price: item.original_price_snapshot,
        final_price_per_unit: item.final_price_snapshot,
        line_total: item.line_total,
        promo_type: item.promo_type_snapshot,
        promo_value: item.promo_value_snapshot,
        category_name: item.category_name || service?.category_name || null,
      };
    });

    const groupMessageTemplate = buildGroupOrderMessage({
      customerName: snapshotName,
      customerPhone: snapshotPhone,
      customerAddress: snapshotAddress,
      serviceDate: service_date,
      items: messageItems,
      totalPeople: totalPeopleCount,
      notes: notes || null,
      finalAmount,
      pricingFinalized: false,
      workers: assignedWorkers.map((worker) => ({
        full_name: worker.full_name,
        phone_number: worker.phone_number,
      })),
    });

    const customerMessageTemplate = buildCustomerOrderMessage({
      customerName: snapshotName,
      customerPhone: snapshotPhone,
      customerAddress: snapshotAddress,
      serviceDate: service_date,
      items: messageItems,
      totalPeople: totalPeopleCount,
      finalAmount,
      pricingFinalized: false,
    });

    const [result] = await connection.query(
      `INSERT INTO tr_transactions
        (transaction_no, customer_id, customer_name, customer_phone, customer_address, service_date, total_people,
         subtotal_amount, discount_amount, final_amount, billing_hours, pricing_finalized_at, notes,
         group_message_template, customer_message_template, service_mode, status, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionNo,
        customer.id,
        snapshotName,
        snapshotPhone,
        snapshotAddress,
        service_date,
        totalPeopleCount,
        toMoney(subtotal),
        toMoney(discount),
        toMoney(finalAmount),
        notes || null,
        groupMessageTemplate,
        customerMessageTemplate,
        service_mode,
        'Draft',
        req.user?.id || null,
        req.user?.id || null,
      ]
    );

    const transactionId = result.insertId;

    if (service_mode === 'take_home') {
      await connection.query(
        `INSERT INTO tr_takehome_progress (transaction_id) VALUES (?)`,
        [transactionId]
      );
    }

    for (const item of normalizedItems) {
      await connection.query(
        `INSERT INTO tr_transaction_items
          (transaction_id, service_id, qty, unit_label, base_price_snapshot, original_price_snapshot,
           promo_name_snapshot, promo_type_snapshot, promo_value_snapshot, promo_discount_amount,
           final_price_snapshot, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transactionId,
          item.service_id,
          item.qty,
          item.unit_label,
          item.base_price_snapshot,
          item.original_price_snapshot,
          item.promo_name_snapshot,
          item.promo_type_snapshot,
          item.promo_value_snapshot,
          item.promo_discount_amount,
          item.final_price_snapshot,
          item.line_total,
        ]
      );
    }

    for (const worker of assignedWorkers) {
      await connection.query(
        `INSERT INTO tr_worker_assignments
          (transaction_id, employee_id, employee_name, assignment_status)
         VALUES (?, ?, ?, ?)`,
        [transactionId, worker.employee_id, worker.full_name, 'Assigned']
      );
    }

    await createPosTracking(
      connection,
      transactionId,
      'Created',
      'Transaksi POS dibuat',
      `Transaksi ${transactionNo} dibuat untuk ${snapshotName} (${service_mode === 'take_home' ? 'Take Home' : 'Home Service'})`,
      req.user?.id
    );

    if (Array.isArray(worker_ids) && worker_ids.length > 0) {
      await createPosTracking(
        connection,
        transactionId,
        'Assigned',
        'Worker ditugaskan',
        `${worker_ids.length} worker ditambahkan ke transaksi POS`,
        req.user?.id
      );
    }

    await syncTransactionStatusFromAssignments(connection, transactionId);

    await connection.commit();
    return res.status(201).json({
      message: 'Transaksi POS berhasil dibuat',
      transaction_id: transactionId,
      transaction_no: transactionNo,
    });
  } catch (error) {
    await connection.rollback();
    console.error('[pos/createPosTransaction]', error.message);
    return res.status(500).json({ message: error.message || 'Gagal membuat transaksi POS' });
  } finally {
    connection.release();
  }
};

export const updatePosTransactionStatus = async (req, res) => {
  const transactionId = Number(req.params.id);
  const { status, title, description } = req.body;

  if (!transactionId || !status) {
    return res.status(400).json({ message: 'ID transaksi dan status wajib diisi' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `UPDATE tr_transactions
       SET status = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP(0)
       WHERE id = ?`,
      [status, req.user?.id || null, transactionId]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Transaksi POS tidak ditemukan' });
    }

    await createPosTracking(
      connection,
      transactionId,
      status === 'In_Progress' ? 'In_Progress' : status === 'Completed' ? 'Completed' : status === 'Cancelled' ? 'Cancelled' : status === 'Assigned' ? 'Assigned' : 'Scheduled',
      title || `Status diubah ke ${status}`,
      description || null,
      req.user?.id
    );

    await connection.commit();
    return res.json({ message: 'Status transaksi POS berhasil diperbarui' });
  } catch (error) {
    await connection.rollback();
    console.error('[pos/updatePosTransactionStatus]', error.message);
    return res.status(500).json({ message: 'Gagal memperbarui status transaksi POS' });
  } finally {
    connection.release();
  }
};

function formatDateLabelId(dateKey) {
  if (!dateKey) return '-';
  const [y, m, d] = dateKey.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

export const reschedulePosTransaction = async (req, res) => {
  const transactionId = Number(req.params.id);
  const newServiceDateRaw = req.body?.service_date;

  if (!transactionId || !newServiceDateRaw) {
    return res.status(400).json({ message: 'ID transaksi dan tanggal layanan baru wajib diisi' });
  }

  const newDateKey = formatServiceDateKey(newServiceDateRaw);
  if (!newDateKey) {
    return res.status(400).json({ message: 'Format tanggal layanan baru tidak valid' });
  }

  const todayKey = todayDateStringJakarta();
  const minOldServiceKey = addDaysToDateKey(todayKey, 1);
  const connection = await cleanoxPool.getConnection();

  try {
    await connection.beginTransaction();

    const [[transaction]] = await connection.query(
      `SELECT id, service_date, status, customer_name, transaction_no
       FROM tr_transactions
       WHERE id = ?
       FOR UPDATE`,
      [transactionId]
    );

    if (!transaction) {
      await connection.rollback();
      return res.status(404).json({ message: 'Transaksi POS tidak ditemukan' });
    }

    if (['Completed', 'Cancelled'].includes(transaction.status)) {
      await connection.rollback();
      return res.status(409).json({ message: 'Completed/cancelled transactions cannot be rescheduled' });
    }

    const oldDateKey = formatServiceDateKey(transaction.service_date);
    if (!oldDateKey) {
      await connection.rollback();
      return res.status(400).json({ message: 'Tanggal layanan lama tidak valid' });
    }

    if (oldDateKey < minOldServiceKey) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Reschedule hanya boleh minimal 1 hari sebelum tanggal layanan (tidak boleh di hari-H)',
      });
    }

    if (newDateKey === oldDateKey) {
      await connection.rollback();
      return res.status(400).json({ message: 'Tanggal layanan baru harus berbeda dari tanggal lama' });
    }

    if (newDateKey < minOldServiceKey) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Tanggal layanan baru minimal besok (H−1 dari hari ini)',
      });
    }

    const [assignments] = await connection.query(
      `SELECT id, employee_id, employee_name, assignment_status
       FROM tr_worker_assignments
       WHERE transaction_id = ?`,
      [transactionId]
    );

    const blocked = assignments.filter((row) =>
      ['On_Progress', 'Done'].includes(row.assignment_status)
    );
    if (blocked.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        message: 'Tidak bisa reschedule: ada pekerja On Progress atau Done',
      });
    }

    // Keep time-of-day from new input if present; else keep old time; else noon.
    let newServiceDateValue = String(newServiceDateRaw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(newServiceDateValue)) {
      const oldRaw = transaction.service_date instanceof Date
        ? transaction.service_date.toISOString()
        : String(transaction.service_date || '');
      const timeMatch = oldRaw.match(/T?(\d{2}:\d{2}:\d{2})/);
      newServiceDateValue = `${newDateKey} ${timeMatch ? timeMatch[1] : '08:00:00'}`;
    } else if (newServiceDateValue.includes('T')) {
      newServiceDateValue = newServiceDateValue.replace('T', ' ').slice(0, 19);
    }

    await connection.query(
      `UPDATE tr_transactions
       SET service_date = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP(0)
       WHERE id = ?`,
      [newServiceDateValue, req.user?.id || null, transactionId]
    );

    const oldLabel = formatDateLabelId(oldDateKey);
    const newLabel = formatDateLabelId(newDateKey);
    const description = `Dari ${oldLabel} ke ${newLabel}`;

    await createPosTracking(
      connection,
      transactionId,
      'Scheduled',
      'Jadwal dipindah',
      description,
      req.user?.id
    );

    const activeAssignments = assignments.filter((row) =>
      ['Assigned', 'In_Schedule', 'On_Progress'].includes(row.assignment_status)
    );

    for (const row of activeAssignments) {
      await connection.query(
        `INSERT INTO tr_worker_task_events
          (transaction_id, assignment_id, employee_id, event_type, old_service_date, new_service_date, message, created_by)
         VALUES (?, ?, ?, 'reschedule', ?, ?, ?, ?)`,
        [
          transactionId,
          row.id,
          row.employee_id,
          transaction.service_date,
          newServiceDateValue,
          `${transaction.transaction_no || ''} • ${transaction.customer_name || ''} — ${description}`.trim(),
          req.user?.id || null,
        ]
      );
    }

    await connection.commit();
    return res.json({
      message: 'Jadwal layanan berhasil dipindah',
      service_date: newServiceDateValue,
      old_service_date: oldDateKey,
      new_service_date: newDateKey,
    });
  } catch (error) {
    await connection.rollback();
    console.error('[pos/reschedulePosTransaction]', error.message);
    return res.status(500).json({ message: 'Gagal memindah jadwal layanan' });
  } finally {
    connection.release();
  }
};

export const cancelPosTransaction = async (req, res) => {
  const transactionId = Number(req.params.id);
  const note = String(req.body?.note || '').trim() || null;

  if (!transactionId) {
    return res.status(400).json({ message: 'ID transaksi tidak valid' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [[transaction]] = await connection.query(
      `SELECT id, status, customer_name, transaction_no, service_date
       FROM tr_transactions
       WHERE id = ?
       FOR UPDATE`,
      [transactionId]
    );

    if (!transaction) {
      await connection.rollback();
      return res.status(404).json({ message: 'Transaksi POS tidak ditemukan' });
    }

    if (['Completed', 'Cancelled'].includes(transaction.status)) {
      await connection.rollback();
      return res.status(409).json({ message: 'Transaction is already completed or cancelled' });
    }

    await connection.query(
      `UPDATE tr_transactions
       SET status = 'Cancelled', updated_by = ?, updated_at = CURRENT_TIMESTAMP(0)
       WHERE id = ?`,
      [req.user?.id || null, transactionId]
    );

    const [assignments] = await connection.query(
      `SELECT id, employee_id, assignment_status
       FROM tr_worker_assignments
       WHERE transaction_id = ?
         AND assignment_status IN ('Assigned', 'In_Schedule', 'On_Progress')`,
      [transactionId]
    );

    if (assignments.length > 0) {
      await connection.query(
        `UPDATE tr_worker_assignments
         SET assignment_status = 'Cancelled',
             assignment_note = COALESCE(?, assignment_note),
             updated_at = NOW()
         WHERE transaction_id = ?
           AND assignment_status IN ('Assigned', 'In_Schedule', 'On_Progress')`,
        [note, transactionId]
      );
    }

    const trackingDesc = note
      ? `Transaction cancelled — ${note}`
      : 'Transaction cancelled by admin';

    await createPosTracking(
      connection,
      transactionId,
      'Cancelled',
      'Transaction cancelled',
      trackingDesc,
      req.user?.id
    );

    for (const row of assignments) {
      await connection.query(
        `INSERT INTO tr_worker_task_events
          (transaction_id, assignment_id, employee_id, event_type, old_service_date, new_service_date, message, created_by)
         VALUES (?, ?, ?, 'cancel', ?, NULL, ?, ?)`,
        [
          transactionId,
          row.id,
          row.employee_id,
          transaction.service_date,
          `${transaction.transaction_no || ''} • ${transaction.customer_name || ''}${note ? ` — ${note}` : ''}`.trim(),
          req.user?.id || null,
        ]
      );
    }

    await connection.commit();
    return res.json({ message: 'Transaction cancelled successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('[pos/cancelPosTransaction]', error.message);
    return res.status(500).json({ message: 'Failed to cancel transaction' });
  } finally {
    connection.release();
  }
};

export const updatePosAssignments = async (req, res) => {
  const transactionId = Number(req.params.id);
  const workerIds = Array.isArray(req.body.worker_ids) ? req.body.worker_ids : [];

  if (!transactionId) {
    return res.status(400).json({ message: 'ID transaksi tidak valid' });
  }

  const desiredIds = [...new Set(workerIds.map((id) => Number(id)).filter(Boolean))];
  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.query(
      `SELECT id, employee_id, assignment_status
       FROM tr_worker_assignments
       WHERE transaction_id = ?`,
      [transactionId]
    );

    const rejectedIds = new Set(
      existingRows
        .filter((row) => row.assignment_status === 'Rejected')
        .map((row) => Number(row.employee_id))
    );

    for (const employeeId of desiredIds) {
      if (rejectedIds.has(employeeId)) {
        await connection.rollback();
        return res.status(400).json({
          message: 'Worker ini sudah reject di transaksi ini dan tidak bisa di-assign ulang',
        });
      }
    }

    const activeRows = existingRows.filter((row) =>
      ['Assigned', 'In_Schedule', 'On_Progress'].includes(row.assignment_status)
    );

    for (const row of activeRows) {
      if (!desiredIds.includes(Number(row.employee_id))) {
        await connection.query('DELETE FROM tr_worker_assignments WHERE id = ?', [row.id]);
      }
    }

    const remainingActiveIds = new Set(
      activeRows
        .filter((row) => desiredIds.includes(Number(row.employee_id)))
        .map((row) => Number(row.employee_id))
    );

    const toInsertIds = desiredIds.filter((id) => !remainingActiveIds.has(id));

    if (toInsertIds.length > 0) {
      const [[txRow]] = await connection.query(
        `SELECT service_date FROM tr_transactions WHERE id = ?`,
        [transactionId]
      );
      if (!txRow) {
        await connection.rollback();
        return res.status(404).json({ message: 'Transaksi POS tidak ditemukan' });
      }

      const busyIds = await getBusyEmployeeIdsOnServiceDate(connection, txRow.service_date, {
        excludeTransactionId: transactionId,
      });
      const conflictIds = toInsertIds.filter((id) => busyIds.has(Number(id)));
      if (conflictIds.length > 0) {
        await connection.rollback();
        const [busyNames] = await aloraPool.query(
          `SELECT full_name FROM mst_employee WHERE employee_id IN (${conflictIds.map(() => '?').join(',')})`,
          conflictIds
        );
        const names = busyNames.map((r) => r.full_name).join(', ') || conflictIds.join(', ');
        return res.status(400).json({
          message: `Worker already has an active task at the same service date and time: ${names}`,
        });
      }
    }

    let workers = [];
    if (toInsertIds.length > 0) {
      const [workerRows] = await aloraPool.query(
        `SELECT employee_id, full_name
         FROM mst_employee
         WHERE company_id = 3
           AND exit_date IS NULL
           AND employee_id IN (${toInsertIds.map(() => '?').join(',')})`,
        toInsertIds
      );
      workers = workerRows;

      for (const worker of workers) {
        await connection.query(
          `INSERT INTO tr_worker_assignments
            (transaction_id, employee_id, employee_name, assignment_status)
           VALUES (?, ?, ?, ?)`,
          [transactionId, worker.employee_id, worker.full_name, 'Assigned']
        );
      }
    }

    const activeCount = remainingActiveIds.size + workers.length;

    await createPosTracking(
      connection,
      transactionId,
      'Assigned',
      'Assignment worker diperbarui',
      activeCount > 0 ? `${activeCount} worker aktif ditetapkan` : 'Seluruh assignment worker aktif dikosongkan',
      req.user?.id
    );

    await syncTransactionStatusFromAssignments(connection, transactionId);

    await connection.commit();
    return res.json({ message: 'Assignment worker berhasil diperbarui' });
  } catch (error) {
    await connection.rollback();
    console.error('[pos/updatePosAssignments]', error.message);
    return res.status(500).json({ message: 'Gagal memperbarui assignment worker' });
  } finally {
    connection.release();
  }
};

export const sendPosGroupNotification = async (req, res) => {
  const transactionId = Number(req.params.id);
  const { recipient, message } = req.body;

  if (!transactionId || !recipient || !message) {
    return res.status(400).json({ message: 'Recipient group dan message wajib diisi' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    await sendWaMessage(recipient, message);

    await connection.query(
      `INSERT INTO tr_notifications
        (transaction_id, channel, recipient, message, delivery_status, sent_at, created_by)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(0), ?)`,
      [transactionId, 'Group', recipient, message, 'Sent', req.user?.id || null]
    );

    await createPosTracking(
      connection,
      transactionId,
      'Group_Notified',
      'Pesan group terkirim',
      'Admin mengirim notifikasi group untuk transaksi POS',
      req.user?.id
    );

    await connection.commit();
    return res.json({ message: 'Pesan group berhasil dikirim' });
  } catch (error) {
    await connection.rollback();
    console.error('[pos/sendPosGroupNotification]', error.message);
    return res.status(500).json({ message: 'Gagal mengirim pesan group' });
  } finally {
    connection.release();
  }
};

export const sendPosCustomerNotification = async (req, res) => {
  const transactionId = Number(req.params.id);
  const { recipient, message } = req.body;

  if (!transactionId || !message) {
    return res.status(400).json({ message: 'Message customer wajib diisi' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [[transaction]] = await connection.query(
      `SELECT customer_phone
       FROM tr_transactions
       WHERE id = ?`,
      [transactionId]
    );

    const targetRecipient = recipient || transaction?.customer_phone;
    if (!targetRecipient) {
      await connection.rollback();
      return res.status(400).json({ message: 'Nomor customer belum tersedia pada transaksi ini' });
    }

    await sendWaMessage(targetRecipient, message);

    await connection.query(
      `INSERT INTO tr_notifications
        (transaction_id, channel, recipient, message, delivery_status, sent_at, created_by)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(0), ?)`,
      [transactionId, 'Customer', targetRecipient, message, 'Sent', req.user?.id || null]
    );

    await createPosTracking(
      connection,
      transactionId,
      'Customer_Notified',
      'Pesan customer terkirim',
      'Admin mengirim konfirmasi WhatsApp ke customer',
      req.user?.id
    );

    await connection.commit();
    return res.json({ message: 'Pesan customer berhasil dikirim' });
  } catch (error) {
    await connection.rollback();
    console.error('[pos/sendPosCustomerNotification]', error.message);
    return res.status(500).json({ message: 'Gagal mengirim pesan customer' });
  } finally {
    connection.release();
  }
};

/* ── Calendar month view (POS jobs by service_date + workers) ─ */
const POS_WORKER_COLOR_PALETTE = [
  '#3B82F6',
  '#059669',
  '#D97706',
  '#0891B2',
  '#DC2626',
  '#4F46E5',
  '#0D9488',
  '#2563EB',
  '#CA8A04',
  '#E11D48',
];

function hashPosWorkerColor(seed) {
  let hash = 0;
  const str = String(seed || '');
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return POS_WORKER_COLOR_PALETTE[Math.abs(hash) % POS_WORKER_COLOR_PALETTE.length];
}

function formatPosDateKey(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export const getPosCalendar = async (req, res) => {
  const { month } = req.query;
  if (!month || !/^\d{4}-\d{2}$/.test(String(month))) {
    return res.status(400).json({ message: 'Parameter month wajib (YYYY-MM)' });
  }

  const [yearStr, monthStr] = String(month).split('-');
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  if (!year || monthNum < 1 || monthNum > 12) {
    return res.status(400).json({ message: 'Parameter month tidak valid' });
  }

  const date_start = `${month}-01`;
  const lastDay = new Date(year, monthNum, 0).getDate();
  const date_end = `${month}-${String(lastDay).padStart(2, '0')}`;

  try {
    const [rows] = await cleanoxPool.query(
      `SELECT
        t.id,
        t.transaction_no,
        t.customer_name,
        t.customer_phone,
        t.service_date,
        t.total_people,
        t.final_amount,
        t.status,
        a.employee_id,
        a.employee_name,
        a.assignment_status
      FROM tr_transactions t
      LEFT JOIN tr_worker_assignments a
        ON a.transaction_id = t.id
        AND a.assignment_status IN ('Assigned', 'In_Schedule', 'On_Progress')
      WHERE DATE(t.service_date) BETWEEN ? AND ?
      ORDER BY t.service_date ASC, t.id ASC`,
      [date_start, date_end]
    );

    const days = {};
    const jobsMap = new Map();
    const legendMap = new Map();

    for (const row of rows) {
      const dateKey = formatPosDateKey(row.service_date);
      if (!dateKey) continue;

      if (!jobsMap.has(row.id)) {
        jobsMap.set(row.id, {
          id: row.id,
          transaction_no: row.transaction_no,
          customer_name: row.customer_name,
          customer_phone: row.customer_phone,
          service_date: dateKey,
          total_people: Number(row.total_people || 0),
          final_amount: Number(row.final_amount || 0),
          status: row.status,
          workers: [],
        });
      }

      if (row.employee_id != null || row.employee_name) {
        const name = row.employee_name || `Pekerja #${row.employee_id}`;
        const employeeId = row.employee_id == null ? name : Number(row.employee_id);
        const colorKey = row.employee_id == null ? name : String(row.employee_id);
        if (!legendMap.has(colorKey)) {
          legendMap.set(colorKey, {
            employee_id: row.employee_id == null ? null : Number(row.employee_id),
            name,
            color: hashPosWorkerColor(colorKey),
          });
        }
        const job = jobsMap.get(row.id);
        const already = job.workers.some(
          (w) =>
            (row.employee_id != null && Number(w.employee_id) === Number(row.employee_id)) ||
            w.name === name
        );
        if (!already) {
          job.workers.push({
            employee_id: row.employee_id == null ? null : Number(row.employee_id),
            name,
            color: legendMap.get(colorKey).color,
          });
        }
      }
    }

    for (const job of jobsMap.values()) {
      const dateKey = job.service_date;
      if (!days[dateKey]) days[dateKey] = { jobs: [], workers: [] };
      days[dateKey].jobs.push(job);
    }

    for (const dateKey of Object.keys(days)) {
      const countMap = new Map();
      for (const job of days[dateKey].jobs) {
        for (const worker of job.workers) {
          const key = worker.employee_id != null ? `id:${worker.employee_id}` : `name:${worker.name}`;
          const prev = countMap.get(key) || {
            employee_id: worker.employee_id,
            name: worker.name,
            color: worker.color,
            job_count: 0,
          };
          prev.job_count += 1;
          countMap.set(key, prev);
        }
      }
      days[dateKey].workers = [...countMap.values()].sort((a, b) =>
        a.name.localeCompare(b.name, 'id')
      );
    }

    const workers_legend = [...legendMap.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'id')
    );

    return res.json({
      month,
      date_start,
      date_end,
      days,
      workers_legend,
    });
  } catch (error) {
    console.error('[pos/getPosCalendar]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil data kalender POS' });
  }
};

export const servePosTakehomeEvidenceFile = (req, res) => {
  const safeFileName = path.basename(req.params.filename || '');
  const fullPath = path.join(TAKEHOME_EVIDENCE_BASE, safeFileName);
  if (!safeFileName || !fs.existsSync(fullPath)) {
    return res.status(404).json({ message: 'File evidence take-home tidak ditemukan' });
  }
  return res.sendFile(fullPath);
};

export const updatePosTakehomeStage = async (req, res) => {
  const transactionId = Number(req.params.id);
  const stage = String(req.params.stage || '').trim();
  const timestamp = req.body?.timestamp;
  const workersInput = req.body?.workers ?? req.body?.employee_names ?? req.body?.names;

  if (!transactionId) {
    return res.status(400).json({ message: 'ID transaksi tidak valid' });
  }
  if (!isValidTakehomeStage(stage)) {
    return res.status(400).json({ message: 'Stage take-home tidak valid' });
  }

  const workers = parseWorkersBody(workersInput, {
    employee_id: req.user?.id || null,
    employee_name: req.user?.name || req.user?.username || 'Admin',
  });
  if (workers.length === 0) {
    return res.status(400).json({ message: 'Pekerja / nama pengisi stage wajib diisi' });
  }

  const atValue = formatMysqlDateTime(timestamp);
  if (!atValue) {
    return res.status(400).json({ message: 'Timestamp stage tidak valid' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [[tx]] = await connection.query(
      `SELECT id, service_mode, status, customer_name
       FROM tr_transactions
       WHERE id = ?
       FOR UPDATE`,
      [transactionId]
    );
    if (!tx) {
      await connection.rollback();
      return res.status(404).json({ message: 'Transaksi tidak ditemukan' });
    }
    if (String(tx.service_mode) !== 'take_home') {
      await connection.rollback();
      return res.status(400).json({ message: 'Stage take-home hanya untuk transaksi Take Home' });
    }
    if (tx.status === 'Cancelled') {
      await connection.rollback();
      return res.status(409).json({ message: 'Transaksi dibatalkan — stage tidak bisa diubah' });
    }

    const progress = await ensureTakehomeProgressRow(connection, transactionId);
    const cols = stageColumns(stage);
    const stageIdx = TAKEHOME_STAGE_ORDER.indexOf(stage);
    for (let i = 0; i < stageIdx; i += 1) {
      const prev = TAKEHOME_STAGE_ORDER[i];
      if (!progress[stageColumns(prev).at]) {
        await connection.rollback();
        return res.status(400).json({
          message: `Lengkapi stage ${TAKEHOME_STAGE_LABELS[prev]} terlebih dahulu`,
        });
      }
    }

    await connection.query(
      `UPDATE tr_takehome_progress
       SET ${cols.by} = ?,
           ${cols.at} = ?,
           status = ?,
           updated_at = NOW()
       WHERE transaction_id = ?`,
      [JSON.stringify(workers), atValue, stage, transactionId]
    );

    await createPosTracking(
      connection,
      transactionId,
      'In_Progress',
      `Take Home: ${TAKEHOME_STAGE_LABELS[stage]}`,
      `Admin memperbarui stage ${TAKEHOME_STAGE_LABELS[stage]} untuk ${tx.customer_name}`,
      req.user?.id
    );

    await connection.commit();

    const [[updated]] = await cleanoxPool.query(
      `SELECT * FROM tr_takehome_progress WHERE transaction_id = ? LIMIT 1`,
      [transactionId]
    );

    return res.json({
      message: `Stage ${TAKEHOME_STAGE_LABELS[stage]} tersimpan`,
      takehome_progress: mapTakehomeProgressDto(updated, {
        photoPathBuilder: toAdminTakehomePhotoPath,
      }),
    });
  } catch (error) {
    await connection.rollback();
    console.error('[pos/updatePosTakehomeStage]', error.message);
    return res.status(500).json({ message: 'Gagal menyimpan stage take-home' });
  } finally {
    connection.release();
  }
};

export const clearPosTakehomeStage = async (req, res) => {
  const transactionId = Number(req.params.id);
  const stage = String(req.params.stage || '').trim();

  if (!transactionId) {
    return res.status(400).json({ message: 'ID transaksi tidak valid' });
  }
  if (!isValidTakehomeStage(stage)) {
    return res.status(400).json({ message: 'Stage take-home tidak valid' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [[tx]] = await connection.query(
      `SELECT id, service_mode, customer_name
       FROM tr_transactions
       WHERE id = ?
       FOR UPDATE`,
      [transactionId]
    );
    if (!tx) {
      await connection.rollback();
      return res.status(404).json({ message: 'Transaksi tidak ditemukan' });
    }
    if (String(tx.service_mode) !== 'take_home') {
      await connection.rollback();
      return res.status(400).json({ message: 'Stage take-home hanya untuk transaksi Take Home' });
    }

    const progress = await ensureTakehomeProgressRow(connection, transactionId);
    const stageIdx = TAKEHOME_STAGE_ORDER.indexOf(stage);
    const toClear = stagesFromIndex(stageIdx);

    const setClauses = ['updated_at = NOW()'];
    const params = [];
    for (const s of toClear) {
      const cols = stageColumns(s);
      unlinkTakehomePhotoIfExists(progress[cols.file]);
      setClauses.push(
        `${cols.by} = NULL`,
        `${cols.at} = NULL`,
        `${cols.file} = NULL`,
        `${cols.path} = NULL`
      );
    }

    const prevStatus = stageIdx > 0 ? TAKEHOME_STAGE_ORDER[stageIdx - 1] : null;
    setClauses.push('status = ?');
    params.push(prevStatus);
    params.push(transactionId);

    await connection.query(
      `UPDATE tr_takehome_progress
       SET ${setClauses.join(', ')}
       WHERE transaction_id = ?`,
      params
    );

    await createPosTracking(
      connection,
      transactionId,
      'In_Progress',
      `Take Home clear: ${TAKEHOME_STAGE_LABELS[stage]}`,
      `Admin menghapus progres dari ${TAKEHOME_STAGE_LABELS[stage]} untuk ${tx.customer_name}`,
      req.user?.id
    );

    await connection.commit();

    const [[updated]] = await cleanoxPool.query(
      `SELECT * FROM tr_takehome_progress WHERE transaction_id = ? LIMIT 1`,
      [transactionId]
    );

    return res.json({
      message: `Stage ${TAKEHOME_STAGE_LABELS[stage]} dan setelahnya dibersihkan`,
      takehome_progress: mapTakehomeProgressDto(updated, {
        photoPathBuilder: toAdminTakehomePhotoPath,
      }),
    });
  } catch (error) {
    await connection.rollback();
    console.error('[pos/clearPosTakehomeStage]', error.message);
    return res.status(500).json({ message: 'Gagal menghapus stage take-home' });
  } finally {
    connection.release();
  }
};

export const uploadPosTakehomeStageEvidence = async (req, res) => {
  const transactionId = Number(req.params.id);
  const stage = String(req.params.stage || '').trim();

  if (!transactionId) {
    return res.status(400).json({ message: 'ID transaksi tidak valid' });
  }
  if (!isValidTakehomeStage(stage)) {
    return res.status(400).json({ message: 'Stage take-home tidak valid' });
  }
  if (!req.file) {
    return res.status(400).json({ message: 'Foto evidence wajib diunggah' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [[tx]] = await connection.query(
      `SELECT id, service_mode, status
       FROM tr_transactions
       WHERE id = ?
       FOR UPDATE`,
      [transactionId]
    );
    if (!tx) {
      await connection.rollback();
      return res.status(404).json({ message: 'Transaksi tidak ditemukan' });
    }
    if (String(tx.service_mode) !== 'take_home') {
      await connection.rollback();
      return res.status(400).json({ message: 'Evidence take-home hanya untuk transaksi Take Home' });
    }
    if (tx.status === 'Cancelled') {
      await connection.rollback();
      return res.status(409).json({ message: 'Transaksi dibatalkan — upload evidence ditolak' });
    }

    const progress = await ensureTakehomeProgressRow(connection, transactionId);
    const cols = stageColumns(stage);
    const stageIdx = TAKEHOME_STAGE_ORDER.indexOf(stage);
    for (let i = 0; i < stageIdx; i += 1) {
      const prev = TAKEHOME_STAGE_ORDER[i];
      if (!progress[stageColumns(prev).at]) {
        await connection.rollback();
        return res.status(400).json({
          message: `Lengkapi stage ${TAKEHOME_STAGE_LABELS[prev]} terlebih dahulu`,
        });
      }
    }

    unlinkTakehomePhotoIfExists(progress[cols.file]);
    const saved = await saveTakehomePhotoFile(transactionId, stage, req.file);

    const incomingWorkers = parseWorkersBody(req.body?.workers, null);
    const existingWorkers = parseWorkersJson(progress[cols.by]);
    const workers =
      incomingWorkers.length > 0
        ? incomingWorkers
        : existingWorkers.length > 0
          ? existingWorkers
          : parseWorkersBody(null, {
              employee_id: req.user?.id || null,
              employee_name: req.user?.name || req.user?.username || 'Admin',
            });

    const atValue = progress[cols.at]
      ? formatMysqlDateTime(progress[cols.at])
      : formatMysqlDateTime(req.body?.timestamp);

    await connection.query(
      `UPDATE tr_takehome_progress
       SET ${cols.file} = ?,
           ${cols.path} = ?,
           ${cols.by} = ?,
           ${cols.at} = ?,
           status = ?,
           updated_at = NOW()
       WHERE transaction_id = ?`,
      [saved.file, saved.path, JSON.stringify(workers), atValue, stage, transactionId]
    );

    await connection.commit();

    const [[updated]] = await cleanoxPool.query(
      `SELECT * FROM tr_takehome_progress WHERE transaction_id = ? LIMIT 1`,
      [transactionId]
    );

    return res.json({
      message: `Evidence ${TAKEHOME_STAGE_LABELS[stage]} tersimpan`,
      takehome_progress: mapTakehomeProgressDto(updated, {
        photoPathBuilder: toAdminTakehomePhotoPath,
      }),
    });
  } catch (error) {
    await connection.rollback();
    console.error('[pos/uploadPosTakehomeStageEvidence]', error.message);
    return res.status(500).json({ message: 'Gagal mengunggah evidence take-home' });
  } finally {
    connection.release();
  }
};
