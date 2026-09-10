import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import sharp from 'sharp';
import cleanoxPool from '../../shared/db/cleanox.js';
import {
  formatAgendaTime,
  resolveAgendaCompletion,
  toDateKey,
} from '../../shared/utils/agendaHelpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_BASE = process.env.UPLOAD_BASE_DIR
  ? path.resolve(process.env.UPLOAD_BASE_DIR)
  : path.resolve(__dirname, '../../../src/assets');
const EVIDENCE_BASE = path.join(STORAGE_BASE, 'agenda-evidence-photos');
const ARRIVAL_BASE = path.join(STORAGE_BASE, 'agenda-arrival-photos');

if (!fs.existsSync(EVIDENCE_BASE)) fs.mkdirSync(EVIDENCE_BASE, { recursive: true });
if (!fs.existsSync(ARRIVAL_BASE)) fs.mkdirSync(ARRIVAL_BASE, { recursive: true });

export const agendaEvidenceUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('File evidence harus berupa gambar'));
  },
}).single('photo');

async function compressToJpg(buffer) {
  return sharp(buffer).rotate().jpeg({ quality: 82 }).toBuffer();
}

function toEvidencePath(fileName) {
  return `/mobile-agenda/evidence/${path.basename(String(fileName))}`;
}

function toArrivalPath(fileName) {
  return `/mobile-agenda/arrival/${path.basename(String(fileName))}`;
}

async function getOwnedAgendaWorker(agendaId, employeeId) {
  const [[row]] = await cleanoxPool.query(
    `SELECT
       w.*,
       a.name AS agenda_name,
       a.location,
       a.start_date,
       a.end_date,
       a.agenda_time,
       a.day_label,
       a.content_type,
       a.description,
       a.notes,
       a.status AS agenda_status,
       a.agenda_kind,
       a.other_type,
       a.other_type_label
     FROM tr_agenda_workers w
     INNER JOIN tr_agendas a ON a.id = w.agenda_id
     WHERE w.agenda_id = ?
       AND w.employee_id = ?
       AND a.status IN ('scheduled', 'completed')
       AND a.content_type = 'item_service'
     LIMIT 1`,
    [agendaId, employeeId]
  );
  return row || null;
}

async function buildAgendaTaskDto(row) {
  const agendaId = Number(row.agenda_id);
  const [items] = await cleanoxPool.query(
    `SELECT * FROM tr_agenda_items WHERE agenda_id = ? ORDER BY sort_order ASC, id ASC`,
    [agendaId]
  );
  const [evidence] = await cleanoxPool.query(
    `SELECT * FROM tr_agenda_evidence_photos WHERE agenda_id = ? ORDER BY id ASC`,
    [agendaId]
  );

  const byItem = new Map();
  for (const photo of evidence || []) {
    const itemId = Number(photo.agenda_item_id);
    if (!byItem.has(itemId)) byItem.set(itemId, { before: [], after: [] });
    const bucket = byItem.get(itemId);
    const entry = {
      id: Number(photo.id),
      kind: photo.kind,
      photo_path: photo.photo_path,
      photo_file: photo.photo_file,
    };
    if (photo.kind === 'before') bucket.before.push(entry);
    else if (photo.kind === 'after') bucket.after.push(entry);
  }

  const mappedItems = (items || []).map((item) => {
    const ev = byItem.get(Number(item.id)) || { before: [], after: [] };
    return {
      id: Number(item.id),
      service_id: Number(item.service_id),
      service_name: item.service_name_snapshot,
      category_name: item.category_name_snapshot || null,
      qty: Number(item.qty || 0),
      meter: item.meter == null ? null : Number(item.meter),
      evidence: {
        before_photos: ev.before,
        after_photos: ev.after,
        has_before: ev.before.length >= 1,
        has_after: ev.after.length >= 1,
        is_complete: ev.before.length >= 1 && ev.after.length >= 1,
      },
    };
  });

  const allItemsComplete =
    mappedItems.length > 0 && mappedItems.every((item) => item.evidence.is_complete);

  return {
    task_source: 'agenda',
    agenda_id: agendaId,
    assignment_id: Number(row.id),
    assignment_status: row.assignment_status,
    employee_id: Number(row.employee_id),
    employee_name: row.employee_name,
    agenda: {
      id: agendaId,
      name: row.agenda_name,
      location: row.location,
      start_date: toDateKey(row.start_date),
      end_date: toDateKey(row.end_date),
      agenda_time: formatAgendaTime(row.agenda_time),
      day_label: row.day_label,
      content_type: row.content_type,
      description: row.description || null,
      notes: row.notes || null,
      status: row.agenda_status,
      agenda_kind: row.agenda_kind,
      other_type: row.other_type || null,
      other_type_label: row.other_type_label || null,
    },
    items: mappedItems,
    can_complete: allItemsComplete && row.assignment_status === 'On_Progress',
    arrival: {
      photo_path: row.arrival_photo_path || null,
      latitude: row.arrival_latitude == null ? null : Number(row.arrival_latitude),
      longitude: row.arrival_longitude == null ? null : Number(row.arrival_longitude),
      at: row.arrival_at || null,
    },
  };
}

export const listMyAgendaTasks = async (req, res) => {
  const employeeId = Number(req.user?.id);
  const status = String(req.query.status || '').trim();
  if (!employeeId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const params = [employeeId];
    let statusSql = '';
    if (status) {
      statusSql = ' AND w.assignment_status = ?';
      params.push(status);
    }

    const [rows] = await cleanoxPool.query(
      `SELECT
         w.*,
         a.name AS agenda_name,
         a.location,
         a.start_date,
         a.end_date,
         a.agenda_time,
         a.day_label,
         a.content_type,
         a.description,
         a.notes,
         a.status AS agenda_status,
         a.agenda_kind,
         a.other_type,
         a.other_type_label
       FROM tr_agenda_workers w
       INNER JOIN tr_agendas a ON a.id = w.agenda_id
       WHERE w.employee_id = ?
         AND a.status IN ('scheduled', 'completed')
         AND a.content_type = 'item_service'
         ${statusSql}
       ORDER BY a.start_date ASC, w.id DESC`,
      params
    );

    const tasks = [];
    for (const row of rows || []) {
      await resolveAgendaCompletion(cleanoxPool, row.agenda_id);
      tasks.push(await buildAgendaTaskDto(row));
    }
    return res.json({ tasks });
  } catch (error) {
    console.error('[mobile-agenda/listMyAgendaTasks]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil tugas agenda' });
  }
};

export const getMyAgendaTaskDetail = async (req, res) => {
  const agendaId = Number(req.params.id);
  const employeeId = Number(req.user?.id);
  if (!agendaId || !employeeId) return res.status(400).json({ message: 'Parameter tidak valid' });
  try {
    await resolveAgendaCompletion(cleanoxPool, agendaId);
    const row = await getOwnedAgendaWorker(agendaId, employeeId);
    if (!row) return res.status(404).json({ message: 'Tugas agenda tidak ditemukan' });
    return res.json({ task: await buildAgendaTaskDto(row) });
  } catch (error) {
    console.error('[mobile-agenda/getMyAgendaTaskDetail]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil detail agenda' });
  }
};

export const acceptAgendaTask = async (req, res) => {
  const agendaId = Number(req.params.id);
  const employeeId = Number(req.user?.id);
  try {
    const row = await getOwnedAgendaWorker(agendaId, employeeId);
    if (!row) return res.status(404).json({ message: 'Tugas agenda tidak ditemukan' });
    if (row.assignment_status !== 'Assigned') {
      return res.status(409).json({ message: 'Status tidak dapat dikonfirmasi' });
    }
    await cleanoxPool.query(
      `UPDATE tr_agenda_workers
       SET assignment_status = 'In_Schedule', responded_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [row.id]
    );
    const fresh = await getOwnedAgendaWorker(agendaId, employeeId);
    return res.json({ message: 'Agenda dikonfirmasi', task: await buildAgendaTaskDto(fresh) });
  } catch (error) {
    console.error('[mobile-agenda/acceptAgendaTask]', error.message);
    return res.status(500).json({ message: 'Gagal konfirmasi agenda' });
  }
};

export const startAgendaTask = async (req, res) => {
  const agendaId = Number(req.params.id);
  const employeeId = Number(req.user?.id);
  const file = req.file;
  const latitude = req.body?.latitude;
  const longitude = req.body?.longitude;

  try {
    const row = await getOwnedAgendaWorker(agendaId, employeeId);
    if (!row) return res.status(404).json({ message: 'Tugas agenda tidak ditemukan' });
    if (row.assignment_status !== 'In_Schedule') {
      return res.status(409).json({ message: 'Status harus Terjadwal untuk mulai' });
    }
    if (!file) return res.status(400).json({ message: 'Foto kedatangan wajib' });

    const fileName = `${agendaId}_${employeeId}_arrival_${Date.now()}.jpg`;
    const abs = path.join(ARRIVAL_BASE, fileName);
    fs.writeFileSync(abs, await compressToJpg(file.buffer));

    await cleanoxPool.query(
      `UPDATE tr_agenda_workers
       SET assignment_status = 'On_Progress',
           started_at = NOW(),
           arrival_photo_file = ?,
           arrival_photo_path = ?,
           arrival_latitude = ?,
           arrival_longitude = ?,
           arrival_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [
        fileName,
        toArrivalPath(fileName),
        latitude != null && latitude !== '' ? Number(latitude) : null,
        longitude != null && longitude !== '' ? Number(longitude) : null,
        row.id,
      ]
    );

    const fresh = await getOwnedAgendaWorker(agendaId, employeeId);
    return res.json({ message: 'Agenda dimulai', task: await buildAgendaTaskDto(fresh) });
  } catch (error) {
    console.error('[mobile-agenda/startAgendaTask]', error.message);
    return res.status(500).json({ message: 'Gagal memulai agenda' });
  }
};

export const uploadAgendaItemPhoto = async (req, res) => {
  const agendaId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const kind = String(req.params.kind || '').trim();
  const employeeId = Number(req.user?.id);
  const file = req.file;

  if (!['before', 'after'].includes(kind)) {
    return res.status(400).json({ message: 'Kind wajib before atau after' });
  }
  if (!file) return res.status(400).json({ message: 'Foto wajib diunggah' });

  try {
    const row = await getOwnedAgendaWorker(agendaId, employeeId);
    if (!row) return res.status(404).json({ message: 'Tugas agenda tidak ditemukan' });
    if (row.assignment_status !== 'On_Progress') {
      return res.status(409).json({ message: 'Upload evidence hanya saat On Progress' });
    }

    const [[item]] = await cleanoxPool.query(
      `SELECT id FROM tr_agenda_items WHERE id = ? AND agenda_id = ? LIMIT 1`,
      [itemId, agendaId]
    );
    if (!item) return res.status(404).json({ message: 'Item agenda tidak ditemukan' });

    const fileName = `${agendaId}_${itemId}_${kind}_${Date.now()}.jpg`;
    const abs = path.join(EVIDENCE_BASE, fileName);
    fs.writeFileSync(abs, await compressToJpg(file.buffer));

    const [[sortRow]] = await cleanoxPool.query(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort
       FROM tr_agenda_evidence_photos
       WHERE agenda_item_id = ? AND kind = ?`,
      [itemId, kind]
    );

    await cleanoxPool.query(
      `INSERT INTO tr_agenda_evidence_photos (
         agenda_id, agenda_item_id, agenda_worker_id, kind, photo_file, photo_path, sort_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        agendaId,
        itemId,
        row.id,
        kind,
        fileName,
        toEvidencePath(fileName),
        Number(sortRow?.next_sort || 1),
      ]
    );

    await resolveAgendaCompletion(cleanoxPool, agendaId);
    const fresh = await getOwnedAgendaWorker(agendaId, employeeId);
    return res.status(201).json({
      message: 'Foto evidence diunggah',
      task: await buildAgendaTaskDto(fresh),
    });
  } catch (error) {
    console.error('[mobile-agenda/uploadAgendaItemPhoto]', error.message);
    return res.status(500).json({ message: 'Gagal mengunggah foto evidence' });
  }
};

export const completeAgendaTask = async (req, res) => {
  const agendaId = Number(req.params.id);
  const employeeId = Number(req.user?.id);
  try {
    const row = await getOwnedAgendaWorker(agendaId, employeeId);
    if (!row) return res.status(404).json({ message: 'Tugas agenda tidak ditemukan' });
    if (row.assignment_status !== 'On_Progress') {
      return res.status(409).json({ message: 'Status harus On Progress untuk selesai' });
    }

    const dto = await buildAgendaTaskDto(row);
    if (!dto.can_complete) {
      return res.status(400).json({
        message: 'Lengkapi foto before & after semua item sebelum menyelesaikan',
      });
    }

    await cleanoxPool.query(
      `UPDATE tr_agenda_workers
       SET assignment_status = 'Done', completed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [row.id]
    );
    await resolveAgendaCompletion(cleanoxPool, agendaId);
    const fresh = await getOwnedAgendaWorker(agendaId, employeeId);
    return res.json({ message: 'Agenda selesai', task: await buildAgendaTaskDto(fresh) });
  } catch (error) {
    console.error('[mobile-agenda/completeAgendaTask]', error.message);
    return res.status(500).json({ message: 'Gagal menyelesaikan agenda' });
  }
};

export const serveAgendaEvidenceFile = async (req, res) => {
  const fileName = path.basename(String(req.params.filename || ''));
  const abs = path.join(EVIDENCE_BASE, fileName);
  if (!fs.existsSync(abs)) return res.status(404).json({ message: 'File tidak ditemukan' });
  return res.sendFile(abs);
};

export const serveAgendaArrivalFile = async (req, res) => {
  const fileName = path.basename(String(req.params.filename || ''));
  const abs = path.join(ARRIVAL_BASE, fileName);
  if (!fs.existsSync(abs)) return res.status(404).json({ message: 'File tidak ditemukan' });
  return res.sendFile(abs);
};
