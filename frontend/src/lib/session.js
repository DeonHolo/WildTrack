const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'X-XSRF-TOKEN';

function readCookie(name) {
  const match = document.cookie.split('; ').find((row) => row.startsWith(name + '='));
  return match ? decodeURIComponent(match.substring(name.length + 1)) : null;
}

export function getCsrfToken() {
  return readCookie(CSRF_COOKIE);
}

export async function fetchCurrentSession() {
  const response = await fetch(getApiBase() + '/auth/session', {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) return { authenticated: false };
  return response.json();
}

export async function logoutSession() {
  const response = await fetch(getApiBase() + '/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(getCsrfToken() ? { [CSRF_HEADER]: getCsrfToken() } : {})
    }
  });
  return response.ok;
}

function getApiBase() {
  // Avoids circular import with api.js; mirrors its base URL logic.
  return (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080/api').replace(/\/+$/, '');
}

