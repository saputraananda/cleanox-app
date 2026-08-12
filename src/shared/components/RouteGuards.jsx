import { Navigate } from 'react-router-dom';
import { isAuthenticated, getUser, getLandingRoute } from '@shared/utils/auth.js';

export const PrivateRoute = ({ children, roles, companyIds }) => {
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

export const PublicRoute = ({ children }) =>
  !isAuthenticated() ? children : <Navigate to={getLandingRoute()} replace />;
