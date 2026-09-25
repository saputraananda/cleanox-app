import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import {
  listBundles,
  getBundleDetail,
  createBundle,
  updateBundle,
  createBundlePurchase,
  listCustomerActiveBundles,
  listCustomerBundleInstances,
} from '../controllers/posBundles.controller.js';

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

router.get('/', listBundles);
router.get('/instances', listCustomerBundleInstances);
router.get('/customers/:customerId/active', listCustomerActiveBundles);
router.post('/purchases', createBundlePurchase);
router.get('/:id', getBundleDetail);
router.post('/', createBundle);
router.put('/:id', updateBundle);

export default router;
