import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import {
  createPosTransaction,
  getPosServices,
  getPosSummary,
  getPosTransactionDetail,
  getPosTransactions,
  getPosCalendar,
  getPosWorkers,
  sendPosCustomerNotification,
  sendPosGroupNotification,
  servePosTaskEvidenceFile,
  servePosCustomerPhoto,
  servePosPaymentProof,
  servePosTakehomeEvidenceFile,
  customerPhotoUploadMiddleware,
  paymentProofUploadMiddleware,
  takehomeEvidenceUploadMiddleware,
  uploadPosCustomerPhoto,
  deletePosCustomerPhoto,
  uploadPosPaymentProof,
  deletePosPaymentProof,
  updatePosTransactionPayment,
  updatePosAssignments,
  updatePosTransactionStatus,
  updatePosTransactionItemMeter,
  addPosTransactionItem,
  reschedulePosTransaction,
  cancelPosTransaction,
  updatePosTakehomeStage,
  clearPosTakehomeStage,
  uploadPosTakehomeStageEvidence,
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

const handleCustomerPhotoUpload = (req, res, next) => {
  customerPhotoUploadMiddleware(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Ukuran foto referensi melebihi 5 MB'
        : err.message || 'Upload foto referensi gagal';
      return res.status(400).json({ message });
    }
    next();
  });
};

const handlePaymentProofUpload = (req, res, next) => {
  paymentProofUploadMiddleware(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Ukuran bukti pembayaran melebihi 5 MB'
        : err.message || 'Upload bukti pembayaran gagal';
      return res.status(400).json({ message });
    }
    next();
  });
};

const handleTakehomeEvidenceUpload = (req, res, next) => {
  takehomeEvidenceUploadMiddleware(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Ukuran foto evidence melebihi 5 MB'
        : err.message || 'Upload evidence take-home gagal';
      return res.status(400).json({ message });
    }
    next();
  });
};

router.use(authenticate);
router.use(authorizePosAccess);

router.get('/summary', getPosSummary);
router.get('/services', getPosServices);
router.get('/workers', getPosWorkers);
router.get('/calendar', getPosCalendar);
router.get('/task-evidence/:filename', servePosTaskEvidenceFile);
router.get('/customer-photo/:filename', servePosCustomerPhoto);
router.get('/payment-proof/:filename', servePosPaymentProof);
router.get('/takehome-evidence/:filename', servePosTakehomeEvidenceFile);
router.get('/', getPosTransactions);
router.get('/:id', getPosTransactionDetail);
router.post('/', createPosTransaction);
router.patch('/:id/status', updatePosTransactionStatus);
router.patch('/:id/payment', updatePosTransactionPayment);
router.patch('/:id/items/:itemId/meter', updatePosTransactionItemMeter);
router.post('/:id/items', addPosTransactionItem);
router.patch('/:id/reschedule', reschedulePosTransaction);
router.patch('/:id/cancel', cancelPosTransaction);
router.patch('/:id/assignments', updatePosAssignments);
router.patch('/:id/takehome-stages/:stage', updatePosTakehomeStage);
router.post('/:id/takehome-stages/:stage/clear', clearPosTakehomeStage);
router.post(
  '/:id/takehome-stages/:stage/evidence',
  handleTakehomeEvidenceUpload,
  uploadPosTakehomeStageEvidence
);
router.post('/:id/customer-photos', handleCustomerPhotoUpload, uploadPosCustomerPhoto);
router.delete('/:id/customer-photos/:photoId', deletePosCustomerPhoto);
router.post('/:id/payment-proofs', handlePaymentProofUpload, uploadPosPaymentProof);
router.delete('/:id/payment-proofs/:photoId', deletePosPaymentProof);
router.post('/:id/notify-group', sendPosGroupNotification);
router.post('/:id/notify-customer', sendPosCustomerNotification);

export default router;
