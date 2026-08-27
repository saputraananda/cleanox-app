import { aloraPool } from '../db/cleanox.js';

const TABLE = 'tr_customer_satisfaction_cleanox';

/**
 * Upsert one CSAT Cleanox row keyed by no_nota (transaction_no).
 * Replace semantics: keep a single row per nota (last write wins).
 */
export async function upsertCleanoxSatisfactionByNota({
  no_nota,
  nama = null,
  csat_score,
  csat_label,
  nps_score,
  nps_category,
  feedback_tags = null,
  feedback_text = null,
  layanan = null,
  user_agent = null,
  ip_address = null,
} = {}) {
  const nota = String(no_nota || '').trim();
  if (!nota) {
    return { skipped: true };
  }

  const [existing] = await aloraPool.query(
    `SELECT id FROM ${TABLE} WHERE TRIM(no_nota) = ? ORDER BY id ASC`,
    [nota]
  );

  const keepId = existing.length > 0 ? Number(existing[0].id) : null;
  const extraIds = existing.slice(1).map((row) => Number(row.id)).filter(Boolean);

  if (keepId) {
    await aloraPool.query(
      `UPDATE ${TABLE}
       SET no_nota = ?,
           nama = ?,
           csat_score = ?,
           csat_label = ?,
           nps_score = ?,
           nps_category = ?,
           feedback_tags = ?,
           feedback_text = ?,
           layanan = ?,
           ip_address = ?,
           user_agent = ?
       WHERE id = ?`,
      [
        nota,
        nama || null,
        Number(csat_score),
        csat_label,
        Number(nps_score),
        nps_category,
        feedback_tags || null,
        feedback_text || null,
        layanan || null,
        ip_address || null,
        user_agent || null,
        keepId,
      ]
    );

    if (extraIds.length > 0) {
      await aloraPool.query(`DELETE FROM ${TABLE} WHERE id IN (?)`, [extraIds]);
    }

    return { ok: true, id: keepId, action: 'updated' };
  }

  const [result] = await aloraPool.query(
    `INSERT INTO ${TABLE}
       (no_nota, nama, csat_score, csat_label, nps_score, nps_category,
        feedback_tags, feedback_text, layanan, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nota,
      nama || null,
      Number(csat_score),
      csat_label,
      Number(nps_score),
      nps_category,
      feedback_tags || null,
      feedback_text || null,
      layanan || null,
      ip_address || null,
      user_agent || null,
    ]
  );

  return { ok: true, id: result.insertId, action: 'inserted' };
}
