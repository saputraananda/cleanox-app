import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import {
  acceptAgendaTask,
  agendaEvidenceUploadMiddleware,
  completeAgendaTask,
  getMyAgendaTaskDetail,
  listMyAgendaTasks,
  serveAgendaArrivalFile,
  serveAgendaEvidenceFile,
  startAgendaTask,
  uploadAgendaItemPhoto,
} from '../controllers/mobileAgenda.controller.js';

const router = Router();

const requireMobileWorker = (req, res, next) => {
  if (req.user?.company_id !== 3) {
    return res.status(403).json({ message: 'Akses hanya untuk mobile worker company_id = 3' });
  }
  next();
};

const handleUpload = (req, res, next) => {
  agendaEvidenceUploadMiddleware(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Ukuran foto melebihi 5 MB'
          : err.message || 'Upload gagal';
      return res.status(400).json({ message });
    }
    next();
  });
};

router.get('/evidence/:filename', authenticate, requireMobileWorker, serveAgendaEvidenceFile);
router.get('/arrival/:filename', authenticate, requireMobileWorker, serveAgendaArrivalFile);

router.use(authenticate);
router.use(requireMobileWorker);

router.get('/', listMyAgendaTasks);
router.get('/:id', getMyAgendaTaskDetail);
router.post('/:id/accept', acceptAgendaTask);
router.post('/:id/start', handleUpload, startAgendaTask);
router.post('/:id/items/:itemId/:kind', handleUpload, uploadAgendaItemPhoto);
router.post('/:id/complete', completeAgendaTask);

export default router;
