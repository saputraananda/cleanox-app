import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import { getKpiSummary, getKpiDetail, getAvailablePeriods, getSlaItems, exportSlaItems } from '../controllers/kpi.controller.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/summary',           getKpiSummary);
router.get('/detail',            getKpiDetail);
router.get('/available-periods', getAvailablePeriods);
router.get('/sla-items',         getSlaItems);
router.get('/sla-items/export',  exportSlaItems);

export default router;
