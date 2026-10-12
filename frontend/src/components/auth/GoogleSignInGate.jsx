import { Container, Loader, Text } from '@mantine/core';
import { Navigate, useLocation } from 'react-router-dom';
import { useWorkspaceSession } from '../../app/WorkspaceSession.jsx';
import { getGoogleSignInReturnTo } from '../../lib/googleSignIn.js';
import { isPublicInformationPath } from '../../lib/publicInformation.js';

export function GoogleSignInGate({ children }) {
  const { session, sessionStatus } = useWorkspaceSession();
  const location = useLocation();
  const isSignInRoute = ['/login', '/register'].includes(location.pathname);
  const publicForm = /^\/(?:w\/[^/]+\/)?submit\/[^/]+\/?$/.test(location.pathname);
  const publicInformation = isPublicInformationPath(location.pathname);
  const anonymousPrivateRoute = sessionStatus === 'ready' && session?.authenticated === false
    && !publicForm && !publicInformation && !isSignInRoute && !import.meta.env.DEV;

  if ((sessionStatus === 'error' || anonymousPrivateRoute) && !isSignInRoute && !publicInformation) {
    const from = getGoogleSignInReturnTo(location, session);
    return <Navigate to={`/login?${new URLSearchParams({ returnTo: from })}`} replace state={{ from }} />;
  }
  // Keep sign-in mounted while an ordinary credential or session refresh completes.
  if (isSignInRoute && (session !== null || sessionStatus === 'error')) return children;
  if (!publicForm && !publicInformation && (session === null || sessionStatus === 'loading')) {
    return <Container size="sm" py="xl"><Text role="status"><Loader size="xs" mr="xs" />Checking Google sign-in…</Text></Container>;
  }
  return children;
}
