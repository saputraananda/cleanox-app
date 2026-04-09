import { Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated, getUser } from './utils/auth.js';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import CleanoxByWaschenPage from './pages/CleanoxByWaschenPage.jsx';
import CleanoxByWaschenProductionPage from './pages/CleanoxByWaschenProductionPage.jsx';
import UserManagementPage from './pages/UserManagementPage.jsx';
import AuditLoginPage from './pages/AuditLoginPage.jsx';
import KpiProduksiPage from './pages/KpiProduksiPage.jsx';
import Layout from './components/Layout.jsx';

const PrivateRoute = ({ children, roles }) => {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  if (roles) {
    const user = getUser();
    if (!roles.includes(user?.role)) return <Navigate to="/dashboard" replace />;
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
          <PrivateRoute roles={['admin']}>
            <Layout>
              <div className="p-8 text-center">
                <p className="text-2xl font-bold text-gray-700">Cleanox</p>
                <p className="text-gray-400 mt-2">Coming soon…</p>
              </div>
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/cleanox-by-waschen"
        element={
          <PrivateRoute roles={['admin']}>
            <Layout><CleanoxByWaschenPage /></Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/cleanox-by-waschen-production"
        element={
          <PrivateRoute>
            <Layout><CleanoxByWaschenProductionPage /></Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/users"
        element={
          <PrivateRoute roles={['admin']}>
            <Layout><UserManagementPage /></Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/audit-login"
        element={
          <PrivateRoute roles={['admin']}>
            <Layout><AuditLoginPage /></Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/kpi-produksi"
        element={
          <PrivateRoute roles={['admin']}>
            <Layout><KpiProduksiPage /></Layout>
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
