import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getOutlets,
  getData,
  updateStatus,
  subscribeEvents,
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

router.get('/outlets', getOutlets);
router.get('/', getData);
router.patch('/:no_nota/status', updateStatus);

export default router;
