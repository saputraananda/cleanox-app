import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getOutlets,
  getData,
  getEmployees,
  getTracking,
  updateTracking,
  clearTracking,
  updateCatatan,
  requestOnHold,
  decideCuciJemur,
  subscribeEvents,
  sendManualCustomerNotification,
  deleteItem,
  getNotaItemCount,
  getAvailablePeriods,
} from '../controllers/cleanoxByWaschenProduction.controller.js';

const router = Router();

/* SSE needs token from query param since EventSource can't set headers */
const authenticateSSE = (req, res, next) => {
  const token = req.query.token;
  if (!token) return res.status(401).end();
  try {
    req.user = jwt.verify(token, process.env.SESSION_SECRET);
    next();
  } catch {
    return res.status(401).end();
  }
};

router.get('/events', authenticateSSE, subscribeEvents);

router.use(authenticate);

router.get('/available-periods', getAvailablePeriods);
router.get('/outlets', getOutlets);
router.get('/employees', getEmployees);
router.get('/tracking', getTracking);
router.get('/', getData);
router.post('/tracking', updateTracking);
router.delete('/tracking', clearTracking);
router.patch('/catatan', updateCatatan);
router.patch('/on-hold', requestOnHold);
router.patch('/cuci-jemur/decision', decideCuciJemur);
router.post('/notify-customer', sendManualCustomerNotification);
router.delete('/item', deleteItem);
router.get('/nota-item-count', getNotaItemCount);

export default router;
