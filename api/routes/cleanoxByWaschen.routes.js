import { Router } from 'express';
import { getData, getOutlets } from '../controllers/cleanoxByWaschen.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/outlets', authenticate, getOutlets);
router.get('/', authenticate, getData);

export default router;
