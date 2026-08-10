import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getWaschenReferralLeaderboard } from '../controllers/posWaschenReferral.controller.js';

const router = Router();

const authorizePosAccess = (req, res, next) => {
  const role = req.user?.role;
  const isManagement = req.user?.isManagement;
  const companyId = req.user?.company_id;

  if (companyId !== 1 && !isManagement) {
    return res.status(403).json({ message: 'Akses POS hanya untuk company_id = 1' });
  }

  if (['admin', 'management'].includes(role) || isManagement) {
    return next();
  }

  return res.status(403).json({ message: 'Akses ditolak: hanya admin atau management' });
};

router.use(authenticate);
router.use(authorizePosAccess);

router.get('/leaderboard', getWaschenReferralLeaderboard);

export default router;
