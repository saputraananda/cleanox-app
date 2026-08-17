import fs from 'fs';
import path from 'path';
import multer from 'multer';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import cleanoxPool from '../../shared/db/cleanox.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_BASE = process.env.UPLOAD_BASE_DIR
  ? path.resolve(process.env.UPLOAD_BASE_DIR)
  : path.resolve(__dirname, '../../../src/assets');

const KASBON_BASE = process.env.CLEANOX_KASBON_DIR
  ? path.resolve(process.env.CLEANOX_KASBON_DIR)
  : process.env.CLEANOX_LEAVE_DIR
    ? path.join(path.dirname(path.resolve(process.env.CLEANOX_LEAVE_DIR)), 'worker-kasbon')
    : path.join(STORAGE_BASE, 'worker-kasbon');

if (!fs.existsSync(KASBON_BASE)) fs.mkdirSync(KASBON_BASE, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('File bukti harus berupa gambar'));
  },
});

export const proofUploadMiddleware = upload.single('proof_doc');

const ALLOWED_TYPES = new Set(['kasbon', 'pinjaman']);

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

function sanitizeName(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

function wantsRemoveProof(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

async function compressToJpg(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

async function saveProof(workerId, file) {
  const workerSlug = sanitizeName(workerId);
  const fileName = `${workerSlug}_${Date.now()}_proof.jpg`;
  const filePath = path.join(KASBON_BASE, fileName);
  const buffer = await compressToJpg(file.buffer);
  fs.writeFileSync(filePath, buffer);
  return {
    file: fileName,
    path: `/mobile-kasbon/proofs/${fileName}`,
  };
}

function deleteProofFile(fileName) {
  if (!fileName) return;
  const safe = path.basename(fileName);
  const fullPath = path.join(KASBON_BASE, safe);
  fs.unlink(fullPath, () => {});
}

function serializeKasbon(row) {
  if (!row) return null;
  return {
    ...row,
    submission_date: toDateOnly(row.submission_date),
    amount_requested: row.amount_requested != null ? Number(row.amount_requested) : null,
    amount_approved: row.amount_approved != null ? Number(row.amount_approved) : null,
  };
}

function serializePayment(row) {
  if (!row) return null;
  return {
    ...row,
    payment_date: toDateOnly(row.payment_date),
    amount: row.amount != null ? Number(row.amount) : null,
  };
}

export const serveProof = (req, res) => {
  const safeFileName = path.basename(req.params.filename);
  const fullPath = path.join(KASBON_BASE, safeFileName);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ message: 'File bukti tidak ditemukan' });
  }

  return res.sendFile(fullPath);
};

export const getMySubmissions = async (req, res) => {
  const workerId = req.user?.id;
  const { startDate, endDate } = req.query;

  try {
    let dateWhere = '';
    const params = [workerId];

    if (startDate) {
      dateWhere += ' AND submission_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      dateWhere += ' AND submission_date <= ?';
      params.push(endDate);
    }

    const [rows] = await cleanoxPool.query(
      `SELECT id, worker_id, type, submission_date, amount_requested, amount_approved,
              purpose, notes, proof_file, proof_path, status, process_note,
              process_by, process_by_name, process_at, approved_note,
              approved_by, approved_by_name, approved_at, rejection_note,
              created_at, updated_at
       FROM tr_worker_kasbon
       WHERE worker_id = ?${dateWhere}
       ORDER BY submission_date DESC, created_at DESC`,
      params
    );

    return res.json({ data: rows.map(serializeKasbon) });
  } catch (error) {
    console.error('[mobileKasbon] getMySubmissions', error);
    return res.status(500).json({ message: 'Gagal mengambil daftar pengajuan kasbon' });
  }
};

export const getKasbonDetail = async (req, res) => {
  const workerId = req.user?.id;
  const id = Number(req.params.id);

  try {
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID tidak valid' });
    }

    const [[row]] = await cleanoxPool.query(
      'SELECT * FROM tr_worker_kasbon WHERE id = ? AND worker_id = ?',
      [id, workerId]
    );
    if (!row) {
      return res.status(404).json({ message: 'Pengajuan tidak ditemukan' });
    }

    const [paymentRows] = await cleanoxPool.query(
      `SELECT id, kasbon_id, payment_date, amount, payment_method, notes,
              recorded_by, recorded_by_name, created_at
       FROM tr_worker_kasbon_payment
       WHERE kasbon_id = ?
       ORDER BY payment_date ASC, id ASC`,
      [id]
    );

    const payments = paymentRows.map(serializePayment);
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const amountApproved = row.amount_approved != null ? Number(row.amount_approved) : null;
    const remaining =
      row.type === 'pinjaman' && amountApproved != null
        ? amountApproved - totalPaid
        : null;

    return res.json({
      data: {
        ...serializeKasbon(row),
        payments,
        total_paid: totalPaid,
        remaining,
      },
    });
  } catch (error) {
    console.error('[mobileKasbon] getKasbonDetail', error);
    return res.status(500).json({ message: 'Gagal mengambil detail pengajuan' });
  }
};

export const submitKasbon = async (req, res) => {
  const workerId = req.user?.id;
  const { type, submission_date, purpose, amount_requested, notes } = req.body;
  let savedFile = null;

  try {
    if (!ALLOWED_TYPES.has(type)) {
      return res.status(422).json({ message: 'type harus kasbon atau pinjaman' });
    }
    if (!submission_date) {
      return res.status(422).json({ message: 'submission_date wajib diisi' });
    }
    if (!purpose || !String(purpose).trim()) {
      return res.status(422).json({ message: 'purpose wajib diisi' });
    }
    const amount = Number(amount_requested);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(422).json({ message: 'amount_requested harus lebih dari 0' });
    }

    let proofFile = null;
    let proofPath = null;
    if (req.file) {
      savedFile = await saveProof(workerId, req.file);
      proofFile = savedFile.file;
      proofPath = savedFile.path;
    }

    const [result] = await cleanoxPool.query(
      `INSERT INTO tr_worker_kasbon
         (worker_id, type, submission_date, amount_requested, purpose, notes,
          proof_file, proof_path, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pengajuan')`,
      [
        workerId,
        type,
        submission_date,
        amount,
        String(purpose).trim(),
        notes != null && String(notes).trim() !== '' ? String(notes).trim() : null,
        proofFile,
        proofPath,
      ]
    );

    const [[inserted]] = await cleanoxPool.query(
      'SELECT * FROM tr_worker_kasbon WHERE id = ?',
      [result.insertId]
    );

    return res.status(201).json({
      message: 'Pengajuan berhasil dikirim',
      data: serializeKasbon(inserted),
    });
  } catch (error) {
    if (savedFile?.file) deleteProofFile(savedFile.file);
    console.error('[mobileKasbon] submitKasbon', error);
    return res.status(500).json({ message: 'Gagal mengirim pengajuan' });
  }
};

export const updateKasbon = async (req, res) => {
  const workerId = req.user?.id;
  const id = Number(req.params.id);
  const { type, submission_date, purpose, amount_requested, notes, remove_proof } = req.body;
  let savedFile = null;

  try {
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID tidak valid' });
    }

    const [[existing]] = await cleanoxPool.query(
      'SELECT * FROM tr_worker_kasbon WHERE id = ? AND worker_id = ?',
      [id, workerId]
    );
    if (!existing) {
      return res.status(404).json({ message: 'Pengajuan tidak ditemukan' });
    }
    if (existing.status !== 'pengajuan') {
      return res.status(403).json({ message: 'Pengajuan yang sudah diproses tidak dapat diubah' });
    }

    const newType = type || existing.type;
    const newSubmissionDate = submission_date || toDateOnly(existing.submission_date);
    const newPurpose = purpose != null ? String(purpose).trim() : existing.purpose;
    const newAmount =
      amount_requested != null && amount_requested !== ''
        ? Number(amount_requested)
        : Number(existing.amount_requested);
    const newNotes =
      notes !== undefined
        ? notes != null && String(notes).trim() !== ''
          ? String(notes).trim()
          : null
        : existing.notes;

    if (!ALLOWED_TYPES.has(newType)) {
      return res.status(422).json({ message: 'type harus kasbon atau pinjaman' });
    }
    if (!newPurpose) {
      return res.status(422).json({ message: 'purpose wajib diisi' });
    }
    if (!Number.isFinite(newAmount) || newAmount <= 0) {
      return res.status(422).json({ message: 'amount_requested harus lebih dari 0' });
    }

    let newProofFile = existing.proof_file;
    let newProofPath = existing.proof_path;

    if (req.file) {
      savedFile = await saveProof(workerId, req.file);
      if (existing.proof_file) deleteProofFile(existing.proof_file);
      newProofFile = savedFile.file;
      newProofPath = savedFile.path;
    } else if (wantsRemoveProof(remove_proof)) {
      if (existing.proof_file) deleteProofFile(existing.proof_file);
      newProofFile = null;
      newProofPath = null;
    }

    await cleanoxPool.query(
      `UPDATE tr_worker_kasbon
       SET type = ?, submission_date = ?, amount_requested = ?, purpose = ?,
           notes = ?, proof_file = ?, proof_path = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        newType,
        newSubmissionDate,
        newAmount,
        newPurpose,
        newNotes,
        newProofFile,
        newProofPath,
        id,
      ]
    );

    const [[updated]] = await cleanoxPool.query(
      'SELECT * FROM tr_worker_kasbon WHERE id = ?',
      [id]
    );

    return res.json({
      message: 'Pengajuan berhasil diperbarui',
      data: serializeKasbon(updated),
    });
  } catch (error) {
    if (savedFile?.file) deleteProofFile(savedFile.file);
    console.error('[mobileKasbon] updateKasbon', error);
    return res.status(500).json({ message: 'Gagal memperbarui pengajuan' });
  }
};

export const deleteKasbon = async (req, res) => {
  const workerId = req.user?.id;
  const id = Number(req.params.id);

  try {
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID tidak valid' });
    }

    const [[existing]] = await cleanoxPool.query(
      'SELECT * FROM tr_worker_kasbon WHERE id = ? AND worker_id = ?',
      [id, workerId]
    );
    if (!existing) {
      return res.status(404).json({ message: 'Pengajuan tidak ditemukan' });
    }
    if (existing.status !== 'pengajuan') {
      return res.status(403).json({
        message: 'Hanya pengajuan dengan status "pengajuan" yang dapat dihapus',
      });
    }

    if (existing.proof_file) deleteProofFile(existing.proof_file);
    await cleanoxPool.query('DELETE FROM tr_worker_kasbon WHERE id = ?', [id]);

    return res.json({ message: 'Pengajuan berhasil dihapus' });
  } catch (error) {
    console.error('[mobileKasbon] deleteKasbon', error);
    return res.status(500).json({ message: 'Gagal menghapus pengajuan' });
  }
};
