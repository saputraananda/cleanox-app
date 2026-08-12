export async function createPosTracking(connection, transactionId, status, title, description, createdBy) {
  await connection.query(
    `INSERT INTO tr_tracking
      (transaction_id, status, title, description, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [transactionId, status, title, description || null, createdBy || null]
  );
}
