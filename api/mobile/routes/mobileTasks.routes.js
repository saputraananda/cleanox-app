import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import {
  acceptTask,
  advanceTakehomeStage,
  completeTask,
  deleteAssignmentPhoto,
  getMyTaskDetail,
  listMyTasks,
  listReplacementCandidates,
  listScheduleNotices,
  dismissScheduleNotice,
  getMyCalendar,
  rejectTask,
  serveTaskEvidenceFile,
  serveMobileCustomerPhoto,
  serveMobileTakehomeEvidenceFile,
  startTask,
  submitSurvey,
  submitSurveyExternal,
  taskEvidenceUploadMiddleware,
  takehomeStageUploadMiddleware,
  uploadAfterPhoto,
  uploadBeforePhoto,
  upsertItemWorkNote,
} from '../controllers/mobileTasks.controller.js';

const router = Router();

const requireMobileWorker = (req, res, next) => {
  if (req.user?.company_id !== 3) {
    return res.status(403).json({ message: 'Akses task hanya untuk mobile worker company_id = 3' });
  }
  next();
};

const handleEvidenceUpload = (req, res, next) => {
  taskEvidenceUploadMiddleware(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Ukuran foto evidence melebihi 5 MB'
        : err.message || 'Upload evidence gagal';
      return res.status(400).json({ message });
    }
    next();
  });
};

const handleTakehomeStageUpload = (req, res, next) => {
  takehomeStageUploadMiddleware(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Ukuran foto evidence melebihi 5 MB'
        : err.message || 'Upload stage take-home gagal';
      return res.status(400).json({ message });
    }
    next();
  });
};

router.get('/file/:filename', authenticate, requireMobileWorker, serveTaskEvidenceFile);
router.get('/customer-photo/:filename', authenticate, requireMobileWorker, serveMobileCustomerPhoto);
router.get('/takehome-file/:filename', authenticate, requireMobileWorker, serveMobileTakehomeEvidenceFile);

router.use(authenticate);
router.use(requireMobileWorker);

router.get('/', listMyTasks);
router.get('/calendar', getMyCalendar);
router.get('/notices', listScheduleNotices);
router.post('/notices/:noticeId/dismiss', dismissScheduleNotice);
router.get('/:assignmentId/replacement-candidates', listReplacementCandidates);
router.get('/:assignmentId', getMyTaskDetail);
router.post('/:assignmentId/accept', acceptTask);
router.post('/:assignmentId/reject', rejectTask);
router.post('/:assignmentId/start', handleEvidenceUpload, startTask);
router.post('/:assignmentId/before-photo', handleEvidenceUpload, uploadBeforePhoto);
router.post('/:assignmentId/after-photo', handleEvidenceUpload, uploadAfterPhoto);
router.post(
  '/:assignmentId/takehome-stages/:stage',
  handleTakehomeStageUpload,
  advanceTakehomeStage
);
router.delete('/:assignmentId/photos/:photoId', deleteAssignmentPhoto);
router.put('/:assignmentId/items/:itemId/work-note', upsertItemWorkNote);
router.post('/:assignmentId/survey', submitSurvey);
router.post('/:assignmentId/survey-external', submitSurveyExternal);
router.post('/:assignmentId/complete', completeTask);

export default router;
