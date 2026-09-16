/**
 * Take-home shared pool helpers: status derivation + lazy participation.
 * Visibility is transaction-centric; mutations upsert a per-user assignment row.
 */

import {
  isAllTakehomeStagesComplete,
  isStageFilled,
  TAKEHOME_STAGE_ORDER,
} from './posTakehomeStages.js';

export function isTakeHomeServiceMode(value) {
  return String(value || '').trim() === 'take_home';
}

export function hasAnyTakehomeStageFilled(progress) {
  if (!progress) return false;
  return TAKEHOME_STAGE_ORDER.some((stage) => isStageFilled(progress, stage));
}

/**
 * True when someone has already started the shared take-home job.
 */
export function hasTakehomeStarted({ transaction, assignments = [], progress = null } = {}) {
  const txStatus = String(transaction?.status || transaction?.transaction_status || '');
  if (txStatus === 'In_Progress' || txStatus === 'Completed') return true;

  const list = Array.isArray(assignments) ? assignments : [];
  if (list.some((a) => ['On_Progress', 'Done'].includes(String(a.assignment_status)))) {
    return true;
  }

  return hasAnyTakehomeStageFilled(progress);
}

/**
 * Mobile-facing status for take-home (never expose Assigned).
 * @returns {'In_Schedule'|'On_Progress'|'Done'|'Cancelled'}
 */
export function deriveTakehomeMobileStatus({
  transaction,
  assignments = [],
  progress = null,
  hasSurvey = false,
} = {}) {
  const txStatus = String(transaction?.status || transaction?.transaction_status || '');
  if (txStatus === 'Cancelled') return 'Cancelled';

  const list = Array.isArray(assignments) ? assignments : [];
  const hasDone = list.some((a) => String(a.assignment_status) === 'Done');
  const hasOnProgress = list.some((a) => String(a.assignment_status) === 'On_Progress');

  if (txStatus === 'Completed' || hasDone) return 'Done';

  const stagesComplete = isAllTakehomeStagesComplete(progress);
  if (hasOnProgress || txStatus === 'In_Progress' || hasAnyTakehomeStageFilled(progress)) {
    // Stay On_Progress until someone completes (even if stages+survey already filled).
    if (stagesComplete && hasSurvey && hasDone) return 'Done';
    return 'On_Progress';
  }

  return 'In_Schedule';
}

/**
 * Upsert assignment row for the current worker on a take-home transaction.
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{ transactionId: number, employeeId: number, employeeName: string, preferStatus?: 'In_Schedule'|'On_Progress' }} opts
 */
export async function ensureTakehomeParticipation(
  connection,
  { transactionId, employeeId, employeeName, preferStatus = 'In_Schedule' } = {}
) {
  const txId = Number(transactionId);
  const empId = Number(employeeId);
  const name = String(employeeName || `Pekerja #${empId}`).trim() || `Pekerja #${empId}`;
  const status = preferStatus === 'On_Progress' ? 'On_Progress' : 'In_Schedule';

  if (!txId || !empId) {
    throw new Error('transactionId dan employeeId wajib untuk take-home participation');
  }

  const [[existing]] = await connection.query(
    `SELECT * FROM tr_worker_assignments
     WHERE transaction_id = ? AND employee_id = ?
     LIMIT 1
     FOR UPDATE`,
    [txId, empId]
  );

  if (existing) {
    const current = String(existing.assignment_status);
    // Do not revive Cancelled / Rejected / Replaced / Done downward incorrectly.
    if (['Cancelled', 'Rejected', 'Replaced'].includes(current)) {
      return existing;
    }
    if (current === 'Done') return existing;

    if (status === 'On_Progress' && current !== 'On_Progress') {
      await connection.query(
        `UPDATE tr_worker_assignments
         SET assignment_status = 'On_Progress',
             started_at = COALESCE(started_at, NOW()),
             responded_at = COALESCE(responded_at, NOW()),
             employee_name = COALESCE(NULLIF(employee_name, ''), ?),
             updated_at = NOW()
         WHERE id = ?`,
        [name, existing.id]
      );
      const [[refreshed]] = await connection.query(
        `SELECT * FROM tr_worker_assignments WHERE id = ?`,
        [existing.id]
      );
      return refreshed || existing;
    }

    if (current === 'Assigned') {
      // Legacy take-home Assigned → treat as In_Schedule (or On_Progress if prefer).
      await connection.query(
        `UPDATE tr_worker_assignments
         SET assignment_status = ?,
             responded_at = COALESCE(responded_at, NOW()),
             started_at = CASE WHEN ? = 'On_Progress' THEN COALESCE(started_at, NOW()) ELSE started_at END,
             employee_name = COALESCE(NULLIF(employee_name, ''), ?),
             updated_at = NOW()
         WHERE id = ?`,
        [status, status, name, existing.id]
      );
      const [[refreshed]] = await connection.query(
        `SELECT * FROM tr_worker_assignments WHERE id = ?`,
        [existing.id]
      );
      return refreshed || existing;
    }

    return existing;
  }

  const [insertResult] = await connection.query(
    `INSERT INTO tr_worker_assignments
      (transaction_id, employee_id, employee_name, assignment_status, assigned_at, responded_at, started_at)
     VALUES (?, ?, ?, ?, NOW(), NOW(), ?)`,
    [txId, empId, name, status, status === 'On_Progress' ? new Date() : null]
  );

  const [[created]] = await connection.query(
    `SELECT * FROM tr_worker_assignments WHERE id = ?`,
    [insertResult.insertId]
  );
  return created;
}
