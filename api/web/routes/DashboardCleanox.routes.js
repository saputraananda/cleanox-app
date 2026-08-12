import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import {
    getAvailablePeriods,
    getDashboardData,
} from '../controllers/DashboardCleanox.controller.js';

const router = Router();

// Middleware to authorize admin, management, and produksi roles
const authorizeDashboardAccess = (req, res, next) => {
    const role = req.user?.role;
    const isManagement = req.user?.isManagement;
    const allowedRoles = ['admin', 'management', 'produksi'];

    if (allowedRoles.includes(role) || isManagement) {
        next();
    } else {
        return res.status(403).json({ message: 'Akses ditolak: Hanya admin, management, dan produksi yang dapat mengakses data ini.' });
    }
};

router.use(authenticate);
router.use(authorizeDashboardAccess);

router.get('/available-periods', getAvailablePeriods);
router.get('/data', getDashboardData);

export default router;
