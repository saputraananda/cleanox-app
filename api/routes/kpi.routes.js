import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import { getKpiSummary, getKpiDetail } from '../controllers/kpi.controller.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/summary', getKpiSummary);
router.get('/detail',  getKpiDetail);

export default router;
