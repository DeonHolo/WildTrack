import { Navigate } from 'react-router-dom';
import { getRoleHome, useApplicationRole } from '../hooks/useApplicationRole.js';
import { useWorkflow } from './WorkflowContext.jsx';

export function RoleBoundary({ allow, children }) {
  const role = useApplicationRole();
  let session = null;
  try {
    const workflow = useWorkflow();
    session = workflow?.session;
  } catch {
    // outside workflow context
  }

  // Avoid redirect flash while session authentication is resolving in production
  if (!import.meta.env.DEV && session === null) {
    return null;
  }

  return allow.includes(role) ? children : <Navigate to={getRoleHome(role)} replace />;
}
