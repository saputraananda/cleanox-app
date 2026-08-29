import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import {
  createPosCustomer,
  ensureLegacyCustomer,
  getPosCustomerDetail,
  getPosCustomers,
  getWaschenEmployees,
  getWaschenReferralBranches,
  patchPosCustomerAddress,
  updatePosCustomer,
} from '../controllers/posCustomers.controller.js';

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

router.get('/waschen-referral-branches', getWaschenReferralBranches);
router.get('/waschen-employees', getWaschenEmployees);
router.post('/ensure-legacy', ensureLegacyCustomer);
router.get('/', getPosCustomers);
router.get('/:id', getPosCustomerDetail);
router.post('/', createPosCustomer);
router.patch('/:id/address', patchPosCustomerAddress);
router.put('/:id', updatePosCustomer);

export default router;
