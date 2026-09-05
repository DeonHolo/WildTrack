import { Navigate } from 'react-router-dom';
import { getRoleHome, useApplicationRole } from '../hooks/useApplicationRole.js';
import { useWorkspaceSession } from './WorkspaceSession.jsx';

export function RoleBoundary({ allow, children }) {
  const role = useApplicationRole();
  let workspaceSession = null;
  try {
    workspaceSession = useWorkspaceSession();
  } catch {
    // outside workspace session boundary
  }
  const session = workspaceSession?.session;

  if (!import.meta.env.DEV && workspaceSession?.sessionStatus === 'error') {
    return <div role="alert">{workspaceSession.sessionError || 'Session could not be loaded.'}</div>;
  }

  // Avoid redirect flash while session authentication is resolving in production
  if (!import.meta.env.DEV && (workspaceSession?.sessionStatus === 'loading' || session === null)) {
    return null;
  }

  return allow.includes(role) ? children : <Navigate to={getRoleHome(role)} replace />;
}
