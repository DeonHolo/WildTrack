import { Navigate } from 'react-router-dom';
import { getRoleHome, useApplicationRole } from '../hooks/useApplicationRole.js';

export function RoleBoundary({ allow, children }) {
  const role = useApplicationRole();
  return allow.includes(role) ? children : <Navigate to={getRoleHome(role)} replace />;
}
