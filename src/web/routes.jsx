import { Route, Navigate, useParams } from 'react-router-dom';
import { PrivateRoute } from '@shared/components/RouteGuards.jsx';
import Layout from '@web/components/Layout.jsx';
import DashboardPage from '@web/pages/DashboardPage.jsx';
import CleanoxByWaschenProductionPage from '@web/pages/CleanoxByWaschenProductionPage.jsx';
import CleanoxOnlyCalendarPage from '@web/pages/CleanoxOnlyCalendarPage.jsx';
import CleanoxOnlyDashboardPage from '@web/pages/CleanoxOnlyDashboardPage.jsx';
import PosTransactionsPage from '@web/pages/PosTransactionsPage.jsx';
import PosTransactionCreatePage from '@web/pages/PosTransactionCreatePage.jsx';
import PosTransactionDetailPage from '@web/pages/PosTransactionDetailPage.jsx';
import PosCustomersPage from '@web/pages/PosCustomersPage.jsx';
import PosWaschenReferralPage from '@web/pages/PosWaschenReferralPage.jsx';
import PosPricesPage from '@web/pages/PosPricesPage.jsx';
import PosPromosPage from '@web/pages/PosPromosPage.jsx';

const RedirectPosDetail = () => {
  const { id } = useParams();
  return <Navigate to={`/cleanox-only/transactions/${id}`} replace />;
};

const webRoutes = [
  <Route
    key="dashboard"
    path="/dashboard"
    element={
      <PrivateRoute>
        <Layout>
          <DashboardPage />
        </Layout>
      </PrivateRoute>
    }
  />,
  <Route
    key="co-dashboard"
    path="/cleanox-only/dashboard"
    element={
      <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
        <Layout>
          <CleanoxOnlyDashboardPage />
        </Layout>
      </PrivateRoute>
    }
  />,
  <Route
    key="co-transactions"
    path="/cleanox-only/transactions"
    element={
      <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
        <Layout>
          <PosTransactionsPage />
        </Layout>
      </PrivateRoute>
    }
  />,
  <Route
    key="co-transactions-new"
    path="/cleanox-only/transactions/new"
    element={
      <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
        <Layout>
          <PosTransactionCreatePage />
        </Layout>
      </PrivateRoute>
    }
  />,
  <Route
    key="co-transactions-detail"
    path="/cleanox-only/transactions/:id"
    element={
      <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
        <Layout>
          <PosTransactionDetailPage />
        </Layout>
      </PrivateRoute>
    }
  />,
  <Route
    key="co-customers"
    path="/cleanox-only/customers"
    element={
      <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
        <Layout>
          <PosCustomersPage />
        </Layout>
      </PrivateRoute>
    }
  />,
  <Route
    key="co-referral"
    path="/cleanox-only/waschen-referral"
    element={
      <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
        <Layout>
          <PosWaschenReferralPage />
        </Layout>
      </PrivateRoute>
    }
  />,
  <Route
    key="co-prices"
    path="/cleanox-only/prices"
    element={
      <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
        <Layout>
          <PosPricesPage />
        </Layout>
      </PrivateRoute>
    }
  />,
  <Route
    key="co-promos"
    path="/cleanox-only/promos"
    element={
      <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
        <Layout>
          <PosPromosPage />
        </Layout>
      </PrivateRoute>
    }
  />,
  <Route
    key="co-calendar"
    path="/cleanox-only/calendar"
    element={
      <PrivateRoute roles={['admin', 'management']} companyIds={[1]}>
        <Layout>
          <CleanoxOnlyCalendarPage />
        </Layout>
      </PrivateRoute>
    }
  />,
  <Route
    key="cbw-dashboard"
    path="/cleanox-by-waschen/dashboard"
    element={
      <PrivateRoute>
        <Layout>
          <CleanoxByWaschenProductionPage />
        </Layout>
      </PrivateRoute>
    }
  />,
  <Route
    key="cbw-calendar-redirect"
    path="/cleanox-by-waschen/calendar"
    element={<Navigate to="/cleanox-only/calendar" replace />}
  />,
  <Route
    key="pos-redirect"
    path="/pos-transactions"
    element={<Navigate to="/cleanox-only/transactions" replace />}
  />,
  <Route
    key="pos-new-redirect"
    path="/pos-transactions/new"
    element={<Navigate to="/cleanox-only/transactions/new" replace />}
  />,
  <Route key="pos-detail-redirect" path="/pos-transactions/:id" element={<RedirectPosDetail />} />,
  <Route key="cleanox-redirect" path="/cleanox" element={<Navigate to="/cleanox-only/dashboard" replace />} />,
  <Route
    key="cbw-prod-redirect"
    path="/cleanox-by-waschen-production"
    element={<Navigate to="/cleanox-by-waschen/dashboard" replace />}
  />,
];

export default webRoutes;
