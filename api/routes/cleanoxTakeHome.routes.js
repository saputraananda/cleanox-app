import { Router } from 'express';
import { authenticate, requireTakeHomeEditor } from '../middleware/auth.middleware.js';
import {
  getTakeHomeTransactions,
  getTakeHomeWorkers,
  getTakeHomeAvailablePeriods,
  serveTakeHomeEvidence,
  updateTakeHomeStage,
  clearTakeHomeStage,
  takeHomeUploadMiddleware,
} from '../controllers/cleanoxTakeHome.controller.js';

const router = Router();

// Evidence photo serving (publicly accessible for <img> tags & proxy cached)
router.get('/evidence/:filename', serveTakeHomeEvidence);

// Authenticated routes
router.use(authenticate);

// Available billing periods
router.get('/available-periods', getTakeHomeAvailablePeriods);

// Get Take Home transactions & workers
router.get('/', getTakeHomeTransactions);
router.get('/workers', getTakeHomeWorkers);

// Update stage & upload evidence (Strictly restricted to company_id = 1 and company_id = 3)
router.post(
  '/:id/stages/:stage',
  requireTakeHomeEditor,
  (req, res, next) => {
    takeHomeUploadMiddleware(req, res, (err) => {
      if (err) {
        const msg = err.code === 'LIMIT_FILE_SIZE'
          ? 'Ukuran foto maksimal 8 MB'
          : err.message || 'Gagal upload foto';
        return res.status(400).json({ message: msg });
      }
      next();
    });
  },
  updateTakeHomeStage
);

// Clear stage (Strictly restricted to company_id = 1 and company_id = 3)
router.post('/:id/stages/:stage/clear', requireTakeHomeEditor, clearTakeHomeStage);

export default router;
