import { Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated, getUser } from './utils/auth.js';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import CleanoxByWaschenProductionPage from './pages/CleanoxByWaschenProductionPage.jsx';
import KpiProduksiPage from './pages/KpiProduksiPage.jsx';
import Layout from './components/Layout.jsx';

const PrivateRoute = ({ children, roles }) => {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  if (roles) {
    const user = getUser();
    const hasRole = roles.includes(user?.role) || (roles.includes('management') && user?.isManagement);
    if (!hasRole) return <Navigate to="/dashboard" replace />;
  }
  return children;
};

const PublicRoute = ({ children }) =>
  !isAuthenticated() ? children : <Navigate to="/dashboard" replace />;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/login"
        element={<PublicRoute><LoginPage /></PublicRoute>}
      />
      <Route
        path="/register"
        element={<PublicRoute><RegisterPage /></PublicRoute>}
      />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Layout><DashboardPage /></Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/cleanox"
        element={
          <PrivateRoute roles={['admin', 'management']}>
            <Layout>
              <div className="p-8 text-center">
                <p className="text-2xl font-bold text-gray-700">Cleanox</p>
                <p className="text-gray-400 mt-2">Coming soon…</p>
              </div>
            </Layout>
          </PrivateRoute>
        }
      />
      {/* (hapus) dulu ada /cleanox-by-waschen */}
      <Route
        path="/cleanox-by-waschen-production"
        element={
          <PrivateRoute>
            <Layout><CleanoxByWaschenProductionPage /></Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/kpi-produksi"
        element={
          <PrivateRoute roles={['admin', 'management']}>
            <Layout><KpiProduksiPage /></Layout>
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
