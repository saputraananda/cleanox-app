import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import {
  getTodayOvertimeStatus,
  listMyOvertime,
  createPengajuan,
  selesaiOvertime,
} from '../controllers/mobileOvertime.controller.js';

const router = Router();

const requireMobileWorker = (req, res, next) => {
  if (req.user?.company_id !== 3) {
    return res.status(403).json({ message: 'Akses lembur hanya untuk mobile worker company_id = 3' });
  }
  next();
};

router.use(authenticate);
router.use(requireMobileWorker);

router.get('/today', getTodayOvertimeStatus);
router.get('/list', listMyOvertime);
router.post('/pengajuan', createPengajuan);
router.post('/:id/selesai', selesaiOvertime);

export default router;
