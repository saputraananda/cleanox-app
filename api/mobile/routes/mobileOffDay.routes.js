import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import { getTodayOffDay } from '../controllers/mobileOffDay.controller.js';

const router = Router();

const requireMobileWorker = (req, res, next) => {
  if (req.user?.company_id !== 3) {
    return res.status(403).json({ message: 'Akses libur hanya untuk mobile worker company_id = 3' });
  }
  next();
};

router.use(authenticate);
router.use(requireMobileWorker);

router.get('/today', getTodayOffDay);

export default router;
