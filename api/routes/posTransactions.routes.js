import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  createPosTransaction,
  getPosServices,
  getPosSummary,
  getPosTransactionDetail,
  getPosTransactions,
  getPosWorkers,
  sendPosCustomerNotification,
  sendPosGroupNotification,
  updatePosAssignments,
  updatePosTransactionStatus,
} from '../controllers/posTransactions.controller.js';

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

router.get('/summary', getPosSummary);
router.get('/services', getPosServices);
router.get('/workers', getPosWorkers);
router.get('/', getPosTransactions);
router.get('/:id', getPosTransactionDetail);
router.post('/', createPosTransaction);
router.patch('/:id/status', updatePosTransactionStatus);
router.patch('/:id/assignments', updatePosAssignments);
router.post('/:id/notify-group', sendPosGroupNotification);
router.post('/:id/notify-customer', sendPosCustomerNotification);

export default router;
