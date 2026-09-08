const INACTIVE_ASSIGNMENT_STATUSES = ['Cancelled', 'Rejected', 'Replaced'];

/**
 * Sync tr_transactions.status from active assignment statuses.
 * Priority:
 *   no active → Scheduled (unless Cancelled)
 *   any Done → Completed (payment ignored; leftover Assigned/In_Schedule/On_Progress ignored)
 *   any On_Progress → In_Progress
 *   else → Scheduled
 * Skips overwrite of Cancelled. Completed may be recalculated.
 */
export async function syncTransactionStatusFromAssignments(connection, transactionId) {
  if (!transactionId) return;

  const [[tx]] = await connection.query(
    `SELECT id, status, payment_status FROM tr_transactions WHERE id = ? FOR UPDATE`,
    [transactionId]
  );
  if (!tx) return;
  if (tx.status === 'Cancelled') return;

  const [assignments] = await connection.query(
    `SELECT assignment_status
     FROM tr_worker_assignments
     WHERE transaction_id = ?
       AND assignment_status NOT IN (?, ?, ?)`,
    [transactionId, ...INACTIVE_ASSIGNMENT_STATUSES]
  );

  let nextStatus = 'Scheduled';

  if (assignments.length > 0) {
    const statuses = assignments.map((row) => row.assignment_status);
    const hasDone = statuses.some((s) => s === 'Done');
    const hasOnProgress = statuses.some((s) => s === 'On_Progress');

    if (hasDone) nextStatus = 'Completed';
    else if (hasOnProgress) nextStatus = 'In_Progress';
    else nextStatus = 'Scheduled';
  }

  if (!nextStatus || nextStatus === tx.status) return;

  await connection.query(
    `UPDATE tr_transactions
     SET status = ?, updated_at = NOW()
     WHERE id = ?`,
    [nextStatus, transactionId]
  );
}
