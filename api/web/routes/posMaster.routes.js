import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import {
  listCategories,
  listServices,
  createService,
  updateService,
  listPromos,
  getPromoDetail,
  createPromo,
  updatePromo,
} from '../controllers/posMaster.controller.js';

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

router.get('/categories', listCategories);
router.get('/services', listServices);
router.post('/services', createService);
router.put('/services/:id', updateService);

router.get('/promos', listPromos);
router.get('/promos/:id', getPromoDetail);
router.post('/promos', createPromo);
router.put('/promos/:id', updatePromo);

export default router;
