import { Route } from 'react-router-dom';
import { PublicRoute } from '@shared/components/RouteGuards.jsx';
import LoginPage from '@shared/pages/LoginPage.jsx';
import RegisterPage from '@shared/pages/RegisterPage.jsx';

const sharedAuthRoutes = [
  <Route
    key="login"
    path="/login"
    element={
      <PublicRoute>
        <LoginPage />
      </PublicRoute>
    }
  />,
  <Route
    key="register"
    path="/register"
    element={
      <PublicRoute>
        <RegisterPage />
      </PublicRoute>
    }
  />,
];

export default sharedAuthRoutes;
