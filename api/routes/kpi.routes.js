import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import { getKpiSummary, getKpiDetail, getAvailablePeriods, getSlaItems, exportSlaItems } from '../controllers/kpi.controller.js';

const router = Router();

// This endpoint is used by non-admin pages to populate the period selection filter
router.get('/available-periods', authenticate, getAvailablePeriods);

router.use(authenticate, requireAdmin);

router.get('/summary',           getKpiSummary);
router.get('/detail',            getKpiDetail);
router.get('/sla-items',         getSlaItems);
router.get('/sla-items/export',  exportSlaItems);

export default router;
