import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './api/routes/auth.routes.js';
import cleanoxByWaschenRoutes from './api/routes/cleanoxByWaschen.routes.js';
import cleanoxByWaschenProductionRoutes from './api/routes/cleanoxByWaschenProduction.routes.js';
import kpiRoutes from './api/routes/kpi.routes.js';
import evidanceRoutes from './api/routes/evidance.routes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ── API Routes ───────────────────────────────────────── */
app.use('/api/auth', authRoutes);
app.use('/api/cleanox-by-waschen', cleanoxByWaschenRoutes);
app.use('/api/cleanox-by-waschen-production', cleanoxByWaschenProductionRoutes);
app.use('/api/kpi', kpiRoutes);
app.use('/api/evidance', evidanceRoutes);

/* ── Serve built React app in production ─────────────── */
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀  Server running on http://localhost:${PORT}`);
});
