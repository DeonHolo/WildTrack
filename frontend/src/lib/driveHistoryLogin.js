// A pending identity session can still consent or log out, but cannot open the app.
export function requiresDriveHistoryConsent(session) {
  return session?.authenticated === true
    && session.driveHistoryRequired === true
    && session.driveHistoryConnected !== true;
}

export function getSessionHome(session) {
  const roles = (session?.roles || []).map(role => String(role).toUpperCase());
  if (roles.includes('ADMIN')) return '/';
  if (roles.includes('ADVISER')) return '/adviser';
  return '/student';
}

export function getSafeDriveHistoryReturnTo(candidate, fallback = '/student') {
  const value = typeof candidate === 'object' && candidate !== null
    ? (candidate.pathname || '') + (candidate.search || '') : candidate;
  if (typeof value !== 'string' || value.length > 500) return safeFallback(fallback);
  try {
    const decoded = decodeURIComponent(value);
    const unsafeCharacter = [...decoded].some(character => (
      character === '\\' || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    ));
    if (!value.startsWith('/') || value.startsWith('//') || decoded.startsWith('//')
      || decoded.includes('%') || unsafeCharacter) return safeFallback(fallback);
    const url = new URL(value, 'https://wildtrack.invalid');
    if (url.origin !== 'https://wildtrack.invalid') return safeFallback(fallback);
    url.searchParams.delete('driveHistory');
    const destination = url.pathname + url.search;
    return destination.length <= 500 ? destination : safeFallback(fallback);
  } catch {
    return safeFallback(fallback);
  }
}

function safeFallback(fallback) {
  return fallback === '/student' ? '/student' : getSafeDriveHistoryReturnTo(fallback, '/student');
}

export function getGoogleSignInReturnTo(candidate, session) {
  const currentRoute = typeof window === 'undefined' ? '' : window.location.pathname + window.location.search;
  const destination = getSafeDriveHistoryReturnTo(candidate || currentRoute, getSessionHome(session));
  return ['/login', '/register'].includes(destination.split('?')[0]) ? getSessionHome(session) : destination;
}
