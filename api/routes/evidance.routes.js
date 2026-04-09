import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  uploadMiddleware,
  uploadEvidance,
  deleteEvidance,
  serveFile,
} from '../controllers/evidance.controller.js';

const router = Router();

// Serve files (authenticated)
router.get('/file/:filename', authenticate, serveFile);

// Upload (authenticated)
router.post('/upload', authenticate, (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Ukuran file melebihi 5 MB'
        : err.message || 'Upload gagal';
      return res.status(400).json({ message: msg });
    }
    next();
  });
}, uploadEvidance);

// Delete (authenticated)
router.delete('/delete', authenticate, deleteEvidance);

export default router;
