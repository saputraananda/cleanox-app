import { Routes, Route, Navigate } from 'react-router-dom';
import { getLandingRoute } from '@shared/utils/auth.js';
import sharedAuthRoutes from '@shared/routes.jsx';
import mobileRoutes from '@mobile/routes.jsx';
import webRoutes from '@web/routes.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={getLandingRoute()} replace />} />
      {sharedAuthRoutes}
      {mobileRoutes}
      {webRoutes}
      <Route path="*" element={<Navigate to={getLandingRoute()} replace />} />
    </Routes>
  );
}
