import { Container, Loader, Text } from '@mantine/core';
import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useWorkspaceSession } from '../../app/WorkspaceSession.jsx';
import { getGoogleSignInReturnTo, requiresDriveHistoryConsent } from '../../lib/driveHistoryLogin.js';

/** Private routes stay unmounted until identity and required Drive access are verified. */
export function DriveHistoryLoginGate({ children }) {
  const { session, sessionStatus } = useWorkspaceSession();
  const location = useLocation();
  const navigate = useNavigate();
  const isSignInRoute = ['/login', '/register'].includes(location.pathname);
  const pending = requiresDriveHistoryConsent(session);
  const publicForm = /^\/(?:w\/[^/]+\/)?submit\/[^/]+\/?$/.test(location.pathname);
  const anonymousPrivateRoute = sessionStatus === 'ready' && session?.authenticated === false
    && !publicForm && !isSignInRoute && (session.driveHistoryRequired === true || !import.meta.env.DEV);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    if (isSignInRoute || session?.driveHistoryRequired !== true || session?.driveHistoryConnected !== true || query.get('driveHistory') !== 'connected') return;
    query.delete('driveHistory');
    navigate({ pathname: location.pathname, search: query.toString() ? `?${query}` : '' }, { replace: true, state: location.state });
  }, [isSignInRoute, session?.driveHistoryRequired, session?.driveHistoryConnected, location.pathname, location.search, location.state, navigate]);

  const loginCallback = new URLSearchParams(location.search);
  if (isSignInRoute && session?.authenticated && session.driveHistoryRequired === true
    && session.driveHistoryConnected === true && loginCallback.get('driveHistory') === 'connected') {
    return <Navigate to={getGoogleSignInReturnTo(location.state?.from || loginCallback.get('returnTo'), session)} replace />;
  }

  if ((pending || sessionStatus === 'error' || anonymousPrivateRoute) && !isSignInRoute) {
    const from = getGoogleSignInReturnTo(location, session);
    const query = new URLSearchParams({ returnTo: from });
    const outcome = new URLSearchParams(location.search).get('driveHistory');
    if (['declined', 'error', 'unavailable'].includes(outcome)) query.set('driveHistory', outcome);
    return <Navigate to={`/login?${query}`} replace state={{ from }} />;
  }
  // Keep the ordinary login mounted while its optional credential verifies.
  if (isSignInRoute && (session !== null || sessionStatus === 'error')) return children;
  // Public form metadata can load while its submission controls wait for identity.
  if (!publicForm && (session === null || sessionStatus === 'loading')) {
    return <Container size="sm" py="xl"><Text role="status"><Loader size="xs" mr="xs" />Checking Google sign-in…</Text></Container>;
  }
  return children;
}
