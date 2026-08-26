import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import {
  getTodayMeal,
  getMySubmissions,
  createMeal,
  updateMeal,
  deleteMeal,
} from '../controllers/mobileMeal.controller.js';

const router = Router();

const requireMobileWorker = (req, res, next) => {
  if (req.user?.company_id !== 3) {
    return res.status(403).json({ message: 'Akses makan siang hanya untuk mobile worker company_id = 3' });
  }
  next();
};

router.use(authenticate);
router.use(requireMobileWorker);

router.get('/today', getTodayMeal);
router.get('/my-submissions', getMySubmissions);
router.post('/', createMeal);
router.put('/:id', updateMeal);
router.delete('/:id', deleteMeal);

export default router;
