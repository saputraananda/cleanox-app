import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './api/auth/routes/auth.routes.js';
import cleanoxByWaschenProductionRoutes from './api/web/routes/cleanoxByWaschenProduction.routes.js';
import evidanceRoutes from './api/web/routes/evidance.routes.js';
import dashboardCleanoxRoutes from './api/web/routes/DashboardCleanox.routes.js';
import posTransactionsRoutes from './api/web/routes/posTransactions.routes.js';
import posCustomersRoutes from './api/web/routes/posCustomers.routes.js';
import posMasterRoutes from './api/web/routes/posMaster.routes.js';
import posDashboardRoutes from './api/web/routes/posDashboard.routes.js';
import posWaschenReferralRoutes from './api/web/routes/posWaschenReferral.routes.js';
import wilayahRoutes from './api/web/routes/wilayah.routes.js';
import mobileAttendanceRoutes from './api/mobile/routes/mobileAttendance.routes.js';
import mobileTasksRoutes from './api/mobile/routes/mobileTasks.routes.js';
import mobileKebersihanRoutes from './api/mobile/routes/mobileKebersihan.routes.js';
import mobileRiwayatRoutes from './api/mobile/routes/mobileRiwayat.routes.js';
import mobileLeaveRoutes from './api/mobile/routes/mobileLeave.routes.js';
import mobileKasbonRoutes from './api/mobile/routes/mobileKasbon.routes.js';
import mobileOvertimeRoutes from './api/mobile/routes/mobileOvertime.routes.js';
import mobileMealRoutes from './api/mobile/routes/mobileMeal.routes.js';


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5175',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ── API Routes ───────────────────────────────────────── */
app.use('/api/auth', authRoutes);
app.use('/api/cleanox-by-waschen-production', cleanoxByWaschenProductionRoutes);
app.use('/api/evidance', evidanceRoutes);
app.use('/api/dashboard-cleanox', dashboardCleanoxRoutes);
app.use('/api/pos-transactions', posTransactionsRoutes);
app.use('/api/pos-customers', posCustomersRoutes);
app.use('/api/pos-master', posMasterRoutes);
app.use('/api/pos-dashboard', posDashboardRoutes);
app.use('/api/pos-waschen-referral', posWaschenReferralRoutes);
app.use('/api/wilayah', wilayahRoutes);
app.use('/api/mobile-attendance', mobileAttendanceRoutes);
app.use('/api/mobile-tasks', mobileTasksRoutes);
app.use('/api/mobile-kebersihan', mobileKebersihanRoutes);
app.use('/api/mobile-riwayat', mobileRiwayatRoutes);
app.use('/api/mobile-leave', mobileLeaveRoutes);
app.use('/api/mobile-kasbon', mobileKasbonRoutes);
app.use('/api/mobile-overtime', mobileOvertimeRoutes);
app.use('/api/mobile-meal', mobileMealRoutes);

/* ── Serve built React app in production ─────────────── */
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

const PORT = process.env.PORT || 6000;
app.listen(PORT, () => {
  console.log(`🚀  Server running on http://localhost:${PORT}`);
  console.log(`🌍  Mode: ${process.env.NODE_ENV || 'development (NODE_ENV not set)'}`);
});
