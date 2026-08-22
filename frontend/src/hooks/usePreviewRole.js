import { useEffect, useState } from 'react';
import { browserStorageKeys, readStorageWithMigration } from '../lib/browserStorage.js';

const ROLE_KEY = browserStorageKeys.previewRole;
const ADVISER_KEY = browserStorageKeys.previewAdviser;
const ROLE_EVENT = 'wildtrack:preview-role-change';

export function getStoredPreviewRole() {
  const role = readStorageWithMigration(ROLE_KEY, '.v2.preview-role');
  return ['admin', 'adviser', 'student'].includes(role) ? role : 'admin';
}

export function setStoredPreviewRole(role) {
  const nextRole = ['admin', 'adviser', 'student'].includes(role) ? role : 'admin';
  localStorage.setItem(ROLE_KEY, nextRole);
  window.dispatchEvent(new CustomEvent(ROLE_EVENT, { detail: nextRole }));
}

export function usePreviewRole() {
  const [role, setRole] = useState(getStoredPreviewRole);

  useEffect(() => {
    function syncRole(event) {
      setRole(event?.detail || getStoredPreviewRole());
    }

    window.addEventListener(ROLE_EVENT, syncRole);
    window.addEventListener('storage', syncRole);
    return () => {
      window.removeEventListener(ROLE_EVENT, syncRole);
      window.removeEventListener('storage', syncRole);
    };
  }, []);

  return role;
}

export function getStoredPreviewAdviser() {
  return readStorageWithMigration(ADVISER_KEY, '.v2.preview-adviser') || '';
}

export function setStoredPreviewAdviser(adviserName) {
  localStorage.setItem(ADVISER_KEY, adviserName || '');
}
