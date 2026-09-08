const INACTIVE_ASSIGNMENT_STATUSES = ['Cancelled', 'Rejected', 'Replaced'];

/**
 * Cascade accepted peers (In_Schedule) to On_Progress when one worker starts.
 * Does not touch Assigned (not yet accepted) or inactive statuses.
 */
export async function cascadePeersToOnProgress(connection, transactionId, exceptAssignmentId) {
  if (!transactionId) return;
  const exceptId = Number(exceptAssignmentId) || 0;

  await connection.query(
    `UPDATE tr_worker_assignments
     SET assignment_status = 'On_Progress',
         started_at = COALESCE(started_at, NOW()),
         updated_at = NOW()
     WHERE transaction_id = ?
       AND id <> ?
       AND assignment_status = 'In_Schedule'
       AND assignment_status NOT IN (?, ?, ?)`,
    [transactionId, exceptId, ...INACTIVE_ASSIGNMENT_STATUSES]
  );
}

/**
 * Cascade active peers (In_Schedule / On_Progress) to Done when one worker completes.
 * Does not touch Assigned (not yet accepted) or inactive statuses.
 */
export async function cascadePeersToDone(connection, transactionId, exceptAssignmentId) {
  if (!transactionId) return;
  const exceptId = Number(exceptAssignmentId) || 0;

  await connection.query(
    `UPDATE tr_worker_assignments
     SET assignment_status = 'Done',
         completed_at = COALESCE(completed_at, NOW()),
         updated_at = NOW()
     WHERE transaction_id = ?
       AND id <> ?
       AND assignment_status IN ('In_Schedule', 'On_Progress')
       AND assignment_status NOT IN (?, ?, ?)`,
    [transactionId, exceptId, ...INACTIVE_ASSIGNMENT_STATUSES]
  );
}

/**
 * Backfill-only: if TX has any Done → cascade peers; else if any On_Progress → cascade In_Schedule.
 */
export async function cascadeSharedProgressForTransaction(connection, transactionId) {
  if (!transactionId) return;

  const [rows] = await connection.query(
    `SELECT id, assignment_status
     FROM tr_worker_assignments
     WHERE transaction_id = ?
       AND assignment_status NOT IN (?, ?, ?)`,
    [transactionId, ...INACTIVE_ASSIGNMENT_STATUSES]
  );

  if (!rows.length) return;

  const hasDone = rows.some((r) => r.assignment_status === 'Done');
  const hasOnProgress = rows.some((r) => r.assignment_status === 'On_Progress');
  const doneId = rows.find((r) => r.assignment_status === 'Done')?.id;
  const progressId = rows.find((r) => r.assignment_status === 'On_Progress')?.id;

  if (hasDone && doneId != null) {
    await cascadePeersToDone(connection, transactionId, doneId);
  } else if (hasOnProgress && progressId != null) {
    await cascadePeersToOnProgress(connection, transactionId, progressId);
  }
}
