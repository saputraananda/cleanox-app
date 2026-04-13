import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import sharp from 'sharp';
import cleanoxPool from '../db/cleanox.js';

const TRANSAKSI_TABLE = process.env.NODE_ENV === 'development'
  ? 'rekap_transaksi_reguler'
  : 'rekap_transaksi_reguler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ── Upload directory ─────────────────────────────────── */
const STORAGE_BASE = process.env.UPLOAD_BASE_DIR
  ? path.resolve(process.env.UPLOAD_BASE_DIR)
  : path.resolve(__dirname, '../../src/assets');

const UPLOAD_BASE = path.join(STORAGE_BASE, 'evidance');

// Ensure directory exists
if (!fs.existsSync(UPLOAD_BASE)) fs.mkdirSync(UPLOAD_BASE, { recursive: true });

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/* ── Allowed stages ───────────────────────────────────── */
const ALLOWED_STAGES = ['pickup', 'packing'];

/* ── DB column mapping ────────────────────────────────── */
const DB_COLS = {
  pickup:  { file: 'pickup_evidance_file',  path: 'pickup_evidance_path'  },
  packing: { file: 'packing_evidance_file', path: 'packing_evidance_path' },
};

/* ── Multer config (memory storage for compression) ──── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpe?g|png|gif|webp|pdf|doc|docx)$/i;
    const extOk = allowed.test(path.extname(file.originalname));
    const mimeOk = /^(image\/|application\/pdf|application\/msword|application\/vnd\.openxmlformats)/.test(file.mimetype);
    if (extOk || mimeOk) return cb(null, true);
    cb(new Error('Tipe file tidak diizinkan'));
  },
});

export const uploadMiddleware = upload.single('file');

/* ── Compress image to ≤ 2 MB ─────────────────────────── */
async function compressImage(buffer, mimetype) {
  const isImage = /^image\//.test(mimetype);
  if (!isImage) return buffer; // don't compress non-images

  let quality = 85;
  let result = buffer;

  // Resize if oversized
  const meta = await sharp(buffer).metadata();
  let sharpInst = sharp(buffer).rotate(); // auto-rotate from EXIF

  // Cap dimensions at 2048
  if (meta.width > 2048 || meta.height > 2048) {
    sharpInst = sharpInst.resize(2048, 2048, { fit: 'inside', withoutEnlargement: true });
  }

  // Output as JPEG with progressive quality reduction until ≤ 2 MB
  const MAX_COMPRESSED = 2 * 1024 * 1024;
  while (quality >= 30) {
    result = await sharpInst.jpeg({ quality, mozjpeg: true }).toBuffer();
    if (result.length <= MAX_COMPRESSED) break;
    quality -= 10;
  }
  return result;
}

/* ── Upload Evidence ──────────────────────────────────── */
export const uploadEvidance = async (req, res) => {
  try {
    const { id, stage } = req.body;
    if (!id || !stage) return res.status(400).json({ message: 'id dan stage wajib diisi' });
    if (!ALLOWED_STAGES.includes(stage)) return res.status(400).json({ message: 'Stage tidak valid (hanya pickup/packing)' });
    if (!req.file) return res.status(400).json({ message: 'File tidak ditemukan' });

    // Fetch row metadata for filename + existence check
    const cols = DB_COLS[stage];
    const [[row]] = await cleanoxPool.query(
      `SELECT id, no_nota, ${cols.file} AS old_file, ${cols.path} AS old_path
       FROM ${TRANSAKSI_TABLE} WHERE id = ?`,
      [id]
    );
    if (!row) return res.status(404).json({ message: 'Data tidak ditemukan' });

    // Compress if image
    let fileBuffer = req.file.buffer;
    let ext = path.extname(req.file.originalname).toLowerCase();
    const isImage = /^image\//.test(req.file.mimetype);

    if (isImage) {
      fileBuffer = await compressImage(fileBuffer, req.file.mimetype);
      ext = '.jpg'; // compressed output is always JPEG
    }

    // Helper: sanitize a string for use in filename
    const slug = (v) =>
      String(v ?? '')
        .trim()
        .replace(/[^a-zA-Z0-9 _\-]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 60);

    const noNota   = slug(row.no_nota);
    const safeName = `${stage}_${noNota}${ext}`;
    const filePath = path.join(UPLOAD_BASE, safeName);

    // Delete old file if exists (and different name)
    if (row.old_file && row.old_file !== safeName) {
      const oldPath = path.join(UPLOAD_BASE, row.old_file);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    // Write file
    fs.writeFileSync(filePath, fileBuffer);

    // Relative path stored in DB — without /api prefix (axios baseURL already adds it)
    const relativePath = `/evidance/file/${safeName}`;

    // Update DB
    await cleanoxPool.query(
      `UPDATE ${TRANSAKSI_TABLE} SET ${cols.file} = ?, ${cols.path} = ?, updated_at = NOW() WHERE id = ?`,
      [safeName, relativePath, id]
    );

    return res.json({
      message: 'Upload berhasil',
      filename: safeName,
      filepath: relativePath,
      size: fileBuffer.length,
    });
  } catch (err) {
    console.error('[evidance/upload]', err.message);
    if (err.message === 'Tipe file tidak diizinkan') {
      return res.status(400).json({ message: err.message });
    }
    return res.status(500).json({ message: 'Gagal upload file', error: err.message });
  }
};

/* ── Delete Evidence ──────────────────────────────────── */
export const deleteEvidance = async (req, res) => {
  const { id, stage } = req.body;
  if (!id || !stage) return res.status(400).json({ message: 'id dan stage wajib diisi' });
  if (!ALLOWED_STAGES.includes(stage)) return res.status(400).json({ message: 'Stage tidak valid' });

  const cols = DB_COLS[stage];

  try {
    const [[row]] = await cleanoxPool.query(
      `SELECT ${cols.file} AS filename FROM ${TRANSAKSI_TABLE} WHERE id = ?`,
      [id]
    );
    if (!row) return res.status(404).json({ message: 'Data tidak ditemukan' });

    // Delete physical file
    if (row.filename) {
      const fullPath = path.join(UPLOAD_BASE, row.filename);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }

    // Clear DB columns
    await cleanoxPool.query(
      `UPDATE ${TRANSAKSI_TABLE} SET ${cols.file} = NULL, ${cols.path} = NULL, updated_at = NOW() WHERE id = ?`,
      [id]
    );

    return res.json({ message: 'Evidance berhasil dihapus' });
  } catch (err) {
    console.error('[evidance/delete]', err.message);
    return res.status(500).json({ message: 'Gagal menghapus evidance', error: err.message });
  }
};

/* ── Serve file ───────────────────────────────────────── */
export const serveFile = (req, res) => {
  const { filename } = req.params;
  // Sanitize: prevent path traversal
  const safe = path.basename(filename);
  const filePath = path.join(UPLOAD_BASE, safe);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'File tidak ditemukan' });
  }

  return res.sendFile(filePath);
};
