import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import {
  doctorNoteUploadMiddleware,
  getTodayLeave,
  getLeaveList,
  getLeaveYears,
  getLeaveStats,
  submitLeave,
  updateLeave,
  cancelLeave,
  serveDoctorNote,
} from '../controllers/mobileLeave.controller.js';

const router = Router();

const requireMobileWorker = (req, res, next) => {
  if (req.user?.company_id !== 3) {
    return res.status(403).json({ message: 'Akses leave hanya untuk mobile worker company_id = 3' });
  }
  next();
};

const handleUpload = (req, res, next) => {
  doctorNoteUploadMiddleware(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Ukuran foto surat dokter melebihi 5 MB'
        : err.message || 'Upload surat dokter gagal';
      return res.status(400).json({ message });
    }
    next();
  });
};

router.get('/doctor-notes/:filename', authenticate, requireMobileWorker, serveDoctorNote);

router.use(authenticate);
router.use(requireMobileWorker);

router.get('/today', getTodayLeave);
router.get('/years', getLeaveYears);
router.get('/stats', getLeaveStats);
router.get('/list', getLeaveList);
router.post('/', handleUpload, submitLeave);
router.put('/:id', handleUpload, updateLeave);
router.delete('/:id', cancelLeave);

export default router;
