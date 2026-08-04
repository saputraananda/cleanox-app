import { Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated, getUser, getLandingRoute } from './utils/auth.js';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import CleanoxByWaschenProductionPage from './pages/CleanoxByWaschenProductionPage.jsx';
import PosTransactionsPage from './pages/PosTransactionsPage.jsx';
import PosTransactionCreatePage from './pages/PosTransactionCreatePage.jsx';
import PosTransactionDetailPage from './pages/PosTransactionDetailPage.jsx';
import Layout from './components/Layout.jsx';

const MobileWorkerShell = () => (
  <div className="min-h-[100dvh] bg-slate-100 flex items-center justify-center px-6">
    <div className="w-full max-w-md rounded-3xl bg-white shadow-sm border border-slate-200 p-8 text-center">
      <p className="text-sm font-semibold tracking-[0.2em] uppercase text-brand-500">Company ID 3</p>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Mobile Worker</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        Jalur mobile worker sudah aktif di auth. Halaman fitur attendance, task, dan kebersihan akan disambungkan pada fase berikutnya.
      </p>
    </div>
  </div>
);

const PrivateRoute = ({ children, roles, companyIds }) => {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;

  const user = getUser();

  if (companyIds?.length > 0 && !companyIds.includes(user?.company_id)) {
    return <Navigate to={getLandingRoute(user)} replace />;
  }

  if (roles) {
    const hasRole = roles.includes(user?.role) || (roles.includes('management') && user?.isManagement);
    if (!hasRole) return <Navigate to={getLandingRoute(user)} replace />;
  }
  return children;
};

const PublicRoute = ({ children }) =>
  !isAuthenticated() ? children : <Navigate to={getLandingRoute()} replace />;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={getLandingRoute()} replace />} />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />
      <Route
        path="/mobile-worker"
        element={
          <PrivateRoute companyIds={[3]}>
            <MobileWorkerShell />
          </PrivateRoute>
        }
      />
      <Route
        path="/pos-transactions"
        element={
          <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
            <Layout>
              <PosTransactionsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/pos-transactions/new"
        element={
          <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
            <Layout>
              <PosTransactionCreatePage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/pos-transactions/:id"
        element={
          <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
            <Layout>
              <PosTransactionDetailPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Layout>
              <DashboardPage />
            </Layout>
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

      <Route path="*" element={<Navigate to={getLandingRoute()} replace />} />
    </Routes>
  );
}
