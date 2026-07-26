import { useEffect, useState } from 'react';

const ROLE_KEY = 'capvault.v2.preview-role';
const ADVISER_KEY = 'capvault.v2.preview-adviser';
const ROLE_EVENT = 'capvault:preview-role-change';

export function getStoredPreviewRole() {
  const role = localStorage.getItem(ROLE_KEY);
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
  return localStorage.getItem(ADVISER_KEY) || '';
}

export function setStoredPreviewAdviser(adviserName) {
  localStorage.setItem(ADVISER_KEY, adviserName || '');
}
