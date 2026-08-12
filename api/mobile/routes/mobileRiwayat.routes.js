import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import { listMyRiwayat } from '../controllers/mobileRiwayat.controller.js';

const router = Router();

const requireMobileWorker = (req, res, next) => {
  if (req.user?.company_id !== 3) {
    return res.status(403).json({ message: 'Akses riwayat hanya untuk mobile worker company_id = 3' });
  }
  next();
};

router.use(authenticate);
router.use(requireMobileWorker);

router.get('/', listMyRiwayat);

export default router;
