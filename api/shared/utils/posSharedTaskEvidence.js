function parseSurveyAnswers(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export const MAX_PHOTOS_PER_KIND_PER_ITEM = 50;

function mapPhotoRow(photo) {
  return {
    id: photo.id,
    assignment_id: Number(photo.assignment_id),
    transaction_item_id:
      photo.transaction_item_id == null ? null : Number(photo.transaction_item_id),
    photo_file: photo.photo_file,
    photo_path: photo.photo_path,
    created_at: photo.created_at,
  };
}

function emptyItemBucket() {
  return { before: [], after: [] };
}

export function evaluateItemEvidenceCompletion(items = [], byItem = new Map()) {
  const normalizedItems = (items || []).map((item) => ({
    transaction_item_id: Number(item.id ?? item.transaction_item_id),
  }));
  const itemResults = normalizedItems.map(({ transaction_item_id }) => {
    const bucket = byItem.get(transaction_item_id) || emptyItemBucket();
    const beforeCount = bucket.before.length;
    const afterCount = bucket.after.length;
    return {
      transaction_item_id,
      has_before: beforeCount >= 1,
      has_after: afterCount >= 1,
      before_count: beforeCount,
      after_count: afterCount,
    };
  });

  const totalItems = itemResults.length;
  const completedItems = itemResults.filter((item) => item.has_before && item.has_after).length;
  const allItemsComplete =
    totalItems === 0 ? false : itemResults.every((item) => item.has_before && item.has_after);

  return {
    items: itemResults,
    total_items: totalItems,
    completed_items: completedItems,
    all_items_complete: allItemsComplete,
  };
}

export function resolveSurveyState({ survey_rating, survey_answers, survey_note, survey_at, assignment_id } = {}) {
  const answers = parseSurveyAnswers(survey_answers);
  const sourceRaw = answers?.source == null ? null : String(answers.source).trim().toLowerCase();
  const isExternal = sourceRaw === 'external';
  const csatFromAnswers = Number(answers?.csat_score ?? answers?.overall);
  const hasAppSurvey =
    (Number.isInteger(csatFromAnswers) && csatFromAnswers >= 1 && csatFromAnswers <= 5) ||
    (survey_rating != null && Number(survey_rating) >= 1 && Number(survey_rating) <= 5);
  const hasSurvey = isExternal || hasAppSurvey;
  const source = isExternal ? 'external' : hasAppSurvey ? 'app' : null;

  return {
    hasSurvey,
    source,
    rating: survey_rating != null ? Number(survey_rating) : null,
    answers,
    note: survey_note || null,
    at: survey_at || null,
    fromAssignmentId: assignment_id == null ? null : Number(assignment_id),
  };
}

/**
 * Load all assignment ids for a transaction.
 */
export async function loadTransactionAssignmentIds(connection, transactionId) {
  const [rows] = await connection.query(
    `SELECT id FROM tr_worker_assignments WHERE transaction_id = ?`,
    [transactionId]
  );
  return rows.map((row) => Number(row.id)).filter(Boolean);
}

/**
 * Group before/after photos by transaction item (null item = legacy general).
 */
export async function loadSharedPhotosGrouped(connection, transactionId) {
  const assignmentIds = await loadTransactionAssignmentIds(connection, transactionId);
  if (assignmentIds.length === 0) {
    return { assignmentIds, general: emptyItemBucket(), byItem: new Map() };
  }

  const [rows] = await connection.query(
    `SELECT id, assignment_id, transaction_item_id, kind, photo_file, photo_path, sort_order, created_at
     FROM tr_worker_assignment_photos
     WHERE assignment_id IN (?)
     ORDER BY sort_order ASC, id ASC`,
    [assignmentIds]
  );

  const general = emptyItemBucket();
  const byItem = new Map();

  for (const photo of rows) {
    const item = mapPhotoRow(photo);
    const itemId = photo.transaction_item_id == null ? null : Number(photo.transaction_item_id);
    if (itemId == null) {
      if (photo.kind === 'before') general.before.push(item);
      if (photo.kind === 'after') general.after.push(item);
      continue;
    }
    if (!byItem.has(itemId)) byItem.set(itemId, emptyItemBucket());
    const bucket = byItem.get(itemId);
    if (photo.kind === 'before') bucket.before.push(item);
    if (photo.kind === 'after') bucket.after.push(item);
  }

  return { assignmentIds, general, byItem };
}

/**
 * Load work notes keyed by transaction_item_id.
 */
export async function loadItemWorkNotesByTransactionId(connection, transactionId) {
  const [rows] = await connection.query(
    `SELECT transaction_item_id, work_note, updated_by_employee_id, updated_at
     FROM tr_transaction_item_work_notes
     WHERE transaction_id = ?`,
    [transactionId]
  );
  const map = new Map();
  for (const row of rows) {
    map.set(Number(row.transaction_item_id), {
      work_note: row.work_note || null,
      updated_by_employee_id:
        row.updated_by_employee_id == null ? null : Number(row.updated_by_employee_id),
      updated_at: row.updated_at || null,
    });
  }
  return map;
}

/**
 * Batch load transaction items for many transaction ids.
 * @returns Map<transactionId, item[]>
 */
export async function loadTransactionItemsByTransactionIds(connection, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).map(Number).filter(Boolean))];
  const map = new Map();
  if (ids.length === 0) return map;

  const [rows] = await connection.query(
    `SELECT i.id, i.transaction_id, i.qty, i.unit_label, s.name AS service_name, c.name AS category_name
     FROM tr_transaction_items i
     INNER JOIN mst_services s ON s.id = i.service_id
     LEFT JOIN mst_category c ON c.id = s.category_id
     WHERE i.transaction_id IN (?)
     ORDER BY i.transaction_id ASC, i.id ASC`,
    [ids]
  );

  for (const row of rows) {
    const txId = Number(row.transaction_id);
    if (!map.has(txId)) map.set(txId, []);
    map.get(txId).push(row);
  }
  return map;
}

/**
 * Union before/after photos across all assignments of a transaction.
 */
export async function loadSharedBeforeAfterPhotos(connection, transactionId) {
  const grouped = await loadSharedPhotosGrouped(connection, transactionId);
  const before = [...grouped.general.before];
  const after = [...grouped.general.after];
  for (const bucket of grouped.byItem.values()) {
    before.push(...bucket.before);
    after.push(...bucket.after);
  }
  return { before, after, assignmentIds: grouped.assignmentIds };
}

/**
 * Canonical survey for a transaction = latest survey_at among assignments.
 */
export async function loadSharedSurvey(connection, transactionId) {
  const [rows] = await connection.query(
    `SELECT id AS assignment_id, survey_rating, survey_note, survey_answers, survey_at
     FROM tr_worker_assignments
     WHERE transaction_id = ?
       AND survey_at IS NOT NULL
     ORDER BY survey_at DESC, id DESC
     LIMIT 1`,
    [transactionId]
  );

  if (!rows.length) {
    return {
      hasSurvey: false,
      source: null,
      rating: null,
      answers: null,
      note: null,
      at: null,
      fromAssignmentId: null,
    };
  }

  return resolveSurveyState(rows[0]);
}

/**
 * Batch shared evidence for many transaction ids.
 * @returns Map<transactionId, { before, after, survey, grouped, items, itemCompletion }>
 */
export async function loadSharedEvidenceByTransactionIds(connection, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).map(Number).filter(Boolean))];
  const map = new Map();
  if (ids.length === 0) return map;

  for (const id of ids) {
    map.set(id, {
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
      grouped: { general: emptyItemBucket(), byItem: new Map() },
      items: [],
      itemCompletion: evaluateItemEvidenceCompletion([], new Map()),
    });
  }

  const itemsByTx = await loadTransactionItemsByTransactionIds(connection, ids);

  const [assignmentRows] = await connection.query(
    `SELECT id, transaction_id, survey_rating, survey_note, survey_answers, survey_at
     FROM tr_worker_assignments
     WHERE transaction_id IN (?)`,
    [ids]
  );

  const assignmentToTx = new Map();
  const surveyCandidates = new Map();

  for (const row of assignmentRows) {
    const txId = Number(row.transaction_id);
    const assignmentId = Number(row.id);
    assignmentToTx.set(assignmentId, txId);

    if (!row.survey_at) continue;
    const prev = surveyCandidates.get(txId);
    const prevAt = prev?.survey_at ? new Date(prev.survey_at).getTime() : 0;
    const nextAt = new Date(row.survey_at).getTime();
    if (!prev || nextAt > prevAt || (nextAt === prevAt && assignmentId > Number(prev.id))) {
      surveyCandidates.set(txId, row);
    }
  }

  for (const [txId, row] of surveyCandidates.entries()) {
    const entry = map.get(txId);
    if (!entry) continue;
    entry.survey = resolveSurveyState({
      ...row,
      assignment_id: row.id,
    });
  }

  const assignmentIds = [...assignmentToTx.keys()];
  if (assignmentIds.length > 0) {
    const [photoRows] = await connection.query(
      `SELECT id, assignment_id, transaction_item_id, kind, photo_file, photo_path, sort_order, created_at
       FROM tr_worker_assignment_photos
       WHERE assignment_id IN (?)
       ORDER BY sort_order ASC, id ASC`,
      [assignmentIds]
    );

    for (const photo of photoRows) {
      const txId = assignmentToTx.get(Number(photo.assignment_id));
      const entry = map.get(txId);
      if (!entry) continue;
      const item = mapPhotoRow(photo);
      const itemId = photo.transaction_item_id == null ? null : Number(photo.transaction_item_id);
      if (itemId == null) {
        if (photo.kind === 'before') entry.grouped.general.before.push(item);
        if (photo.kind === 'after') entry.grouped.general.after.push(item);
      } else {
        if (!entry.grouped.byItem.has(itemId)) entry.grouped.byItem.set(itemId, emptyItemBucket());
        const bucket = entry.grouped.byItem.get(itemId);
        if (photo.kind === 'before') bucket.before.push(item);
        if (photo.kind === 'after') bucket.after.push(item);
      }
      if (photo.kind === 'before') entry.before.push(item);
      if (photo.kind === 'after') entry.after.push(item);
    }
  }

  for (const txId of ids) {
    const entry = map.get(txId);
    if (!entry) continue;
    entry.items = itemsByTx.get(txId) || [];
    entry.itemCompletion = evaluateItemEvidenceCompletion(entry.items, entry.grouped.byItem);
  }

  return map;
}
