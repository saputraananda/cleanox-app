import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import sharp from 'sharp';
import cleanoxPool, { aloraPool } from '../../shared/db/cleanox.js';
import {
  getBusyWorkerDetails,
} from '../../shared/utils/posWorkerBusy.js';
import {
  AGENDA_STATUSES,
  CONTENT_TYPES,
  eachDateKeyInclusive,
  formatAgendaTime,
  mapAgendaListRow,
  resolveAgendaCompletion,
  toDateKey,
  validateAgendaSchedule,
  validateAgendaType,
} from '../../shared/utils/agendaHelpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_BASE = process.env.UPLOAD_BASE_DIR
  ? path.resolve(process.env.UPLOAD_BASE_DIR)
  : path.resolve(__dirname, '../../../src/assets');
const ACTIVITY_PHOTO_BASE = path.join(STORAGE_BASE, 'agenda-activity-photos');
const MAX_ACTIVITY_PHOTOS = 10;

if (!fs.existsSync(ACTIVITY_PHOTO_BASE)) {
  fs.mkdirSync(ACTIVITY_PHOTO_BASE, { recursive: true });
}

export const activityPhotoUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('File foto kegiatan harus berupa gambar'));
  },
}).array('photos', MAX_ACTIVITY_PHOTOS);

async function compressToJpg(buffer) {
  return sharp(buffer).rotate().jpeg({ quality: 82 }).toBuffer();
}

function toActivityPhotoPath(fileName) {
  return `/pos-agenda/activity-photo/${path.basename(String(fileName))}`;
}

async function getProduksiWorkerIds() {
  const [rows] = await cleanoxPool.query(
    `SELECT employee_id FROM mst_role WHERE role = 'produksi'`
  );
  return [
    ...new Set(
      (rows || [])
        .map((r) => Number(r.employee_id))
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
}

async function loadAgendaBundle(agendaId, connection = cleanoxPool) {
  const [[agenda]] = await connection.query(
    `SELECT * FROM tr_agendas WHERE id = ? LIMIT 1`,
    [agendaId]
  );
  if (!agenda) return null;

  const [items] = await connection.query(
    `SELECT * FROM tr_agenda_items WHERE agenda_id = ? ORDER BY sort_order ASC, id ASC`,
    [agendaId]
  );
  const [workers] = await connection.query(
    `SELECT * FROM tr_agenda_workers WHERE agenda_id = ? ORDER BY id ASC`,
    [agendaId]
  );
  const [activityPhotos] = await connection.query(
    `SELECT * FROM tr_agenda_activity_photos WHERE agenda_id = ? ORDER BY id ASC`,
    [agendaId]
  );
  const [evidencePhotos] = await connection.query(
    `SELECT * FROM tr_agenda_evidence_photos WHERE agenda_id = ? ORDER BY id ASC`,
    [agendaId]
  );

  const evidenceByItem = new Map();
  for (const photo of evidencePhotos || []) {
    const itemId = Number(photo.agenda_item_id);
    if (!evidenceByItem.has(itemId)) {
      evidenceByItem.set(itemId, { before: [], after: [] });
    }
    const bucket = evidenceByItem.get(itemId);
    const entry = {
      id: Number(photo.id),
      kind: photo.kind,
      photo_file: photo.photo_file,
      photo_path: photo.photo_path,
      agenda_worker_id: Number(photo.agenda_worker_id),
      created_at: photo.created_at,
    };
    if (photo.kind === 'before') bucket.before.push(entry);
    else if (photo.kind === 'after') bucket.after.push(entry);
  }

  return {
    agenda: {
      id: Number(agenda.id),
      agenda_kind: agenda.agenda_kind,
      other_type: agenda.other_type || null,
      other_type_label: agenda.other_type_label || null,
      name: agenda.name,
      location: agenda.location,
      start_date: toDateKey(agenda.start_date),
      end_date: toDateKey(agenda.end_date),
      agenda_time: formatAgendaTime(agenda.agenda_time),
      day_label: agenda.day_label,
      content_type: agenda.content_type,
      description: agenda.description || null,
      notes: agenda.notes || null,
      status: agenda.status,
      created_at: agenda.created_at,
      updated_at: agenda.updated_at,
    },
    items: (items || []).map((item) => {
      const evidence = evidenceByItem.get(Number(item.id)) || { before: [], after: [] };
      return {
        id: Number(item.id),
        service_id: Number(item.service_id),
        service_name_snapshot: item.service_name_snapshot,
        category_name_snapshot: item.category_name_snapshot || null,
        qty: Number(item.qty || 0),
        meter: item.meter == null ? null : Number(item.meter),
        sort_order: Number(item.sort_order || 0),
        evidence: {
          before_count: evidence.before.length,
          after_count: evidence.after.length,
          before_photos: evidence.before,
          after_photos: evidence.after,
          is_complete: evidence.before.length >= 1 && evidence.after.length >= 1,
        },
      };
    }),
    workers: (workers || []).map((w) => ({
      id: Number(w.id),
      employee_id: Number(w.employee_id),
      employee_name: w.employee_name,
      assignment_status: w.assignment_status,
      assigned_at: w.assigned_at,
      responded_at: w.responded_at,
      started_at: w.started_at,
      completed_at: w.completed_at,
    })),
    activity_photos: (activityPhotos || []).map((p) => ({
      id: Number(p.id),
      photo_file: p.photo_file,
      photo_path: p.photo_path,
      created_at: p.created_at,
    })),
  };
}

export const getAgendaSummary = async (_req, res) => {
  try {
    const [[row]] = await cleanoxPool.query(
      `SELECT
         COUNT(*) AS total_agendas,
         SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft_agendas,
         SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled_agendas,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_agendas
       FROM tr_agendas`
    );
    return res.json({
      summary: {
        total_agendas: Number(row?.total_agendas || 0),
        draft_agendas: Number(row?.draft_agendas || 0),
        scheduled_agendas: Number(row?.scheduled_agendas || 0),
        completed_agendas: Number(row?.completed_agendas || 0),
      },
    });
  } catch (error) {
    console.error('[pos-agenda/getAgendaSummary]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil ringkasan agenda' });
  }
};

export const listAgendas = async (req, res) => {
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  const dateFrom = String(req.query.date_from || '').trim();
  const dateTo = String(req.query.date_to || '').trim();
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.query.page_size, 10) || 10));
  const offset = (page - 1) * pageSize;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (dateFrom && !datePattern.test(dateFrom)) {
    return res.status(400).json({ message: 'Format tanggal dari tidak valid (YYYY-MM-DD)' });
  }
  if (dateTo && !datePattern.test(dateTo)) {
    return res.status(400).json({ message: 'Format tanggal sampai tidak valid (YYYY-MM-DD)' });
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return res.status(400).json({ message: 'Tanggal mulai tidak boleh setelah tanggal akhir' });
  }

  try {
    const where = ['1 = 1'];
    const params = [];
    if (search) {
      where.push('(a.name LIKE ? OR a.location LIKE ? OR a.other_type_label LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q);
    }
    if (status && AGENDA_STATUSES.has(status)) {
      where.push('a.status = ?');
      params.push(status);
    }
    if (dateFrom) {
      where.push('a.start_date >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push('a.start_date <= ?');
      params.push(dateTo);
    }

    const whereSql = where.join(' AND ');
    const [[countRow]] = await cleanoxPool.query(
      `SELECT COUNT(*) AS total FROM tr_agendas a WHERE ${whereSql}`,
      params
    );
    const [rows] = await cleanoxPool.query(
      `SELECT
         a.*,
         (SELECT COUNT(*) FROM tr_agenda_workers w WHERE w.agenda_id = a.id) AS worker_count,
         (SELECT COUNT(*) FROM tr_agenda_items i WHERE i.agenda_id = a.id) AS item_count
       FROM tr_agendas a
       WHERE ${whereSql}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const agendas = [];
    for (const row of rows || []) {
      const nextStatus = await resolveAgendaCompletion(cleanoxPool, row.id);
      agendas.push(
        mapAgendaListRow({
          ...row,
          status: nextStatus || row.status,
        })
      );
    }

    const totalItems = Number(countRow?.total || 0);
    return res.json({
      agendas,
      pagination: {
        page,
        page_size: pageSize,
        total_items: totalItems,
        total_pages: Math.max(1, Math.ceil(totalItems / pageSize) || 1),
      },
    });
  } catch (error) {
    console.error('[pos-agenda/listAgendas]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil daftar agenda' });
  }
};

export const getAgendaDetail = async (req, res) => {
  const agendaId = Number(req.params.id);
  if (!agendaId) return res.status(400).json({ message: 'ID agenda tidak valid' });
  try {
    await resolveAgendaCompletion(cleanoxPool, agendaId);
    const bundle = await loadAgendaBundle(agendaId);
    if (!bundle) return res.status(404).json({ message: 'Agenda tidak ditemukan' });
    return res.json(bundle);
  } catch (error) {
    console.error('[pos-agenda/getAgendaDetail]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil detail agenda' });
  }
};

export const getAgendaWorkers = async (req, res) => {
  try {
    const startDate = toDateKey(req.query.start_date);
    const endDate = toDateKey(req.query.end_date) || startDate;
    const agendaTime = formatAgendaTime(req.query.agenda_time);

    const produksiIds = await getProduksiWorkerIds();
    if (produksiIds.length === 0) {
      return res.json({ workers: [] });
    }

    const [rows] = await aloraPool.query(
      `SELECT employee_id, full_name, phone_number
       FROM mst_employee
       WHERE company_id = 3
         AND exit_date IS NULL
         AND employee_id IN (${produksiIds.map(() => '?').join(',')})
       ORDER BY full_name`,
      produksiIds
    );

    const busyIds = new Set();
    if (startDate) {
      const dates = eachDateKeyInclusive(startDate, endDate || startDate);
      for (const dateKey of dates) {
        const serviceDateTime =
          dates.length === 1 && agendaTime ? `${dateKey} ${agendaTime}:00` : `${dateKey} 09:00:00`;
        const busyMap = await getBusyWorkerDetails(cleanoxPool, serviceDateTime, {});
        for (const id of busyMap.keys()) busyIds.add(Number(id));
      }
    }

    const workers = rows.map((row) => {
      const id = Number(row.employee_id);
      const isBusy = busyIds.has(id);
      return {
        employee_id: id,
        full_name: row.full_name,
        phone_number: row.phone_number,
        is_busy: isBusy,
        busy_reason: isBusy ? 'Jadwal bentrok' : null,
      };
    });

    return res.json({ workers });
  } catch (error) {
    console.error('[pos-agenda/getAgendaWorkers]', error.message);
    return res.status(500).json({ message: 'Gagal mengambil data teknisi' });
  }
};

export const createAgenda = async (req, res) => {
  const body = req.body || {};
  const saveMode = String(body.save_mode || '').trim();
  if (!['draft', 'schedule'].includes(saveMode)) {
    return res.status(400).json({ message: 'save_mode wajib draft atau schedule' });
  }

  const typeCheck = validateAgendaType(body);
  if (!typeCheck.ok) return res.status(400).json({ message: typeCheck.message });

  const scheduleCheck = validateAgendaSchedule(body);
  if (!scheduleCheck.ok) return res.status(400).json({ message: scheduleCheck.message });

  const contentType = String(body.content_type || '').trim();
  if (!CONTENT_TYPES.has(contentType)) {
    return res.status(400).json({ message: 'content_type wajib item_service atau description' });
  }

  const name = String(body.name || '').trim();
  const location = String(body.location || '').trim();
  if (!name) return res.status(400).json({ message: 'Nama agenda wajib diisi' });
  if (!location) return res.status(400).json({ message: 'Lokasi agenda wajib diisi' });

  const notes = String(body.notes || '').trim() || null;
  const description = String(body.description || '').trim() || null;
  const workerIds = [...new Set((body.worker_ids || []).map((id) => Number(id)).filter((id) => id > 0))];
  if (workerIds.length < 1) {
    return res.status(400).json({ message: 'Minimal 1 teknisi wajib dipilih' });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (contentType === 'item_service') {
    if (rawItems.length < 1) {
      return res.status(400).json({ message: 'Minimal 1 item service wajib diisi' });
    }
  } else if (!description) {
    return res.status(400).json({ message: 'Deskripsi agenda wajib diisi' });
  } else if (rawItems.length > 0) {
    return res.status(400).json({ message: 'Agenda deskripsi tidak boleh punya item service' });
  }

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();

    const produksiIds = await getProduksiWorkerIds();
    const produksiSet = new Set(produksiIds);
    const invalidIds = workerIds.filter((id) => !produksiSet.has(id));
    if (invalidIds.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Teknisi tidak valid (hanya produksi aktif)' });
    }

    const [empRows] = await aloraPool.query(
      `SELECT employee_id, full_name
       FROM mst_employee
       WHERE company_id = 3
         AND exit_date IS NULL
         AND employee_id IN (${workerIds.map(() => '?').join(',')})`,
      workerIds
    );
    const empMap = new Map((empRows || []).map((r) => [Number(r.employee_id), r.full_name]));
    if (empMap.size !== workerIds.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Teknisi tidak ditemukan / nonaktif' });
    }

    let resolvedItems = [];
    if (contentType === 'item_service') {
      for (let i = 0; i < rawItems.length; i += 1) {
        const row = rawItems[i];
        const serviceId = Number(row.service_id);
        const qty = Number(row.qty || 1);
        const meter = row.meter == null || row.meter === '' ? null : Number(row.meter);
        if (!serviceId || !Number.isFinite(qty) || qty <= 0) {
          await connection.rollback();
          return res.status(400).json({ message: `Item #${i + 1} tidak valid` });
        }
        const [[service]] = await connection.query(
          `SELECT s.id, s.name, c.name AS category_name
           FROM mst_services s
           LEFT JOIN mst_category c ON c.id = s.category_id
           WHERE s.id = ?
           LIMIT 1`,
          [serviceId]
        );
        if (!service) {
          await connection.rollback();
          return res.status(400).json({ message: `Service #${serviceId} tidak ditemukan` });
        }
        resolvedItems.push({
          service_id: serviceId,
          service_name_snapshot: service.name,
          category_name_snapshot: service.category_name || null,
          qty,
          meter: Number.isFinite(meter) ? meter : null,
          sort_order: i,
        });
      }
    }

    const status = saveMode === 'schedule' ? 'scheduled' : 'draft';
    const [insertResult] = await connection.query(
      `INSERT INTO tr_agendas (
         agenda_kind, other_type, other_type_label, name, location,
         start_date, end_date, agenda_time, day_label,
         content_type, description, notes, status, created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        typeCheck.agenda_kind,
        typeCheck.other_type,
        typeCheck.other_type_label,
        name,
        location,
        scheduleCheck.start_date,
        scheduleCheck.end_date,
        scheduleCheck.agenda_time,
        scheduleCheck.day_label,
        contentType,
        contentType === 'description' ? description : null,
        notes,
        status,
        req.user?.id || null,
        req.user?.id || null,
      ]
    );
    const agendaId = Number(insertResult.insertId);

    for (const item of resolvedItems) {
      await connection.query(
        `INSERT INTO tr_agenda_items (
           agenda_id, service_id, service_name_snapshot, category_name_snapshot, qty, meter, sort_order
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          agendaId,
          item.service_id,
          item.service_name_snapshot,
          item.category_name_snapshot,
          item.qty,
          item.meter,
          item.sort_order,
        ]
      );
    }

    for (const workerId of workerIds) {
      await connection.query(
        `INSERT INTO tr_agenda_workers (agenda_id, employee_id, employee_name, assignment_status)
         VALUES (?, ?, ?, 'Assigned')`,
        [agendaId, workerId, empMap.get(workerId)]
      );
    }

    await connection.commit();
    const bundle = await loadAgendaBundle(agendaId);
    return res.status(201).json({
      message: status === 'scheduled' ? 'Agenda dijadwalkan' : 'Agenda disimpan sebagai draft',
      ...bundle,
    });
  } catch (error) {
    await connection.rollback();
    console.error('[pos-agenda/createAgenda]', error.message);
    return res.status(500).json({ message: 'Gagal menyimpan agenda' });
  } finally {
    connection.release();
  }
};

export const scheduleAgenda = async (req, res) => {
  const agendaId = Number(req.params.id);
  if (!agendaId) return res.status(400).json({ message: 'ID agenda tidak valid' });

  const connection = await cleanoxPool.getConnection();
  try {
    await connection.beginTransaction();
    const [[agenda]] = await connection.query(
      `SELECT id, status FROM tr_agendas WHERE id = ? LIMIT 1 FOR UPDATE`,
      [agendaId]
    );
    if (!agenda) {
      await connection.rollback();
      return res.status(404).json({ message: 'Agenda tidak ditemukan' });
    }
    if (String(agenda.status) !== 'draft') {
      await connection.rollback();
      return res.status(409).json({ message: 'Hanya agenda draft yang dapat dijadwalkan' });
    }
    await connection.query(
      `UPDATE tr_agendas SET status = 'scheduled', updated_by = ?, updated_at = NOW() WHERE id = ?`,
      [req.user?.id || null, agendaId]
    );
    await connection.commit();
    const bundle = await loadAgendaBundle(agendaId);
    return res.json({ message: 'Agenda dijadwalkan', ...bundle });
  } catch (error) {
    await connection.rollback();
    console.error('[pos-agenda/scheduleAgenda]', error.message);
    return res.status(500).json({ message: 'Gagal menjadwalkan agenda' });
  } finally {
    connection.release();
  }
};

export const cancelAgenda = async (req, res) => {
  const agendaId = Number(req.params.id);
  if (!agendaId) return res.status(400).json({ message: 'ID agenda tidak valid' });
  try {
    const [[agenda]] = await cleanoxPool.query(
      `SELECT id, status FROM tr_agendas WHERE id = ? LIMIT 1`,
      [agendaId]
    );
    if (!agenda) return res.status(404).json({ message: 'Agenda tidak ditemukan' });
    if (['completed', 'cancelled'].includes(String(agenda.status))) {
      return res.status(409).json({ message: 'Agenda tidak dapat dibatalkan' });
    }
    await cleanoxPool.query(
      `UPDATE tr_agendas SET status = 'cancelled', updated_by = ?, updated_at = NOW() WHERE id = ?`,
      [req.user?.id || null, agendaId]
    );
    await cleanoxPool.query(
      `UPDATE tr_agenda_workers
       SET assignment_status = 'Cancelled', updated_at = NOW()
       WHERE agenda_id = ? AND assignment_status NOT IN ('Done', 'Cancelled')`,
      [agendaId]
    );
    const bundle = await loadAgendaBundle(agendaId);
    return res.json({ message: 'Agenda dibatalkan', ...bundle });
  } catch (error) {
    console.error('[pos-agenda/cancelAgenda]', error.message);
    return res.status(500).json({ message: 'Gagal membatalkan agenda' });
  }
};

export const uploadAgendaActivityPhotos = async (req, res) => {
  const agendaId = Number(req.params.id);
  if (!agendaId) return res.status(400).json({ message: 'ID agenda tidak valid' });
  const files = Array.isArray(req.files) ? req.files : [];
  if (files.length < 1) return res.status(400).json({ message: 'File foto kegiatan wajib diunggah' });

  try {
    const [[agenda]] = await cleanoxPool.query(
      `SELECT id, content_type, status FROM tr_agendas WHERE id = ? LIMIT 1`,
      [agendaId]
    );
    if (!agenda) return res.status(404).json({ message: 'Agenda tidak ditemukan' });
    if (String(agenda.content_type) !== 'description') {
      return res.status(409).json({ message: 'Foto kegiatan hanya untuk agenda deskripsi' });
    }
    if (['cancelled'].includes(String(agenda.status))) {
      return res.status(409).json({ message: 'Agenda dibatalkan tidak dapat diunggah fotonya' });
    }

    const [[countRow]] = await cleanoxPool.query(
      `SELECT COUNT(*) AS total FROM tr_agenda_activity_photos WHERE agenda_id = ?`,
      [agendaId]
    );
    const remaining = Math.max(0, MAX_ACTIVITY_PHOTOS - Number(countRow?.total || 0));
    if (remaining < 1) {
      return res.status(400).json({ message: `Maksimal ${MAX_ACTIVITY_PHOTOS} foto kegiatan` });
    }

    const toSave = files.slice(0, remaining);
    for (const file of toSave) {
      const fileName = `${agendaId}_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
      const absPath = path.join(ACTIVITY_PHOTO_BASE, fileName);
      const buffer = await compressToJpg(file.buffer);
      fs.writeFileSync(absPath, buffer);
      await cleanoxPool.query(
        `INSERT INTO tr_agenda_activity_photos (agenda_id, photo_file, photo_path, created_by)
         VALUES (?, ?, ?, ?)`,
        [agendaId, fileName, toActivityPhotoPath(fileName), req.user?.id || null]
      );
    }

    await resolveAgendaCompletion(cleanoxPool, agendaId);
    const bundle = await loadAgendaBundle(agendaId);
    return res.status(201).json({ message: 'Foto kegiatan diunggah', ...bundle });
  } catch (error) {
    console.error('[pos-agenda/uploadAgendaActivityPhotos]', error.message);
    return res.status(500).json({ message: 'Gagal mengunggah foto kegiatan' });
  }
};

export const deleteAgendaActivityPhoto = async (req, res) => {
  const agendaId = Number(req.params.id);
  const photoId = Number(req.params.photoId);
  if (!agendaId || !photoId) return res.status(400).json({ message: 'Parameter tidak valid' });
  try {
    const [[photo]] = await cleanoxPool.query(
      `SELECT * FROM tr_agenda_activity_photos WHERE id = ? AND agenda_id = ? LIMIT 1`,
      [photoId, agendaId]
    );
    if (!photo) return res.status(404).json({ message: 'Foto tidak ditemukan' });
    await cleanoxPool.query(`DELETE FROM tr_agenda_activity_photos WHERE id = ?`, [photoId]);
    const abs = path.join(ACTIVITY_PHOTO_BASE, path.basename(String(photo.photo_file)));
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    await resolveAgendaCompletion(cleanoxPool, agendaId);
    const bundle = await loadAgendaBundle(agendaId);
    return res.json({ message: 'Foto kegiatan dihapus', ...bundle });
  } catch (error) {
    console.error('[pos-agenda/deleteAgendaActivityPhoto]', error.message);
    return res.status(500).json({ message: 'Gagal menghapus foto kegiatan' });
  }
};

export const serveAgendaActivityPhoto = async (req, res) => {
  const fileName = path.basename(String(req.params.filename || ''));
  if (!fileName) return res.status(400).json({ message: 'Filename tidak valid' });
  const abs = path.join(ACTIVITY_PHOTO_BASE, fileName);
  if (!fs.existsSync(abs)) return res.status(404).json({ message: 'File tidak ditemukan' });
  return res.sendFile(abs);
};
