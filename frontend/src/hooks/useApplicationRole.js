import { usePreviewRole } from './usePreviewRole.js';

export const APPLICATION_ROLES = Object.freeze({
  ADMIN: 'admin',
  ADVISER: 'adviser',
  STUDENT: 'student'
});

export function useApplicationRole() {
  const previewRole = usePreviewRole();
  return import.meta.env.DEV ? previewRole : APPLICATION_ROLES.ADMIN;
}

export function getRoleHome(role) {
  if (role === APPLICATION_ROLES.ADVISER) return '/adviser';
  if (role === APPLICATION_ROLES.STUDENT) return '/student';
  return '/';
}
