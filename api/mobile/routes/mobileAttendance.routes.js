import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import {
  attendanceUploadMiddleware,
  checkInAttendance,
  checkOutAttendance,
  submitGroomingPhotos,
  getTodayAttendanceStatus,
  serveAttendanceFile,
  getRekapMonth,
  getRekapDay,
} from '../controllers/mobileAttendance.controller.js';

const router = Router();

const requireMobileWorker = (req, res, next) => {
  if (req.user?.company_id !== 3) {
    return res.status(403).json({ message: 'Akses attendance hanya untuk mobile worker company_id = 3' });
  }
  next();
};

const handleUpload = (req, res, next) => {
  attendanceUploadMiddleware(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Ukuran foto attendance melebihi 5 MB'
        : err.message || 'Upload attendance gagal';
      return res.status(400).json({ message });
    }
    next();
  });
};

router.get('/file/:filename', authenticate, requireMobileWorker, serveAttendanceFile);

router.use(authenticate);
router.use(requireMobileWorker);

router.get('/today-status', getTodayAttendanceStatus);
router.get('/rekap', getRekapMonth);
router.get('/rekap/day', getRekapDay);
router.post('/check-in', handleUpload, checkInAttendance);
router.post('/grooming', handleUpload, submitGroomingPhotos);
router.post('/check-out', handleUpload, checkOutAttendance);

export default router;
