import fs from 'fs';
import path from 'path';
import multer from 'multer';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import cleanoxPool, { aloraPool } from '../../shared/db/cleanox.js';
import { createPosTracking } from '../../shared/utils/posTracking.js';
import {
  formatServiceDateKey,
  getBusyEmployeeIdsOnServiceDate,
} from '../../shared/utils/posWorkerBusy.js';
import { syncTransactionStatusFromAssignments } from '../../shared/utils/posTransactionStatusSync.js';
import { finalizeGeneralCleaningPricing } from '../../shared/utils/posGeneralCleaningBilling.js';
import {
  TAKEHOME_STAGE_LABELS,
  getNextTakehomeStage,
  isAllTakehomeStagesComplete,
  isValidTakehomeStage,
  mapTakehomeProgressDto,
  mergeWorkers,
  stageColumns,
} from '../../shared/utils/posTakehomeStages.js';
import {
  csatLabelFromScore,
  joinSurveyList,
  normalizeFeedbackText,
  normalizeLayananList,
  normalizeTagsList,
  npsCategoryFromScore,
} from '../../shared/utils/satisfactionSurveyFields.js';
import { upsertCleanoxSatisfactionByNota } from '../../shared/utils/upsertCleanoxSatisfaction.js';
import {
  loadSharedBeforeAfterPhotos,
  loadSharedEvidenceByTransactionIds,
  loadSharedPhotosGrouped,
  loadItemWorkNotesByTransactionId,
  loadSharedSurvey,
  resolveSurveyState,
  evaluateItemEvidenceCompletion,
  MAX_PHOTOS_PER_KIND_PER_ITEM,
} from '../../shared/utils/posSharedTaskEvidence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_BASE = process.env.UPLOAD_BASE_DIR
  ? path.resolve(process.env.UPLOAD_BASE_DIR)
  : path.resolve(__dirname, '../../../src/assets');
const TASK_EVIDENCE_BASE = path.join(STORAGE_BASE, 'worker-task-evidence');
const CUSTOMER_PHOTO_BASE = path.join(STORAGE_BASE, 'transaction-customer-photos');
const TAKEHOME_EVIDENCE_BASE = path.join(STORAGE_BASE, 'worker-takehome-evidence');

if (!fs.existsSync(TASK_EVIDENCE_BASE)) fs.mkdirSync(TASK_EVIDENCE_BASE, { recursive: true });
if (!fs.existsSync(CUSTOMER_PHOTO_BASE)) fs.mkdirSync(CUSTOMER_PHOTO_BASE, { recursive: true });
if (!fs.existsSync(TAKEHOME_EVIDENCE_BASE)) fs.mkdirSync(TAKEHOME_EVIDENCE_BASE, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('File evidence task harus berupa gambar'));
  },
});

export const taskEvidenceUploadMiddleware = upload.fields([
  { name: 'arrival_photo', maxCount: 1 },
  { name: 'before_photo', maxCount: 1 },
  { name: 'after_photo', maxCount: 1 },
  { name: 'takehome_photo', maxCount: 1 },
]);

const takehomePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('File evidence take-home harus berupa gambar'));
  },
});

export const takehomeStageUploadMiddleware = takehomePhotoUpload.single('photo');

const VALID_LIST_STATUSES = ['Assigned', 'In_Schedule', 'On_Progress', 'Done', 'Rejected'];

function sanitizeName(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

async function compressToJpg(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

async function saveTaskEvidencePhoto(
  employeeId,
  assignmentId,
  kind,
  file,
  { transactionItemId = null, uniqueSuffix = Date.now() } = {}
) {
  const employeeSlug = sanitizeName(employeeId);
  const assignmentSlug = sanitizeName(assignmentId);
  const itemSlug = transactionItemId ? `item_${sanitizeName(transactionItemId)}` : 'general';
  const kindSlug = sanitizeName(kind);
  const fileName = `${employeeSlug}_${assignmentSlug}_${itemSlug}_${kindSlug}_${uniqueSuffix}.jpg`;
  const filePath = path.join(TASK_EVIDENCE_BASE, fileName);
  const buffer = await compressToJpg(file.buffer);
  fs.writeFileSync(filePath, buffer);
  return {
    file: fileName,
    path: `/mobile-tasks/file/${fileName}`,
  };
}

async function listAssignmentPhotos(assignmentIds) {
  const ids = [...new Set((assignmentIds || []).map((id) => Number(id)).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const [rows] = await cleanoxPool.query(
    `SELECT id, assignment_id, transaction_item_id, kind, photo_file, photo_path, sort_order, created_at
     FROM tr_worker_assignment_photos
     WHERE assignment_id IN (?)
     ORDER BY sort_order ASC, id ASC`,
    [ids]
  );

  const map = new Map();
  for (const row of rows) {
    const key = Number(row.assignment_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

async function listCustomerPhotosByTransactionIds(transactionIds) {
  const ids = [...new Set((transactionIds || []).map((id) => Number(id)).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const [rows] = await cleanoxPool.query(
    `SELECT id, transaction_id, photo_file, photo_path, sort_order, created_at
     FROM tr_transaction_customer_photos
     WHERE transaction_id IN (?)
     ORDER BY sort_order ASC, id ASC`,
    [ids]
  );

  const map = new Map();
  for (const row of rows) {
    const key = Number(row.transaction_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      id: row.id,
      photo_path: `/mobile-tasks/customer-photo/${path.basename(row.photo_file || '')}`,
      created_at: row.created_at,
    });
  }
  return map;
}

function splitPhotosByKind(photos = []) {
  const before = [];
  const after = [];
  for (const photo of photos) {
    const item = {
      id: photo.id,
      photo_path: photo.photo_path,
      created_at: photo.created_at,
      transaction_item_id: photo.transaction_item_id ?? null,
      assignment_id: photo.assignment_id ?? null,
    };
    if (photo.kind === 'before') before.push(item);
    if (photo.kind === 'after') after.push(item);
  }
  return { before, after };
}

function mapPhotoDto(photo, { mobilePath = true } = {}) {
  const path = mobilePath ? photo.photo_path : photo.photo_path;
  return {
    id: photo.id,
    assignment_id: photo.assignment_id ?? null,
    transaction_item_id: photo.transaction_item_id ?? null,
    photo_path: path,
    created_at: photo.created_at,
  };
}

function mapGroupedPhotosToMobile(grouped) {
  const generalBefore = (grouped?.general?.before || []).map((photo) => mapPhotoDto(photo));
  const generalAfter = (grouped?.general?.after || []).map((photo) => mapPhotoDto(photo));
  return { generalBefore, generalAfter };
}

function mapItemEvidenceDto(item, grouped, workNotesMap = new Map()) {
  const itemId = Number(item.id);
  const bucket = grouped?.byItem?.get(itemId) || { before: [], after: [] };
  const before = bucket.before.map((photo) => mapPhotoDto(photo));
  const after = bucket.after.map((photo) => mapPhotoDto(photo));
  const noteRow = workNotesMap.get(itemId) || null;
  return {
    before_photos: before,
    after_photos: after,
    before_count: before.length,
    after_count: after.length,
    has_before: before.length >= 1,
    has_after: after.length >= 1,
    work_note: noteRow?.work_note || null,
    work_note_updated_at: noteRow?.updated_at || null,
    work_note_updated_by_employee_id: noteRow?.updated_by_employee_id ?? null,
  };
}

async function assertTransactionItemOwned(transactionId, transactionItemId, connection = cleanoxPool) {
  const itemId = Number(transactionItemId);
  const txId = Number(transactionId);
  if (!itemId) return null;
  const [[row]] = await connection.query(
    `SELECT id, transaction_id FROM tr_transaction_items WHERE id = ? AND transaction_id = ? LIMIT 1`,
    [itemId, txId]
  );
  return row || null;
}

async function countItemPhotos(connection, transactionId, transactionItemId, kind) {
  const grouped = await loadSharedPhotosGrouped(connection, transactionId);
  const bucket = grouped.byItem.get(Number(transactionItemId)) || { before: [], after: [] };
  if (kind === 'before') return bucket.before.length;
  if (kind === 'after') return bucket.after.length;
  return 0;
}

async function buildItemEvidenceContext(connection, transactionId, items = []) {
  const grouped = await loadSharedPhotosGrouped(connection, transactionId);
  const workNotesMap = await loadItemWorkNotesByTransactionId(connection, transactionId);
  const itemCompletion = evaluateItemEvidenceCompletion(items, grouped.byItem);
  const { generalBefore, generalAfter } = mapGroupedPhotosToMobile(grouped);
  const itemsEvidence = (items || []).map((item) => ({
    transaction_item_id: Number(item.id),
    service_name: item.service_name || null,
    qty: item.qty,
    unit_label: item.unit_label || null,
    category_name: item.category_name || null,
    evidence: mapItemEvidenceDto(item, grouped, workNotesMap),
  }));

  return {
    grouped,
    workNotesMap,
    itemCompletion,
    generalBefore,
    generalAfter,
    itemsEvidence,
  };
}

function enrichItemsWithEvidence(items = [], itemEvidenceContext = null) {
  if (!itemEvidenceContext) {
    return (items || []).map((item) => ({
      ...item,
      evidence: {
        before_photos: [],
        after_photos: [],
        before_count: 0,
        after_count: 0,
        has_before: false,
        has_after: false,
        work_note: null,
        work_note_updated_at: null,
        work_note_updated_by_employee_id: null,
      },
    }));
  }

  const evidenceByItemId = new Map(
    (itemEvidenceContext.itemsEvidence || []).map((row) => [Number(row.transaction_item_id), row.evidence])
  );

  return (items || []).map((item) => ({
    ...item,
    evidence: evidenceByItemId.get(Number(item.id)) || mapItemEvidenceDto(item, itemEvidenceContext.grouped, itemEvidenceContext.workNotesMap),
  }));
}

function todayDateStringJakarta() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const jakarta = new Date(utc + 7 * 60 * 60000);
  return jakarta.toISOString().slice(0, 10);
}

async function getBusyEmployeeIdsOnDate(connection, serviceDateTime, excludeTransactionId = null) {
  return getBusyEmployeeIdsOnServiceDate(connection, serviceDateTime, { excludeTransactionId });
}

async function getAssignmentOwnedByUser(assignmentId, employeeId) {
  const [[row]] = await cleanoxPool.query(
    `SELECT
      a.*,
      t.transaction_no,
      t.customer_name,
      t.customer_phone,
      t.customer_address,
      t.service_date,
      t.total_people,
      t.status AS transaction_status,
      t.notes AS transaction_notes,
      t.service_mode
     FROM tr_worker_assignments a
     INNER JOIN tr_transactions t ON t.id = a.transaction_id
     WHERE a.id = ? AND a.employee_id = ?
       AND COALESCE(t.is_history_entry, 0) = 0`,
    [assignmentId, employeeId]
  );
  return row || null;
}

function toMobileTakehomePhotoPath(photoFile) {
  if (!photoFile) return null;
  return `/mobile-tasks/takehome-file/${path.basename(String(photoFile))}`;
}

async function getTakehomeProgressByTransactionId(transactionId, connection = cleanoxPool) {
  const [[row]] = await connection.query(
    `SELECT * FROM tr_takehome_progress WHERE transaction_id = ? LIMIT 1`,
    [transactionId]
  );
  return row || null;
}

async function ensureTakehomeProgress(connection, transactionId) {
  const existing = await getTakehomeProgressByTransactionId(transactionId, connection);
  if (existing) return existing;
  await connection.query(
    `INSERT INTO tr_takehome_progress (transaction_id) VALUES (?)`,
    [transactionId]
  );
  return getTakehomeProgressByTransactionId(transactionId, connection);
}

async function saveTakehomeStagePhoto(transactionId, stage, file) {
  const fileName = `${transactionId}_${stage}_${Date.now()}.jpg`;
  const filePath = path.join(TAKEHOME_EVIDENCE_BASE, fileName);
  const buffer = await compressToJpg(file.buffer);
  fs.writeFileSync(filePath, buffer);
  return {
    file: fileName,
    path: toMobileTakehomePhotoPath(fileName),
  };
}

function parseSurveyAnswers(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapEvidence(row, photos = [], takehomeProgress = null, shared = null, itemEvidenceContext = null) {
  const serviceMode = String(row.service_mode || 'home_service');
  const isHome = serviceMode !== 'take_home';
  const ownSplit = splitPhotosByKind(photos);

  const sharedBefore = (shared?.before || []).map((photo) => mapPhotoDto(photo));
  const sharedAfter = (shared?.after || []).map((photo) => mapPhotoDto(photo));

  const generalBefore = itemEvidenceContext?.generalBefore || shared?.grouped?.general?.before?.map((p) => mapPhotoDto(p)) || [];
  const generalAfter = itemEvidenceContext?.generalAfter || shared?.grouped?.general?.after?.map((p) => mapPhotoDto(p)) || [];
  const itemsEvidence = itemEvidenceContext?.itemsEvidence || [];
  const itemCompletion =
    itemEvidenceContext?.itemCompletion ||
    shared?.itemCompletion ||
    evaluateItemEvidenceCompletion(shared?.items || [], shared?.grouped?.byItem || new Map());

  const before = isHome ? sharedBefore : ownSplit.before;
  const after = isHome ? sharedAfter : ownSplit.after;

  const hasArrival = Boolean(
    row.arrival_photo_path && row.arrival_latitude != null && row.arrival_longitude != null
  );
  const hasBefore = isHome
    ? itemCompletion.all_items_complete
    : before.length >= 1 || Boolean(row.before_photo_path);
  const hasAfter = isHome
    ? itemCompletion.all_items_complete
    : after.length >= 1 || Boolean(row.after_photo_path);

  const ownSurvey = resolveSurveyState({
    survey_rating: row.survey_rating,
    survey_note: row.survey_note,
    survey_answers: row.survey_answers,
    survey_at: row.survey_at,
    assignment_id: row.id,
  });
  const sharedSurvey = shared?.survey || null;
  const survey = sharedSurvey?.hasSurvey ? sharedSurvey : ownSurvey;
  const hasSurvey = Boolean(survey.hasSurvey);

  const takehomeDto =
    serviceMode === 'take_home'
      ? mapTakehomeProgressDto(takehomeProgress, { photoPathBuilder: toMobileTakehomePhotoPath })
      : null;
  const hasTakehomeComplete =
    serviceMode === 'take_home' ? isAllTakehomeStagesComplete(takehomeProgress) : false;

  const canComplete =
    serviceMode === 'take_home'
      ? hasTakehomeComplete && hasSurvey
      : hasArrival && itemCompletion.all_items_complete && hasSurvey;

  return {
    arrival_photo_path: row.arrival_photo_path || null,
    arrival_latitude: row.arrival_latitude != null ? Number(row.arrival_latitude) : null,
    arrival_longitude: row.arrival_longitude != null ? Number(row.arrival_longitude) : null,
    arrival_location_name: row.arrival_location_name || null,
    arrival_at: row.arrival_at || null,
    before_photos: before,
    after_photos: after,
    general_before_photos: isHome ? generalBefore : [],
    general_after_photos: isHome ? generalAfter : [],
    items_evidence: isHome ? itemsEvidence : [],
    all_items_complete: isHome ? itemCompletion.all_items_complete : false,
    items_completion: isHome
      ? {
          total_items: itemCompletion.total_items,
          completed_items: itemCompletion.completed_items,
        }
      : null,
    before_photo_path: before[0]?.photo_path || row.before_photo_path || null,
    before_photo_at: before[0]?.created_at || row.before_photo_at || null,
    after_photo_path: after[0]?.photo_path || row.after_photo_path || null,
    after_photo_at: after[0]?.created_at || row.after_photo_at || null,
    before_count: before.length || (!isHome && row.before_photo_path ? 1 : 0),
    after_count: after.length || (!isHome && row.after_photo_path ? 1 : 0),
    survey_rating: survey.rating,
    survey_note: survey.note,
    survey_answers: survey.answers,
    survey_at: survey.at,
    survey_source: survey.source || null,
    shared_evidence: true,
    has_arrival: hasArrival,
    has_before: hasBefore,
    has_after: hasAfter,
    has_survey: hasSurvey,
    has_takehome_complete: hasTakehomeComplete,
    can_complete: canComplete,
    takehome: takehomeDto,
  };
}

function mapTaskRow(
  row,
  photos = [],
  customerPhotos = [],
  takehomeProgress = null,
  serviceLabel = null,
  shared = null,
  itemEvidenceContext = null
) {
  const evidence = mapEvidence(row, photos, takehomeProgress, shared, itemEvidenceContext);
  return {
    assignment_id: row.id,
    assignment_status: row.assignment_status,
    assigned_at: row.assigned_at,
    responded_at: row.responded_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    assignment_note: row.assignment_note,
    recommended_employee_id: row.recommended_employee_id,
    recommended_employee_name: row.recommended_employee_name,
    service_mode: row.service_mode || 'home_service',
    service_label: serviceLabel || null,
    evidence,
    takehome: evidence.takehome,
    customer_photos: customerPhotos,
    transaction: {
      id: row.transaction_id,
      transaction_no: row.transaction_no,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone,
      customer_address: row.customer_address,
      service_date: row.service_date,
      total_people: row.total_people,
      status: row.transaction_status,
      notes: row.transaction_notes,
      service_mode: row.service_mode || 'home_service',
      service_label: serviceLabel || null,
    },
  };
}

async function buildSharedContextForRow(row, sharedMap = null) {
  const txId = Number(row.transaction_id);
  if (sharedMap?.has(txId)) return sharedMap.get(txId);
  const batch = await loadSharedEvidenceByTransactionIds(cleanoxPool, [txId]);
  return (
    batch.get(txId) || {
      before: [],
      after: [],
      survey: {
        hasSurvey: false,
        source: null,
        rating: null,
        answers: null,
        note: null,
        at: null,
        fromAssignmentId: null,
      },
    }
  );
}

async function buildServiceLabelMap(transactionIds = []) {
  const ids = [...new Set((transactionIds || []).map(Number).filter(Boolean))];
  const map = new Map();
  if (ids.length === 0) return map;

  const [itemRows] = await cleanoxPool.query(
    `SELECT i.transaction_id, s.name AS service_name
     FROM tr_transaction_items i
     INNER JOIN mst_services s ON s.id = i.service_id
     WHERE i.transaction_id IN (?)
     ORDER BY i.transaction_id ASC, i.id ASC`,
    [ids]
  );

  for (const row of itemRows || []) {
    const txId = Number(row.transaction_id);
    if (!map.has(txId)) map.set(txId, []);
    const name = String(row.service_name || '').trim();
    if (name) map.get(txId).push(name);
  }

  const labelMap = new Map();
  for (const [txId, names] of map.entries()) {
    const unique = [...new Set(names)];
    labelMap.set(txId, unique.join(' · ') || null);
  }
  return labelMap;
}

export const serveTaskEvidenceFile = (req, res) => {
  const safeFileName = path.basename(req.params.filename);
  const fullPath = path.join(TASK_EVIDENCE_BASE, safeFileName);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ message: 'File evidence task tidak ditemukan' });
  }

  return res.sendFile(fullPath);
};

export const serveMobileCustomerPhoto = (req, res) => {
  const safeFileName = path.basename(req.params.filename || '');
  const fullPath = path.join(CUSTOMER_PHOTO_BASE, safeFileName);

  if (!safeFileName || !fs.existsSync(fullPath)) {
    return res.status(404).json({ message: 'File referensi customer tidak ditemukan' });
  }

  return res.sendFile(fullPath);
};

export const serveMobileTakehomeEvidenceFile = (req, res) => {
  const safeFileName = path.basename(req.params.filename || '');
  const fullPath = path.join(TAKEHOME_EVIDENCE_BASE, safeFileName);
  if (!safeFileName || !fs.existsSync(fullPath)) {
    return res.status(404).json({ message: 'File evidence take-home tidak ditemukan' });
  }
  return res.sendFile(fullPath);
};

export const listMyTasks = async (req, res) => {
  const employeeId = req.user?.id;
  const statusFilter = String(req.query.status || 'Assigned');
  const onDateRaw = req.query.on_date != null ? String(req.query.on_date).trim() : '';

  try {
    const params = [employeeId];
    let statusSql = '';
    let dateSql = '';

    if (statusFilter !== 'all') {
      if (!VALID_LIST_STATUSES.includes(statusFilter)) {
        return res.status(400).json({ message: 'Filter status tidak valid' });
      }
      statusSql = ' AND a.assignment_status = ?';
      params.push(statusFilter);
    } else {
      statusSql = " AND a.assignment_status <> 'Cancelled'";
    }

    if (onDateRaw) {
      let onDate = null;
      if (onDateRaw.toLowerCase() === 'today') {
        onDate = todayDateStringJakarta();
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(onDateRaw)) {
        onDate = onDateRaw;
      } else {
        return res.status(400).json({ message: 'Parameter on_date tidak valid' });
      }
      dateSql = ' AND DATE(t.service_date) = ?';
      params.push(onDate);
    }

    const [rows] = await cleanoxPool.query(
      `SELECT
        a.*,
        t.transaction_no,
        t.customer_name,
        t.customer_phone,
        t.customer_address,
        t.service_date,
        t.total_people,
        t.status AS transaction_status,
        t.notes AS transaction_notes,
        t.service_mode
       FROM tr_worker_assignments a
       INNER JOIN tr_transactions t ON t.id = a.transaction_id
       WHERE a.employee_id = ?
       AND COALESCE(t.is_history_entry, 0) = 0
       ${statusSql}
       ${dateSql}
       ORDER BY t.service_date ASC, a.id DESC`,
      params
    );

    const photosMap = await listAssignmentPhotos(rows.map((row) => row.id));
    const customerPhotosMap = await listCustomerPhotosByTransactionIds(
      rows.map((row) => row.transaction_id)
    );
    const serviceLabelMap = await buildServiceLabelMap(rows.map((row) => row.transaction_id));
    const sharedMap = await loadSharedEvidenceByTransactionIds(
      cleanoxPool,
      rows.map((row) => row.transaction_id)
    );

    const takehomeTxIds = [
      ...new Set(
        rows
          .filter((row) => String(row.service_mode) === 'take_home')
          .map((row) => Number(row.transaction_id))
          .filter(Boolean)
      ),
    ];
    const takehomeMap = new Map();
    if (takehomeTxIds.length > 0) {
      const [progressRows] = await cleanoxPool.query(
        `SELECT * FROM tr_takehome_progress WHERE transaction_id IN (?)`,
        [takehomeTxIds]
      );
      for (const progress of progressRows) {
        takehomeMap.set(Number(progress.transaction_id), progress);
      }
    }

    return res.json({
      tasks: rows.map((row) => {
        const txId = Number(row.transaction_id);
        const shared = sharedMap.get(txId) || null;
        const itemEvidenceContext =
          String(row.service_mode) !== 'take_home' && shared
            ? {
                grouped: shared.grouped,
                workNotesMap: new Map(),
                itemCompletion: shared.itemCompletion,
                generalBefore: (shared.grouped?.general?.before || []).map((p) => mapPhotoDto(p)),
                generalAfter: (shared.grouped?.general?.after || []).map((p) => mapPhotoDto(p)),
                itemsEvidence: (shared.items || []).map((item) => ({
                  transaction_item_id: Number(item.id),
                  service_name: item.service_name || null,
                  qty: item.qty,
                  unit_label: item.unit_label || null,
                  category_name: item.category_name || null,
                  evidence: mapItemEvidenceDto(item, shared.grouped, new Map()),
                })),
              }
            : null;
        return mapTaskRow(
          row,
          photosMap.get(Number(row.id)) || [],
          customerPhotosMap.get(Number(row.transaction_id)) || [],
          takehomeMap.get(Number(row.transaction_id)) || null,
          serviceLabelMap.get(Number(row.transaction_id)) || null,
          shared,
          itemEvidenceContext
        );
      }),
    });
  } catch (error) {
    console.error('[mobileTasks/listMyTasks]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil daftar task' });
  }
};

export const getMyTaskDetail = async (req, res) => {
  const employeeId = req.user?.id;
  const assignmentId = Number(req.params.assignmentId);

  if (!assignmentId) {
    return res.status(400).json({ message: 'ID assignment tidak valid' });
  }

  try {
    const row = await getAssignmentOwnedByUser(assignmentId, employeeId);
    if (!row) {
      return res.status(404).json({ message: 'Task tidak ditemukan' });
    }

    const [items] = await cleanoxPool.query(
      `SELECT
        i.id,
        i.qty,
        i.unit_label,
        s.name AS service_name,
        c.name AS category_name
       FROM tr_transaction_items i
       INNER JOIN mst_services s ON s.id = i.service_id
       LEFT JOIN mst_category c ON c.id = s.category_id
       WHERE i.transaction_id = ?
       ORDER BY i.id`,
      [row.transaction_id]
    );

    const photosMap = await listAssignmentPhotos([row.id]);
    const customerPhotosMap = await listCustomerPhotosByTransactionIds([row.transaction_id]);
    const serviceLabelMap = await buildServiceLabelMap([row.transaction_id]);
    const shared = await buildSharedContextForRow(row);
    const itemEvidenceContext =
      String(row.service_mode) !== 'take_home'
        ? await buildItemEvidenceContext(cleanoxPool, row.transaction_id, items)
        : null;
    const takehomeProgress =
      String(row.service_mode) === 'take_home'
        ? await getTakehomeProgressByTransactionId(row.transaction_id)
        : null;
    return res.json({
      task: mapTaskRow(
        row,
        photosMap.get(Number(row.id)) || [],
        customerPhotosMap.get(Number(row.transaction_id)) || [],
        takehomeProgress,
        serviceLabelMap.get(Number(row.transaction_id)) || null,
        shared,
        itemEvidenceContext
      ),
      items: enrichItemsWithEvidence(items, itemEvidenceContext),
    });
  } catch (error) {
    console.error('[mobileTasks/getMyTaskDetail]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil detail task' });
  }
};

export const listReplacementCandidates = async (req, res) => {
  const employeeId = req.user?.id;
  const assignmentId = Number(req.params.assignmentId);

  if (!assignmentId) {
    return res.status(400).json({ message: 'ID assignment tidak valid' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    const row = await getAssignmentOwnedByUser(assignmentId, employeeId);
    if (!row) {
      return res.status(404).json({ message: 'Task tidak ditemukan' });
    }
    if (row.assignment_status !== 'Assigned') {
      return res.status(409).json({ message: 'Hanya task On Review yang bisa memilih pengganti' });
    }

    const serviceDateKey = formatServiceDateKey(row.service_date);
    const busyIds = await getBusyEmployeeIdsOnDate(connection, row.service_date);

    const [txAssignments] = await connection.query(
      `SELECT employee_id FROM tr_worker_assignments WHERE transaction_id = ?`,
      [row.transaction_id]
    );
    const onThisTx = new Set(txAssignments.map((item) => Number(item.employee_id)));

    const [employees] = await aloraPool.query(
      `SELECT employee_id, full_name, phone_number
       FROM mst_employee
       WHERE company_id = 3
         AND exit_date IS NULL
       ORDER BY full_name`
    );

    const candidates = employees.filter((emp) => {
      const id = Number(emp.employee_id);
      if (id === Number(employeeId)) return false;
      if (onThisTx.has(id)) return false;
      if (busyIds.has(id)) return false;
      return true;
    });

    return res.json({
      service_date: serviceDateKey,
      candidates,
    });
  } catch (error) {
    console.error('[mobileTasks/listReplacementCandidates]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil kandidat pengganti' });
  } finally {
    connection.release();
  }
};

export const acceptTask = async (req, res) => {
  const employeeId = req.user?.id;
  const assignmentId = Number(req.params.assignmentId);

  if (!assignmentId) {
    return res.status(400).json({ message: 'ID assignment tidak valid' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [[row]] = await connection.query(
      `SELECT a.*, t.customer_name
       FROM tr_worker_assignments a
       INNER JOIN tr_transactions t ON t.id = a.transaction_id
       WHERE a.id = ? AND a.employee_id = ?
         AND COALESCE(t.is_history_entry, 0) = 0
       FOR UPDATE`,
      [assignmentId, employeeId]
    );

    if (!row) {
      await connection.rollback();
      return res.status(404).json({ message: 'Task tidak ditemukan' });
    }
    if (row.assignment_status !== 'Assigned') {
      await connection.rollback();
      return res.status(409).json({ message: 'Task sudah direspons sebelumnya' });
    }

    await connection.query(
      `UPDATE tr_worker_assignments
       SET assignment_status = 'In_Schedule',
           responded_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [assignmentId]
    );

    await createPosTracking(
      connection,
      row.transaction_id,
      'Assigned',
      'Task In Schedule',
      `${row.employee_name} menerima tugas untuk ${row.customer_name} (In Schedule)`,
      employeeId
    );

    await syncTransactionStatusFromAssignments(connection, row.transaction_id);

    await connection.commit();
    return res.json({ message: 'Tugas diterima — In Schedule' });
  } catch (error) {
    await connection.rollback();
    console.error('[mobileTasks/acceptTask]', error.message);
    return res.status(500).json({ message: 'Gagal menerima tugas' });
  } finally {
    connection.release();
  }
};

export const startTask = async (req, res) => {
  const employeeId = req.user?.id;
  const assignmentId = Number(req.params.assignmentId);
  const files = req.files || {};
  const latitude = req.body.latitude != null && req.body.latitude !== '' ? Number(req.body.latitude) : null;
  const longitude = req.body.longitude != null && req.body.longitude !== '' ? Number(req.body.longitude) : null;
  const locationName = req.body.location_name || null;

  if (!assignmentId) {
    return res.status(400).json({ message: 'ID assignment tidak valid' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [[row]] = await connection.query(
      `SELECT a.*, t.customer_name, t.service_mode
       FROM tr_worker_assignments a
       INNER JOIN tr_transactions t ON t.id = a.transaction_id
       WHERE a.id = ? AND a.employee_id = ?
         AND COALESCE(t.is_history_entry, 0) = 0
       FOR UPDATE`,
      [assignmentId, employeeId]
    );

    if (!row) {
      await connection.rollback();
      return res.status(404).json({ message: 'Task tidak ditemukan' });
    }
    if (row.assignment_status !== 'In_Schedule') {
      await connection.rollback();
      return res.status(409).json({ message: 'Hanya task In Schedule yang bisa dimulai' });
    }

    const isTakeHome = String(row.service_mode) === 'take_home';

    if (isTakeHome) {
      await ensureTakehomeProgress(connection, row.transaction_id);
      await connection.query(
        `UPDATE tr_worker_assignments
         SET assignment_status = 'On_Progress',
             started_at = NOW(),
             updated_at = NOW()
         WHERE id = ?`,
        [assignmentId]
      );

      await createPosTracking(
        connection,
        row.transaction_id,
        'In_Progress',
        'Task On Progress',
        `${row.employee_name} mengambil order take-home untuk ${row.customer_name}`,
        employeeId
      );

      await syncTransactionStatusFromAssignments(connection, row.transaction_id);
      await connection.commit();
      return res.json({ message: 'Order diambil — On Progress' });
    }

    if (!files.arrival_photo?.[0]) {
      await connection.rollback();
      return res.status(400).json({ message: 'Foto bukti kedatangan wajib diambil' });
    }
    if (latitude == null || Number.isNaN(latitude) || longitude == null || Number.isNaN(longitude)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Lokasi GPS wajib disertakan bersama foto kedatangan' });
    }

    const arrivalPhoto = await saveTaskEvidencePhoto(
      employeeId,
      assignmentId,
      'arrival',
      files.arrival_photo[0]
    );

    await connection.query(
      `UPDATE tr_worker_assignments
       SET assignment_status = 'On_Progress',
           started_at = NOW(),
           arrival_photo_file = ?,
           arrival_photo_path = ?,
           arrival_latitude = ?,
           arrival_longitude = ?,
           arrival_location_name = ?,
           arrival_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [
        arrivalPhoto.file,
        arrivalPhoto.path,
        latitude,
        longitude,
        locationName,
        assignmentId,
      ]
    );

    await createPosTracking(
      connection,
      row.transaction_id,
      'In_Progress',
      'Task On Progress',
      `${row.employee_name} memulai pengerjaan untuk ${row.customer_name} dengan bukti kedatangan`,
      employeeId
    );

    await syncTransactionStatusFromAssignments(connection, row.transaction_id);

    await connection.commit();
    return res.json({ message: 'Pengerjaan dimulai — On Progress' });
  } catch (error) {
    await connection.rollback();
    console.error('[mobileTasks/startTask]', error.message);
    return res.status(500).json({ message: 'Gagal memulai pengerjaan' });
  } finally {
    connection.release();
  }
};

export const advanceTakehomeStage = async (req, res) => {
  const employeeId = req.user?.id;
  const assignmentId = Number(req.params.assignmentId);
  const stage = String(req.params.stage || '').trim();

  if (!assignmentId) {
    return res.status(400).json({ message: 'ID assignment tidak valid' });
  }
  if (!isValidTakehomeStage(stage)) {
    return res.status(400).json({ message: 'Stage take-home tidak valid' });
  }
  if (!req.file) {
    return res.status(400).json({ message: 'Foto stage wajib diambil' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [[row]] = await connection.query(
      `SELECT a.*, t.customer_name, t.service_mode
       FROM tr_worker_assignments a
       INNER JOIN tr_transactions t ON t.id = a.transaction_id
       WHERE a.id = ? AND a.employee_id = ?
         AND COALESCE(t.is_history_entry, 0) = 0
       FOR UPDATE`,
      [assignmentId, employeeId]
    );

    if (!row) {
      await connection.rollback();
      return res.status(404).json({ message: 'Task tidak ditemukan' });
    }
    if (String(row.service_mode) !== 'take_home') {
      await connection.rollback();
      return res.status(400).json({ message: 'Stage take-home hanya untuk transaksi Take Home' });
    }
    if (row.assignment_status !== 'On_Progress') {
      await connection.rollback();
      return res.status(409).json({ message: 'Hanya task On Progress yang bisa mengisi stage' });
    }

    const progress = await ensureTakehomeProgress(connection, row.transaction_id);
    const nextStage = getNextTakehomeStage(progress);
    if (nextStage !== stage) {
      await connection.rollback();
      return res.status(400).json({
        message: nextStage
          ? `Stage berikutnya adalah ${TAKEHOME_STAGE_LABELS[nextStage]}`
          : 'Semua stage take-home sudah lengkap',
      });
    }

    const cols = stageColumns(stage);
    const saved = await saveTakehomeStagePhoto(row.transaction_id, stage, req.file);
    const merged = mergeWorkers(progress[cols.by], [
      {
        employee_id: Number(employeeId),
        employee_name: row.employee_name || `Pekerja #${employeeId}`,
      },
    ]);

    await connection.query(
      `UPDATE tr_takehome_progress
       SET ${cols.by} = ?,
           ${cols.at} = NOW(),
           ${cols.file} = ?,
           ${cols.path} = ?,
           status = ?,
           updated_at = NOW()
       WHERE transaction_id = ?`,
      [JSON.stringify(merged), saved.file, saved.path, stage, row.transaction_id]
    );

    await createPosTracking(
      connection,
      row.transaction_id,
      'In_Progress',
      `Take Home: ${TAKEHOME_STAGE_LABELS[stage]}`,
      `${row.employee_name} menyelesaikan stage ${TAKEHOME_STAGE_LABELS[stage]} untuk ${row.customer_name}`,
      employeeId
    );

    await connection.commit();

    const updatedProgress = await getTakehomeProgressByTransactionId(row.transaction_id);
    const photosMap = await listAssignmentPhotos([assignmentId]);
    const refreshed = await getAssignmentOwnedByUser(assignmentId, employeeId);
    const shared = await buildSharedContextForRow(refreshed || row);

    return res.json({
      message: `Stage ${TAKEHOME_STAGE_LABELS[stage]} tersimpan`,
      takehome: mapTakehomeProgressDto(updatedProgress, {
        photoPathBuilder: toMobileTakehomePhotoPath,
      }),
      evidence: mapEvidence(
        refreshed || row,
        photosMap.get(assignmentId) || [],
        updatedProgress,
        shared
      ),
    });
  } catch (error) {
    await connection.rollback();
    console.error('[mobileTasks/advanceTakehomeStage]', error.message);
    return res.status(500).json({ message: 'Gagal menyimpan stage take-home' });
  } finally {
    connection.release();
  }
};

export const uploadBeforePhoto = async (req, res) => {
  const employeeId = req.user?.id;
  const assignmentId = Number(req.params.assignmentId);
  const files = req.files || {};
  const transactionItemId = Number(req.body.transaction_item_id);

  if (!assignmentId) {
    return res.status(400).json({ message: 'ID assignment tidak valid' });
  }
  if (!files.before_photo?.[0]) {
    return res.status(400).json({ message: 'Foto before wajib diambil' });
  }

  try {
    const row = await getAssignmentOwnedByUser(assignmentId, employeeId);
    if (!row) {
      return res.status(404).json({ message: 'Task tidak ditemukan' });
    }
    if (row.assignment_status !== 'On_Progress') {
      return res.status(409).json({ message: 'Foto before hanya untuk task On Progress' });
    }

    const isHome = String(row.service_mode) !== 'take_home';
    if (isHome) {
      if (!transactionItemId) {
        return res.status(400).json({ message: 'transaction_item_id wajib untuk foto per layanan' });
      }
      const ownedItem = await assertTransactionItemOwned(row.transaction_id, transactionItemId);
      if (!ownedItem) {
        return res.status(400).json({ message: 'Item layanan tidak valid untuk transaksi ini' });
      }
      const currentCount = await countItemPhotos(cleanoxPool, row.transaction_id, transactionItemId, 'before');
      if (currentCount >= MAX_PHOTOS_PER_KIND_PER_ITEM) {
        return res.status(400).json({
          message: `Maksimal ${MAX_PHOTOS_PER_KIND_PER_ITEM} foto before per layanan`,
        });
      }
    } else {
      const sharedPhotos = await loadSharedBeforeAfterPhotos(cleanoxPool, row.transaction_id);
      if (sharedPhotos.before.length >= MAX_PHOTOS_PER_KIND_PER_ITEM) {
        return res.status(400).json({
          message: `Maksimal ${MAX_PHOTOS_PER_KIND_PER_ITEM} foto before`,
        });
      }
    }

    const photo = await saveTaskEvidencePhoto(
      employeeId,
      assignmentId,
      'before',
      files.before_photo[0],
      { transactionItemId: isHome ? transactionItemId : null }
    );
    const grouped = isHome
      ? await loadSharedPhotosGrouped(cleanoxPool, row.transaction_id)
      : null;
    const sortOrder = isHome
      ? (grouped?.byItem?.get(transactionItemId)?.before?.length || 0)
      : (await loadSharedBeforeAfterPhotos(cleanoxPool, row.transaction_id)).before.length;
    const [insertResult] = await cleanoxPool.query(
      `INSERT INTO tr_worker_assignment_photos
        (assignment_id, transaction_item_id, kind, photo_file, photo_path, sort_order, created_at)
       VALUES (?, ?, 'before', ?, ?, ?, NOW())`,
      [
        assignmentId,
        isHome ? transactionItemId : null,
        photo.file,
        photo.path,
        sortOrder,
      ]
    );

    await cleanoxPool.query(
      `UPDATE tr_worker_assignments
       SET before_photo_file = ?,
           before_photo_path = ?,
           before_photo_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [photo.file, photo.path, assignmentId]
    );

    const photosMap = await listAssignmentPhotos([assignmentId]);
    const shared = await buildSharedContextForRow(row);
    const [items] = await cleanoxPool.query(
      `SELECT i.id, i.qty, i.unit_label, s.name AS service_name, c.name AS category_name
       FROM tr_transaction_items i
       INNER JOIN mst_services s ON s.id = i.service_id
       LEFT JOIN mst_category c ON c.id = s.category_id
       WHERE i.transaction_id = ?
       ORDER BY i.id`,
      [row.transaction_id]
    );
    const itemEvidenceContext = isHome
      ? await buildItemEvidenceContext(cleanoxPool, row.transaction_id, items)
      : null;
    const evidence = mapEvidence(row, photosMap.get(assignmentId) || [], null, shared, itemEvidenceContext);
    return res.json({
      message: 'Foto before tersimpan',
      photo: {
        id: insertResult.insertId,
        photo_path: photo.path,
        transaction_item_id: isHome ? transactionItemId : null,
      },
      evidence,
    });
  } catch (error) {
    console.error('[mobileTasks/uploadBeforePhoto]', error.message);
    return res.status(500).json({ message: 'Gagal menyimpan foto before' });
  }
};

export const uploadAfterPhoto = async (req, res) => {
  const employeeId = req.user?.id;
  const assignmentId = Number(req.params.assignmentId);
  const files = req.files || {};
  const transactionItemId = Number(req.body.transaction_item_id);

  if (!assignmentId) {
    return res.status(400).json({ message: 'ID assignment tidak valid' });
  }
  if (!files.after_photo?.[0]) {
    return res.status(400).json({ message: 'Foto after wajib diambil' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [[row]] = await connection.query(
      `SELECT a.*, t.customer_name, t.service_mode
       FROM tr_worker_assignments a
       INNER JOIN tr_transactions t ON t.id = a.transaction_id
       WHERE a.id = ? AND a.employee_id = ?
         AND COALESCE(t.is_history_entry, 0) = 0
       FOR UPDATE`,
      [assignmentId, employeeId]
    );

    if (!row) {
      await connection.rollback();
      return res.status(404).json({ message: 'Task tidak ditemukan' });
    }
    if (row.assignment_status !== 'On_Progress') {
      await connection.rollback();
      return res.status(409).json({ message: 'Foto after hanya untuk task On Progress' });
    }
    if (!row.started_at) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Mulai pengerjaan terlebih dahulu sebelum mengambil foto after',
      });
    }

    const isHome = String(row.service_mode) !== 'take_home';
    const grouped = await loadSharedPhotosGrouped(connection, row.transaction_id);

    if (isHome) {
      if (!transactionItemId) {
        await connection.rollback();
        return res.status(400).json({ message: 'transaction_item_id wajib untuk foto per layanan' });
      }
      const ownedItem = await assertTransactionItemOwned(row.transaction_id, transactionItemId, connection);
      if (!ownedItem) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item layanan tidak valid untuk transaksi ini' });
      }
      const itemBucket = grouped.byItem.get(transactionItemId) || { before: [], after: [] };
      if (itemBucket.before.length < 1) {
        await connection.rollback();
        return res.status(400).json({ message: 'Ambil foto before untuk layanan ini terlebih dahulu' });
      }
      if (itemBucket.after.length >= MAX_PHOTOS_PER_KIND_PER_ITEM) {
        await connection.rollback();
        return res.status(400).json({
          message: `Maksimal ${MAX_PHOTOS_PER_KIND_PER_ITEM} foto after per layanan`,
        });
      }
    } else {
      const sharedPhotos = await loadSharedBeforeAfterPhotos(connection, row.transaction_id);
      const sharedSurvey = await loadSharedSurvey(connection, row.transaction_id);
      const shared = {
        before: sharedPhotos.before,
        after: sharedPhotos.after,
        survey: sharedSurvey,
      };
      const existingEvidence = mapEvidence(row, [], null, shared);
      if (!existingEvidence.has_before) {
        await connection.rollback();
        return res.status(400).json({ message: 'Ambil foto before terlebih dahulu' });
      }
      if (sharedPhotos.after.length >= MAX_PHOTOS_PER_KIND_PER_ITEM) {
        await connection.rollback();
        return res.status(400).json({
          message: `Maksimal ${MAX_PHOTOS_PER_KIND_PER_ITEM} foto after`,
        });
      }
    }

    const photo = await saveTaskEvidencePhoto(
      employeeId,
      assignmentId,
      'after',
      files.after_photo[0],
      { transactionItemId: isHome ? transactionItemId : null }
    );
    const sortOrder = isHome
      ? (grouped.byItem.get(transactionItemId)?.after?.length || 0)
      : (await loadSharedBeforeAfterPhotos(connection, row.transaction_id)).after.length;
    const [insertResult] = await connection.query(
      `INSERT INTO tr_worker_assignment_photos
        (assignment_id, transaction_item_id, kind, photo_file, photo_path, sort_order, created_at)
       VALUES (?, ?, 'after', ?, ?, ?, NOW())`,
      [
        assignmentId,
        isHome ? transactionItemId : null,
        photo.file,
        photo.path,
        sortOrder,
      ]
    );

    await connection.query(
      `UPDATE tr_worker_assignments
       SET after_photo_file = ?,
           after_photo_path = ?,
           after_photo_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [photo.file, photo.path, assignmentId]
    );

    const [[updatedAssignment]] = await connection.query(
      `SELECT after_photo_at FROM tr_worker_assignments WHERE id = ?`,
      [assignmentId]
    );

    await finalizeGeneralCleaningPricing(connection, row.transaction_id, {
      actorId: employeeId,
      endAfterPhotoAt: updatedAssignment?.after_photo_at || new Date(),
    });

    await connection.commit();

    const photosMap = await listAssignmentPhotos([assignmentId]);
    const sharedAfterUpload = await buildSharedContextForRow({
      ...row,
      after_photo_file: photo.file,
      after_photo_path: photo.path,
    });
    const [items] = await cleanoxPool.query(
      `SELECT i.id, i.qty, i.unit_label, s.name AS service_name, c.name AS category_name
       FROM tr_transaction_items i
       INNER JOIN mst_services s ON s.id = i.service_id
       LEFT JOIN mst_category c ON c.id = s.category_id
       WHERE i.transaction_id = ?
       ORDER BY i.id`,
      [row.transaction_id]
    );
    const itemEvidenceContext = isHome
      ? await buildItemEvidenceContext(cleanoxPool, row.transaction_id, items)
      : null;
    const evidence = mapEvidence(
      { ...row, after_photo_file: photo.file, after_photo_path: photo.path },
      photosMap.get(assignmentId) || [],
      null,
      sharedAfterUpload,
      itemEvidenceContext
    );
    return res.json({
      message: 'Foto after tersimpan',
      photo: {
        id: insertResult.insertId,
        photo_path: photo.path,
        transaction_item_id: isHome ? transactionItemId : null,
      },
      evidence,
    });
  } catch (error) {
    await connection.rollback();
    console.error('[mobileTasks/uploadAfterPhoto]', error.message);
    const isDuration = /Durasi pengerjaan tidak valid/i.test(String(error.message || ''));
    return res.status(isDuration ? 400 : 500).json({
      message: isDuration
        ? error.message
        : error.message || 'Gagal menyimpan foto after',
    });
  } finally {
    connection.release();
  }
};

export const upsertItemWorkNote = async (req, res) => {
  const employeeId = req.user?.id;
  const assignmentId = Number(req.params.assignmentId);
  const itemId = Number(req.params.itemId);
  const workNoteRaw = req.body?.work_note;
  const workNote =
    workNoteRaw == null || String(workNoteRaw).trim() === ''
      ? null
      : String(workNoteRaw).trim();

  if (!assignmentId || !itemId) {
    return res.status(400).json({ message: 'ID assignment/item tidak valid' });
  }

  try {
    const row = await getAssignmentOwnedByUser(assignmentId, employeeId);
    if (!row) {
      return res.status(404).json({ message: 'Task tidak ditemukan' });
    }
    if (String(row.service_mode) === 'take_home') {
      return res.status(400).json({ message: 'Catatan per layanan hanya untuk home service' });
    }
    if (row.assignment_status !== 'On_Progress') {
      return res.status(409).json({ message: 'Catatan hanya untuk task On Progress' });
    }

    const ownedItem = await assertTransactionItemOwned(row.transaction_id, itemId);
    if (!ownedItem) {
      return res.status(400).json({ message: 'Item layanan tidak valid untuk transaksi ini' });
    }

    await cleanoxPool.query(
      `INSERT INTO tr_transaction_item_work_notes
        (transaction_id, transaction_item_id, work_note, updated_by_employee_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         work_note = VALUES(work_note),
         updated_by_employee_id = VALUES(updated_by_employee_id),
         updated_at = NOW()`,
      [row.transaction_id, itemId, workNote, employeeId]
    );

    const [items] = await cleanoxPool.query(
      `SELECT i.id, i.qty, i.unit_label, s.name AS service_name, c.name AS category_name
       FROM tr_transaction_items i
       INNER JOIN mst_services s ON s.id = i.service_id
       LEFT JOIN mst_category c ON c.id = s.category_id
       WHERE i.transaction_id = ?
       ORDER BY i.id`,
      [row.transaction_id]
    );
    const itemEvidenceContext = await buildItemEvidenceContext(cleanoxPool, row.transaction_id, items);
    const itemRow = enrichItemsWithEvidence(items, itemEvidenceContext).find(
      (item) => Number(item.id) === itemId
    );

    return res.json({
      message: 'Catatan layanan tersimpan',
      item: itemRow || null,
      evidence: mapEvidence(
        row,
        [],
        null,
        await buildSharedContextForRow(row),
        itemEvidenceContext
      ),
    });
  } catch (error) {
    console.error('[mobileTasks/upsertItemWorkNote]', error.message);
    return res.status(500).json({ message: 'Gagal menyimpan catatan layanan' });
  }
};

export const deleteAssignmentPhoto = async (req, res) => {
  const employeeId = req.user?.id;
  const assignmentId = Number(req.params.assignmentId);
  const photoId = Number(req.params.photoId);

  if (!assignmentId || !photoId) {
    return res.status(400).json({ message: 'ID assignment/foto tidak valid' });
  }

  try {
    const row = await getAssignmentOwnedByUser(assignmentId, employeeId);
    if (!row) {
      return res.status(404).json({ message: 'Task tidak ditemukan' });
    }
    if (row.assignment_status !== 'On_Progress') {
      return res.status(409).json({ message: 'Hapus foto hanya untuk task On Progress' });
    }

    const sharedPhotos = await loadSharedBeforeAfterPhotos(cleanoxPool, row.transaction_id);
    const allowedAssignmentIds = new Set(sharedPhotos.assignmentIds || []);

    const [[photo]] = await cleanoxPool.query(
      `SELECT *
       FROM tr_worker_assignment_photos
       WHERE id = ?`,
      [photoId]
    );
    if (!photo || !allowedAssignmentIds.has(Number(photo.assignment_id))) {
      return res.status(404).json({ message: 'Foto tidak ditemukan' });
    }

    const photoOwnerAssignmentId = Number(photo.assignment_id);

    await cleanoxPool.query(`DELETE FROM tr_worker_assignment_photos WHERE id = ?`, [photoId]);

    const diskPath = path.join(TASK_EVIDENCE_BASE, path.basename(photo.photo_file || ''));
    if (photo.photo_file && fs.existsSync(diskPath)) {
      try {
        fs.unlinkSync(diskPath);
      } catch {
        // ignore disk cleanup failure
      }
    }

    const [[latest]] = await cleanoxPool.query(
      `SELECT photo_file, photo_path, created_at
       FROM tr_worker_assignment_photos
       WHERE assignment_id = ? AND kind = ?
       ORDER BY sort_order DESC, id DESC
       LIMIT 1`,
      [photoOwnerAssignmentId, photo.kind]
    );

    if (photo.kind === 'before') {
      await cleanoxPool.query(
        `UPDATE tr_worker_assignments
         SET before_photo_file = ?,
             before_photo_path = ?,
             before_photo_at = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [
          latest?.photo_file || null,
          latest?.photo_path || null,
          latest?.created_at || null,
          photoOwnerAssignmentId,
        ]
      );
    } else if (photo.kind === 'after') {
      await cleanoxPool.query(
        `UPDATE tr_worker_assignments
         SET after_photo_file = ?,
             after_photo_path = ?,
             after_photo_at = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [
          latest?.photo_file || null,
          latest?.photo_path || null,
          latest?.created_at || null,
          photoOwnerAssignmentId,
        ]
      );
    }

    const refreshed = await getAssignmentOwnedByUser(assignmentId, employeeId);
    const photosMap = await listAssignmentPhotos([assignmentId]);
    const shared = await buildSharedContextForRow(refreshed || row);
    return res.json({
      message: 'Foto berhasil dihapus',
      evidence: mapEvidence(refreshed || row, photosMap.get(assignmentId) || [], null, shared),
    });
  } catch (error) {
    console.error('[mobileTasks/deleteAssignmentPhoto]', error.message);
    return res.status(500).json({ message: 'Gagal menghapus foto' });
  }
};

export const submitSurvey = async (req, res) => {
  const employeeId = req.user?.id;
  const assignmentId = Number(req.params.assignmentId);
  const layananList = normalizeLayananList(req.body?.layanan);
  const csatScore = Number(req.body?.csat_score ?? req.body?.overall ?? req.body?.rating);
  const npsScore = Number(req.body?.nps_score);
  const tagsList = normalizeTagsList(req.body?.tags);
  const feedbackText = normalizeFeedbackText(req.body?.feedback_text ?? req.body?.note);
  const csatLabel = csatLabelFromScore(csatScore);
  const npsCategory = npsCategoryFromScore(npsScore);

  if (!assignmentId) {
    return res.status(400).json({ message: 'ID assignment tidak valid' });
  }
  if (layananList.length === 0) {
    return res.status(400).json({ message: 'Pilih minimal satu layanan' });
  }
  if (!Number.isInteger(csatScore) || csatScore < 1 || csatScore > 5 || !csatLabel) {
    return res.status(400).json({ message: 'Skor CSAT wajib diisi (1–5)' });
  }
  if (!Number.isInteger(npsScore) || npsScore < 0 || npsScore > 10 || !npsCategory) {
    return res.status(400).json({ message: 'Skor NPS wajib diisi (0–10)' });
  }

  try {
    const row = await getAssignmentOwnedByUser(assignmentId, employeeId);
    if (!row) {
      return res.status(404).json({ message: 'Task tidak ditemukan' });
    }
    if (row.assignment_status !== 'On_Progress') {
      return res.status(409).json({ message: 'Survey hanya untuk task On Progress' });
    }
    const photosMap = await listAssignmentPhotos([assignmentId]);
    const takehomeProgress =
      String(row.service_mode) === 'take_home'
        ? await getTakehomeProgressByTransactionId(row.transaction_id)
        : null;
    const shared = await buildSharedContextForRow(row);
    const evidence = mapEvidence(row, photosMap.get(assignmentId) || [], takehomeProgress, shared);
    if (String(row.service_mode) === 'take_home') {
      if (!evidence.has_takehome_complete) {
        return res.status(400).json({
          message: 'Lengkapi semua stage take-home (sampai Pengantaran) sebelum mengisi survey',
        });
      }
    } else if (!evidence.all_items_complete) {
      return res.status(400).json({
        message: 'Lengkapi foto before & after untuk setiap layanan sebelum mengisi survey',
      });
    }

    const surveyAnswers = {
      source: 'app',
      layanan: joinSurveyList(layananList),
      csat_score: csatScore,
      csat_label: csatLabel,
      nps_score: npsScore,
      nps_category: npsCategory,
      feedback_tags: joinSurveyList(tagsList),
      feedback_text: feedbackText,
    };

    await cleanoxPool.query(
      `UPDATE tr_worker_assignments
       SET survey_rating = ?,
           survey_note = ?,
           survey_answers = ?,
           survey_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [csatScore, feedbackText, JSON.stringify(surveyAnswers), assignmentId]
    );

    try {
      await upsertCleanoxSatisfactionByNota({
        no_nota: row.transaction_no,
        nama: row.customer_name || null,
        csat_score: csatScore,
        csat_label: csatLabel,
        nps_score: npsScore,
        nps_category: npsCategory,
        feedback_tags: surveyAnswers.feedback_tags,
        feedback_text: feedbackText,
        layanan: surveyAnswers.layanan,
        user_agent: 'mobile-worker',
        ip_address: null,
      });
    } catch (syncErr) {
      console.error(
        '[mobileTasks/submitSurvey] CSAT sync failed (assignment survey kept):',
        syncErr.message
      );
    }

    const refreshed = await getAssignmentOwnedByUser(assignmentId, employeeId);
    const sharedAfter = await buildSharedContextForRow(refreshed || row);
    return res.json({
      message: 'Survey kepuasan tersimpan',
      survey_rating: csatScore,
      survey_answers: surveyAnswers,
      evidence: mapEvidence(
        refreshed || row,
        photosMap.get(assignmentId) || [],
        takehomeProgress,
        sharedAfter
      ),
    });
  } catch (error) {
    console.error('[mobileTasks/submitSurvey]', error.message);
    return res.status(500).json({ message: 'Gagal menyimpan survey kepuasan' });
  }
};

export const submitSurveyExternal = async (req, res) => {
  const employeeId = req.user?.id;
  const assignmentId = Number(req.params.assignmentId);

  if (!assignmentId) {
    return res.status(400).json({ message: 'ID assignment tidak valid' });
  }

  try {
    const row = await getAssignmentOwnedByUser(assignmentId, employeeId);
    if (!row) {
      return res.status(404).json({ message: 'Task tidak ditemukan' });
    }
    if (row.assignment_status !== 'On_Progress') {
      return res.status(409).json({ message: 'Survey hanya untuk task On Progress' });
    }

    const photosMap = await listAssignmentPhotos([assignmentId]);
    const takehomeProgress =
      String(row.service_mode) === 'take_home'
        ? await getTakehomeProgressByTransactionId(row.transaction_id)
        : null;
    const shared = await buildSharedContextForRow(row);
    const evidence = mapEvidence(row, photosMap.get(assignmentId) || [], takehomeProgress, shared);

    if (String(row.service_mode) === 'take_home') {
      if (!evidence.has_takehome_complete) {
        return res.status(400).json({
          message: 'Lengkapi semua stage take-home (sampai Pengantaran) sebelum menandai survey eksternal',
        });
      }
    } else if (!evidence.all_items_complete) {
      return res.status(400).json({
        message: 'Lengkapi foto before & after untuk setiap layanan sebelum menandai survey eksternal',
      });
    }

    const surveyAnswers = { source: 'external' };

    await cleanoxPool.query(
      `UPDATE tr_worker_assignments
       SET survey_rating = NULL,
           survey_note = ?,
           survey_answers = ?,
           survey_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      ['Survey eksternal', JSON.stringify(surveyAnswers), assignmentId]
    );

    const refreshed = await getAssignmentOwnedByUser(assignmentId, employeeId);
    const sharedAfter = await buildSharedContextForRow(refreshed || row);
    return res.json({
      message: 'Survey eksternal ditandai',
      evidence: mapEvidence(
        refreshed || row,
        photosMap.get(assignmentId) || [],
        takehomeProgress,
        sharedAfter
      ),
    });
  } catch (error) {
    console.error('[mobileTasks/submitSurveyExternal]', error.message);
    return res.status(500).json({ message: 'Gagal menandai survey eksternal' });
  }
};

export const completeTask = async (req, res) => {
  const employeeId = req.user?.id;
  const assignmentId = Number(req.params.assignmentId);

  if (!assignmentId) {
    return res.status(400).json({ message: 'ID assignment tidak valid' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [[row]] = await connection.query(
      `SELECT a.*, t.customer_name, t.service_mode
       FROM tr_worker_assignments a
       INNER JOIN tr_transactions t ON t.id = a.transaction_id
       WHERE a.id = ? AND a.employee_id = ?
         AND COALESCE(t.is_history_entry, 0) = 0
       FOR UPDATE`,
      [assignmentId, employeeId]
    );

    if (!row) {
      await connection.rollback();
      return res.status(404).json({ message: 'Task tidak ditemukan' });
    }
    if (row.assignment_status !== 'On_Progress') {
      await connection.rollback();
      return res.status(409).json({ message: 'Hanya task On Progress yang bisa diselesaikan' });
    }

    const photosMap = await listAssignmentPhotos([assignmentId]);
    const takehomeProgress =
      String(row.service_mode) === 'take_home'
        ? await getTakehomeProgressByTransactionId(row.transaction_id, connection)
        : null;
    const shared = await buildSharedContextForRow(row);
    const evidence = mapEvidence(row, photosMap.get(assignmentId) || [], takehomeProgress, shared);
    if (!evidence.can_complete) {
      await connection.rollback();
      const missing = [];
      if (String(row.service_mode) === 'take_home') {
        if (!evidence.has_takehome_complete) missing.push('semua stage take-home');
        if (!evidence.has_survey) missing.push('survey kepuasan');
      } else {
        if (!evidence.has_arrival) missing.push('bukti kedatangan');
        if (!evidence.all_items_complete) missing.push('foto before & after per layanan');
        if (!evidence.has_survey) missing.push('survey kepuasan');
      }
      return res.status(400).json({
        message: `Lengkapi dulu ${missing.join(', ')} sebelum menyelesaikan tugas`,
      });
    }

    await connection.query(
      `UPDATE tr_worker_assignments
       SET assignment_status = 'Done',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [assignmentId]
    );

    await createPosTracking(
      connection,
      row.transaction_id,
      'Completed',
      'Task Done',
      `${row.employee_name} menyelesaikan pengerjaan untuk ${row.customer_name}`,
      employeeId
    );

    await syncTransactionStatusFromAssignments(connection, row.transaction_id);

    await finalizeGeneralCleaningPricing(connection, row.transaction_id, {
      actorId: employeeId,
    });

    await connection.commit();
    return res.json({ message: 'Pengerjaan selesai — Done' });
  } catch (error) {
    await connection.rollback();
    console.error('[mobileTasks/completeTask]', error.message);
    return res.status(500).json({
      message: error.message || 'Gagal menyelesaikan pengerjaan',
    });
  } finally {
    connection.release();
  }
};

export const rejectTask = async (req, res) => {
  const employeeId = req.user?.id;
  const assignmentId = Number(req.params.assignmentId);
  const note = String(req.body?.note || '').trim();
  const recommendedEmployeeId = Number(req.body?.recommended_employee_id);

  if (!assignmentId) {
    return res.status(400).json({ message: 'ID assignment tidak valid' });
  }
  if (note.length < 3) {
    return res.status(400).json({ message: 'Alasan reject wajib diisi (minimal 3 karakter)' });
  }
  if (!recommendedEmployeeId) {
    return res.status(400).json({ message: 'Rekomendasi pengganti wajib dipilih' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const [[row]] = await connection.query(
      `SELECT a.*, t.customer_name, t.service_date
       FROM tr_worker_assignments a
       INNER JOIN tr_transactions t ON t.id = a.transaction_id
       WHERE a.id = ? AND a.employee_id = ?
         AND COALESCE(t.is_history_entry, 0) = 0
       FOR UPDATE`,
      [assignmentId, employeeId]
    );

    if (!row) {
      await connection.rollback();
      return res.status(404).json({ message: 'Task tidak ditemukan' });
    }
    if (row.assignment_status !== 'Assigned') {
      await connection.rollback();
      return res.status(409).json({ message: 'Task sudah direspons sebelumnya' });
    }

    if (recommendedEmployeeId === Number(employeeId)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Tidak bisa merekomendasikan diri sendiri' });
    }

    const [txAssignments] = await connection.query(
      `SELECT employee_id FROM tr_worker_assignments WHERE transaction_id = ?`,
      [row.transaction_id]
    );
    const onThisTx = new Set(txAssignments.map((item) => Number(item.employee_id)));
    if (onThisTx.has(recommendedEmployeeId)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Kandidat sudah terkait transaksi ini' });
    }

    const serviceDateKey = formatServiceDateKey(row.service_date);
    const busyIds = await getBusyEmployeeIdsOnDate(connection, row.service_date);
    if (busyIds.has(recommendedEmployeeId)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Kandidat sudah memiliki pekerjaan di tanggal layanan ini' });
    }

    const [[candidate]] = await aloraPool.query(
      `SELECT employee_id, full_name
       FROM mst_employee
       WHERE employee_id = ?
         AND company_id = 3
         AND exit_date IS NULL`,
      [recommendedEmployeeId]
    );

    if (!candidate) {
      await connection.rollback();
      return res.status(400).json({ message: 'Kandidat pengganti tidak valid' });
    }

    await connection.query(
      `UPDATE tr_worker_assignments
       SET assignment_status = 'Rejected',
           assignment_note = ?,
           recommended_employee_id = ?,
           recommended_employee_name = ?,
           responded_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [note, candidate.employee_id, candidate.full_name, assignmentId]
    );

    await createPosTracking(
      connection,
      row.transaction_id,
      'Assigned',
      'Worker menolak tugas',
      `${row.employee_name} menolak tugas. Alasan: ${note}. Rekomendasi: ${candidate.full_name}`,
      employeeId
    );

    await connection.commit();
    return res.json({ message: 'Tugas ditolak dan dikembalikan ke admin untuk plotting' });
  } catch (error) {
    await connection.rollback();
    console.error('[mobileTasks/rejectTask]', error.message);
    return res.status(500).json({ message: 'Gagal menolak tugas' });
  } finally {
    connection.release();
  }
};

export const listScheduleNotices = async (req, res) => {
  const employeeId = req.user?.id;
  const todayKey = todayDateStringJakarta();

  try {
    const [rows] = await cleanoxPool.query(
      `SELECT
        e.id,
        e.transaction_id,
        e.assignment_id,
        e.event_type,
        e.old_service_date,
        e.new_service_date,
        e.message,
        e.created_at,
        t.transaction_no,
        t.customer_name
       FROM tr_worker_task_events e
       INNER JOIN tr_transactions t ON t.id = e.transaction_id
       WHERE e.employee_id = ?
         AND e.dismissed_at IS NULL
         AND (
           (e.event_type = 'reschedule' AND (
             DATE(e.new_service_date) >= ?
             OR e.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
           ))
           OR (e.event_type = 'cancel' AND e.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))
         )
       ORDER BY e.created_at DESC
       LIMIT 20`,
      [employeeId, todayKey]
    );

    const notices = rows.map((row) => ({
      id: row.id,
      event_type: row.event_type,
      title: row.event_type === 'cancel' ? 'Task dibatalkan' : 'Jadwal dipindah',
      description: row.message || `${row.transaction_no || ''} • ${row.customer_name || ''}`.trim(),
      old_service_date: row.old_service_date,
      new_service_date: row.new_service_date,
      created_at: row.created_at,
      transaction_id: row.transaction_id,
      assignment_id: row.assignment_id,
      transaction_no: row.transaction_no,
      customer_name: row.customer_name,
      to: row.event_type === 'cancel' ? '/mobile-worker/riwayat' : '/mobile-worker/tasks',
    }));

    return res.json({ notices });
  } catch (error) {
    console.error('[mobileTasks/listScheduleNotices]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil notifikasi jadwal' });
  }
};

export const dismissScheduleNotice = async (req, res) => {
  const employeeId = req.user?.id;
  const noticeId = Number(req.params.noticeId);

  if (!noticeId) {
    return res.status(400).json({ message: 'ID notifikasi tidak valid' });
  }

  try {
    const [result] = await cleanoxPool.query(
      `UPDATE tr_worker_task_events
       SET dismissed_at = NOW()
       WHERE id = ? AND employee_id = ? AND dismissed_at IS NULL`,
      [noticeId, employeeId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Notifikasi tidak ditemukan atau sudah ditutup' });
    }

    return res.json({ message: 'Notifikasi ditutup' });
  } catch (error) {
    console.error('[mobileTasks/dismissScheduleNotice]', error.message);
    return res.status(500).json({ message: 'Gagal menutup notifikasi' });
  }
};

const CALENDAR_STATUSES = ['Assigned', 'In_Schedule', 'On_Progress', 'Done'];

export const getMyCalendar = async (req, res) => {
  const employeeId = Number(req.user?.id);
  const month = String(req.query.month || '').trim();

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ message: 'Parameter month wajib (YYYY-MM)' });
  }

  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  if (!year || monthNum < 1 || monthNum > 12) {
    return res.status(400).json({ message: 'Parameter month tidak valid' });
  }

  const dateStart = `${month}-01`;
  const lastDay = new Date(year, monthNum, 0).getDate();
  const dateEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

  try {
    const [companyWorkers] = await aloraPool.query(
      `SELECT employee_id
       FROM mst_employee
       WHERE company_id = 3
         AND exit_date IS NULL`
    );
    const employeeIds = companyWorkers
      .map((row) => Number(row.employee_id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (employeeIds.length === 0) {
      return res.json({
        month,
        date_start: dateStart,
        date_end: dateEnd,
        days: {},
        jobs: [],
      });
    }

    const [rows] = await cleanoxPool.query(
      `SELECT
        a.id AS assignment_id,
        a.employee_id,
        a.employee_name,
        a.assignment_status,
        a.transaction_id,
        t.transaction_no,
        t.customer_name,
        t.customer_address,
        t.service_date,
        t.status AS transaction_status
       FROM tr_worker_assignments a
       INNER JOIN tr_transactions t ON t.id = a.transaction_id
       WHERE a.employee_id IN (${employeeIds.map(() => '?').join(',')})
         AND a.assignment_status IN (?)
         AND DATE(t.service_date) BETWEEN ? AND ?
       ORDER BY t.service_date ASC, t.id ASC, a.id ASC`,
      [...employeeIds, CALENDAR_STATUSES, dateStart, dateEnd]
    );

    const jobsMap = new Map();

    for (const row of rows) {
      const txId = Number(row.transaction_id);
      if (!jobsMap.has(txId)) {
        jobsMap.set(txId, {
          transaction_id: txId,
          transaction_no: row.transaction_no,
          customer_name: row.customer_name,
          customer_address: row.customer_address || null,
          service_date: row.service_date,
          service_date_key: formatServiceDateKey(row.service_date),
          transaction_status: row.transaction_status,
          workers: [],
          is_mine: false,
          my_assignment_id: null,
          my_assignment_status: null,
        });
      }

      const job = jobsMap.get(txId);
      const workerEmployeeId = Number(row.employee_id);
      const already = job.workers.some((w) => Number(w.employee_id) === workerEmployeeId);
      if (!already) {
        job.workers.push({
          employee_id: workerEmployeeId,
          employee_name: row.employee_name || `Pekerja #${workerEmployeeId}`,
          assignment_id: Number(row.assignment_id),
          assignment_status: row.assignment_status,
        });
      }

      if (Number.isFinite(employeeId) && workerEmployeeId === employeeId) {
        job.is_mine = true;
        job.my_assignment_id = Number(row.assignment_id);
        job.my_assignment_status = row.assignment_status;
      }
    }

    const jobs = [...jobsMap.values()];
    const days = {};
    for (const job of jobs) {
      const serviceDateKey = job.service_date_key;
      if (!serviceDateKey) continue;
      if (!days[serviceDateKey]) days[serviceDateKey] = { jobs: [] };
      days[serviceDateKey].jobs.push(job);
    }

    return res.json({
      month,
      date_start: dateStart,
      date_end: dateEnd,
      days,
      jobs,
    });
  } catch (error) {
    console.error('[mobileTasks/getMyCalendar]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil kalender jadwal' });
  }
};

export { BUSY_STATUSES } from '../../shared/utils/posWorkerBusy.js';
