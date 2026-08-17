import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import {
  proofUploadMiddleware,
  serveProof,
  getMySubmissions,
  getKasbonDetail,
  submitKasbon,
  updateKasbon,
  deleteKasbon,
} from '../controllers/mobileKasbon.controller.js';

const router = Router();

const requireMobileWorker = (req, res, next) => {
  if (req.user?.company_id !== 3) {
    return res.status(403).json({ message: 'Akses kasbon hanya untuk mobile worker company_id = 3' });
  }
  next();
};

const handleUpload = (req, res, next) => {
  proofUploadMiddleware(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Ukuran foto bukti melebihi 5 MB'
        : err.message || 'Upload bukti gagal';
      return res.status(400).json({ message });
    }
    next();
  });
};

router.get('/proofs/:filename', authenticate, requireMobileWorker, serveProof);

router.use(authenticate);
router.use(requireMobileWorker);

router.get('/my-submissions', getMySubmissions);
router.get('/:id', getKasbonDetail);
router.post('/', handleUpload, submitKasbon);
router.put('/:id', handleUpload, updateKasbon);
router.delete('/:id', deleteKasbon);

export default router;
