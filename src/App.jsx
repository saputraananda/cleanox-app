import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { isAuthenticated, getUser, getLandingRoute } from './utils/auth.js';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import CleanoxByWaschenProductionPage from './pages/CleanoxByWaschenProductionPage.jsx';
import CleanoxOnlyCalendarPage from './pages/CleanoxOnlyCalendarPage.jsx';
import CleanoxOnlyDashboardPage from './pages/CleanoxOnlyDashboardPage.jsx';
import PosTransactionsPage from './pages/PosTransactionsPage.jsx';
import PosTransactionCreatePage from './pages/PosTransactionCreatePage.jsx';
import PosTransactionDetailPage from './pages/PosTransactionDetailPage.jsx';
import PosCustomersPage from './pages/PosCustomersPage.jsx';
import PosWaschenReferralPage from './pages/PosWaschenReferralPage.jsx';
import PosPricesPage from './pages/PosPricesPage.jsx';
import PosPromosPage from './pages/PosPromosPage.jsx';
import MobileWorkerHomePage from './pages/MobileWorkerHomePage.jsx';
import MobileWorkerAttendancePage from './pages/MobileWorkerAttendancePage.jsx';
import MobileWorkerTasksPage from './pages/MobileWorkerTasksPage.jsx';
import MobileWorkerTaskSurveyPage from './pages/MobileWorkerTaskSurveyPage.jsx';
import MobileWorkerKebersihanPage from './pages/MobileWorkerKebersihanPage.jsx';
import MobileWorkerProfilePage from './pages/MobileWorkerProfilePage.jsx';
import MobileWorkerRiwayatPage from './pages/MobileWorkerRiwayatPage.jsx';
import MobileWorkerCalendarPage from './pages/MobileWorkerCalendarPage.jsx';
import Layout from './components/Layout.jsx';

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

const RedirectPosDetail = () => {
  const { id } = useParams();
  return <Navigate to={`/cleanox-only/transactions/${id}`} replace />;
};

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
            <MobileWorkerHomePage />
          </PrivateRoute>
        }
      />
      <Route
        path="/mobile-worker/attendance"
        element={
          <PrivateRoute companyIds={[3]}>
            <MobileWorkerAttendancePage />
          </PrivateRoute>
        }
      />
      <Route
        path="/mobile-worker/tasks"
        element={
          <PrivateRoute companyIds={[3]}>
            <MobileWorkerTasksPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/mobile-worker/tasks/:assignmentId/survey"
        element={
          <PrivateRoute companyIds={[3]}>
            <MobileWorkerTaskSurveyPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/mobile-worker/kebersihan"
        element={
          <PrivateRoute companyIds={[3]}>
            <MobileWorkerKebersihanPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/mobile-worker/calendar"
        element={
          <PrivateRoute companyIds={[3]}>
            <MobileWorkerCalendarPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/mobile-worker/profile"
        element={
          <PrivateRoute companyIds={[3]}>
            <MobileWorkerProfilePage />
          </PrivateRoute>
        }
      />
      <Route
        path="/mobile-worker/riwayat"
        element={
          <PrivateRoute companyIds={[3]}>
            <MobileWorkerRiwayatPage />
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
        path="/cleanox-only/dashboard"
        element={
          <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
            <Layout>
              <CleanoxOnlyDashboardPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/cleanox-only/transactions"
        element={
          <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
            <Layout>
              <PosTransactionsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/cleanox-only/transactions/new"
        element={
          <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
            <Layout>
              <PosTransactionCreatePage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/cleanox-only/transactions/:id"
        element={
          <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
            <Layout>
              <PosTransactionDetailPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/cleanox-only/customers"
        element={
          <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
            <Layout>
              <PosCustomersPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/cleanox-only/waschen-referral"
        element={
          <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
            <Layout>
              <PosWaschenReferralPage />
            </Layout>
          </PrivateRoute>
        }
      />

      <Route
        path="/cleanox-only/prices"
        element={
          <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
            <Layout>
              <PosPricesPage />
            </Layout>
          </PrivateRoute>
        }
      />

      <Route
        path="/cleanox-only/promos"
        element={
          <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
            <Layout>
              <PosPromosPage />
            </Layout>
          </PrivateRoute>
        }
      />

      <Route
        path="/cleanox-only/calendar"
        element={
          <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
            <Layout>
              <CleanoxOnlyCalendarPage />
            </Layout>
          </PrivateRoute>
        }
      />

      <Route
        path="/cleanox-by-waschen/dashboard"
        element={
          <PrivateRoute>
            <Layout>
              <CleanoxByWaschenProductionPage />
            </Layout>
          </PrivateRoute>
        }
      />

      <Route path="/cleanox-by-waschen/calendar" element={<Navigate to="/cleanox-only/calendar" replace />} />

      <Route path="/pos-transactions" element={<Navigate to="/cleanox-only/transactions" replace />} />
      <Route path="/pos-transactions/new" element={<Navigate to="/cleanox-only/transactions/new" replace />} />
      <Route path="/pos-transactions/:id" element={<RedirectPosDetail />} />
      <Route path="/cleanox" element={<Navigate to="/cleanox-only/dashboard" replace />} />
      <Route
        path="/cleanox-by-waschen-production"
        element={<Navigate to="/cleanox-by-waschen/dashboard" replace />}
      />

      <Route path="*" element={<Navigate to={getLandingRoute()} replace />} />
    </Routes>
  );
}
