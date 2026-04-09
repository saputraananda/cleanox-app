import { Router } from 'express';
import { register, login, logout, getMe, getUsers, createUser, updateUser, deleteUser, getAuditLog } from '../controllers/auth.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);

/* ── User Management (admin only) ────────────────────── */
router.get('/users', authenticate, requireAdmin, getUsers);
router.post('/users', authenticate, requireAdmin, createUser);
router.put('/users/:id', authenticate, requireAdmin, updateUser);
router.delete('/users/:id', authenticate, requireAdmin, deleteUser);

/* ── Audit Log (admin only) ──────────────────────────── */
router.get('/audit-login', authenticate, requireAdmin, getAuditLog);

export default router;
