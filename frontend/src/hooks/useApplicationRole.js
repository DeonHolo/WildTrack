import { usePreviewRole } from './usePreviewRole.js';
import { useWorkflow } from '../app/WorkflowContext.jsx';

export const APPLICATION_ROLES = Object.freeze({
  ADMIN: 'admin',
  ADVISER: 'adviser',
  STUDENT: 'student',
  ANONYMOUS: 'anonymous'
});

export function useApplicationRole() {
  const previewRole = usePreviewRole();
  let workflow = null;
  try {
    workflow = useWorkflow();
  } catch {
    // outside workflow provider
  }

  if (import.meta.env.DEV) {
    return previewRole;
  }

  const session = workflow?.session;
  if (session?.authenticated) {
    const roles = (session.roles || []).map((r) => String(r).toUpperCase());
    if (roles.includes('ADMIN')) return APPLICATION_ROLES.ADMIN;
    if (roles.includes('ADVISER')) return APPLICATION_ROLES.ADVISER;
    return APPLICATION_ROLES.STUDENT;
  }

  if (workflow?.state?.activeAccountEmail) {
    return APPLICATION_ROLES.STUDENT;
  }

  return APPLICATION_ROLES.ANONYMOUS;
}

export function getRoleHome(role) {
  if (role === APPLICATION_ROLES.ADMIN) return '/';
  if (role === APPLICATION_ROLES.ADVISER) return '/adviser';
  if (role === APPLICATION_ROLES.STUDENT) return '/student';
  return '/login';
}
