import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import {
  activityPhotoUploadMiddleware,
  cancelAgenda,
  createAgenda,
  deleteAgendaActivityPhoto,
  getAgendaDetail,
  getAgendaSummary,
  getAgendaWorkers,
  listAgendas,
  scheduleAgenda,
  serveAgendaActivityPhoto,
  uploadAgendaActivityPhotos,
} from '../controllers/posAgenda.controller.js';

const router = Router();

const authorizePosAccess = (req, res, next) => {
  const role = req.user?.role;
  const isManagement = req.user?.isManagement;
  const companyId = req.user?.company_id;

  if (companyId !== 1 && !isManagement) {
    return res.status(403).json({ message: 'Akses Agenda hanya untuk company_id = 1' });
  }

  if (['admin', 'management'].includes(role) || isManagement) {
    return next();
  }

  return res.status(403).json({ message: 'Akses ditolak: hanya admin atau management' });
};

const handleActivityUpload = (req, res, next) => {
  activityPhotoUploadMiddleware(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Ukuran foto kegiatan melebihi 5 MB'
          : err.message || 'Upload foto kegiatan gagal';
      return res.status(400).json({ message });
    }
    next();
  });
};

router.get('/activity-photo/:filename', authenticate, authorizePosAccess, serveAgendaActivityPhoto);

router.use(authenticate);
router.use(authorizePosAccess);

router.get('/workers', getAgendaWorkers);
router.get('/summary', getAgendaSummary);
router.get('/', listAgendas);
router.post('/', createAgenda);
router.get('/:id', getAgendaDetail);
router.post('/:id/schedule', scheduleAgenda);
router.post('/:id/cancel', cancelAgenda);
router.post('/:id/activity-photos', handleActivityUpload, uploadAgendaActivityPhotos);
router.delete('/:id/activity-photos/:photoId', deleteAgendaActivityPhoto);

export default router;
