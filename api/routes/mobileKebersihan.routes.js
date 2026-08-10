import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getTodayKebersihanStatus,
  kebersihanUploadMiddleware,
  serveKebersihanFile,
  uploadKebersihanPhoto,
} from '../controllers/mobileKebersihan.controller.js';

const router = Router();

const requireMobileWorker = (req, res, next) => {
  if (req.user?.company_id !== 3) {
    return res.status(403).json({ message: 'Akses kebersihan hanya untuk mobile worker company_id = 3' });
  }
  next();
};

router.get('/file/:filename', authenticate, requireMobileWorker, serveKebersihanFile);

router.use(authenticate);
router.use(requireMobileWorker);

router.get('/today-status', getTodayKebersihanStatus);
router.post('/upload', (req, res, next) => {
  kebersihanUploadMiddleware(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Ukuran foto kebersihan melebihi 5 MB'
        : err.message || 'Upload kebersihan gagal';
      return res.status(400).json({ message });
    }
    next();
  });
}, uploadKebersihanPhoto);

export default router;
