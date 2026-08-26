function parseSurveyAnswers(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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
 * Union before/after photos across all assignments of a transaction.
 */
export async function loadSharedBeforeAfterPhotos(connection, transactionId) {
  const assignmentIds = await loadTransactionAssignmentIds(connection, transactionId);
  if (assignmentIds.length === 0) {
    return { before: [], after: [], assignmentIds };
  }

  const [rows] = await connection.query(
    `SELECT id, assignment_id, kind, photo_file, photo_path, sort_order, created_at
     FROM tr_worker_assignment_photos
     WHERE assignment_id IN (?)
     ORDER BY sort_order ASC, id ASC`,
    [assignmentIds]
  );

  const before = [];
  const after = [];
  for (const photo of rows) {
    const item = {
      id: photo.id,
      assignment_id: Number(photo.assignment_id),
      photo_file: photo.photo_file,
      photo_path: photo.photo_path,
      created_at: photo.created_at,
    };
    if (photo.kind === 'before') before.push(item);
    if (photo.kind === 'after') after.push(item);
  }

  return { before, after, assignmentIds };
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
 * @returns Map<transactionId, { before, after, survey }>
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
    });
  }

  const [assignmentRows] = await connection.query(
    `SELECT id, transaction_id, survey_rating, survey_note, survey_answers, survey_at
     FROM tr_worker_assignments
     WHERE transaction_id IN (?)`,
    [ids]
  );

  const assignmentToTx = new Map();
  const surveyCandidates = new Map(); // txId -> best row

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
  if (assignmentIds.length === 0) return map;

  const [photoRows] = await connection.query(
    `SELECT id, assignment_id, kind, photo_file, photo_path, sort_order, created_at
     FROM tr_worker_assignment_photos
     WHERE assignment_id IN (?)
     ORDER BY sort_order ASC, id ASC`,
    [assignmentIds]
  );

  for (const photo of photoRows) {
    const txId = assignmentToTx.get(Number(photo.assignment_id));
    const entry = map.get(txId);
    if (!entry) continue;
    const item = {
      id: photo.id,
      assignment_id: Number(photo.assignment_id),
      photo_file: photo.photo_file,
      photo_path: photo.photo_path,
      created_at: photo.created_at,
    };
    if (photo.kind === 'before') entry.before.push(item);
    if (photo.kind === 'after') entry.after.push(item);
  }

  return map;
}
