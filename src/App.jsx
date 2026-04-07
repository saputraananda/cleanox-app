import { Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated } from './utils/auth.js';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import CleanoxByWaschenPage from './pages/CleanoxByWaschenPage.jsx';
import Layout from './components/Layout.jsx';

const PrivateRoute = ({ children }) =>
  isAuthenticated() ? children : <Navigate to="/login" replace />;

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
          <PrivateRoute>
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
          <PrivateRoute>
            <Layout><CleanoxByWaschenPage /></Layout>
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
