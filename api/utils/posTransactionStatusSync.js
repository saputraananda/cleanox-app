const INACTIVE_ASSIGNMENT_STATUSES = ['Cancelled', 'Rejected', 'Replaced'];

/**
 * Sync tr_transactions.status from active assignment statuses.
 * Priority:
 *   no active → Draft (unless Cancelled / Completed)
 *   all Done → Completed
 *   any On_Progress → In_Progress
 *   any In_Schedule or partial Done → Scheduled
 *   any Assigned → Assigned
 * Skips overwrite of Cancelled; does not downgrade Completed.
 */
export async function syncTransactionStatusFromAssignments(connection, transactionId) {
  if (!transactionId) return;

  const [[tx]] = await connection.query(
    `SELECT id, status FROM tr_transactions WHERE id = ? FOR UPDATE`,
    [transactionId]
  );
  if (!tx) return;
  if (tx.status === 'Cancelled' || tx.status === 'Completed') return;

  const [assignments] = await connection.query(
    `SELECT assignment_status
     FROM tr_worker_assignments
     WHERE transaction_id = ?
       AND assignment_status NOT IN (?, ?, ?)`,
    [transactionId, ...INACTIVE_ASSIGNMENT_STATUSES]
  );

  let nextStatus = 'Draft';

  if (assignments.length > 0) {
    const statuses = assignments.map((row) => row.assignment_status);
    const allDone = statuses.every((s) => s === 'Done');
    const hasOnProgress = statuses.some((s) => s === 'On_Progress');
    const hasInSchedule = statuses.some((s) => s === 'In_Schedule');
    const hasDone = statuses.some((s) => s === 'Done');
    const hasAssigned = statuses.some((s) => s === 'Assigned');

    if (allDone) nextStatus = 'Completed';
    else if (hasOnProgress) nextStatus = 'In_Progress';
    else if (hasInSchedule || hasDone) nextStatus = 'Scheduled';
    else if (hasAssigned) nextStatus = 'Assigned';
  }

  if (!nextStatus || nextStatus === tx.status) return;

  await connection.query(
    `UPDATE tr_transactions
     SET status = ?, updated_at = NOW()
     WHERE id = ?`,
    [nextStatus, transactionId]
  );
}
