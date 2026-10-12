import { Alert, Button, Container, Paper, Stack, Text, Title } from '@mantine/core';
import { LockSimple, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { GoogleSignInButton } from '../components/auth/GoogleSignInButton.jsx';
import { FormArtwork } from '../components/public/FormArtwork.jsx';
import { STUDENT_ARTWORK } from '../lib/studentArtwork.js';
import { getGoogleSignInReturnTo } from '../lib/driveHistoryLogin.js';

export function RegisterPage() {
  const { session, sessionStatus, sessionError, refreshSession, logoutStudentAccount } = useWorkspaceSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const [callbackResult, setCallbackResult] = useState(() => new URLSearchParams(location.search).get('driveHistory') || '');
  const returnTo = location.state?.from || new URLSearchParams(location.search).get('returnTo');
  const callbackError = callbackResult === 'declined'
    ? 'Google sign-in was canceled or the required permission was not granted. You can try again.'
    : callbackResult === 'unavailable'
      ? 'Google sign-in is temporarily unavailable. Please try again later.'
      : callbackResult === 'error' ? 'Google sign-in could not be completed. Please try again.' : '';
  const shownError = error || sessionError || callbackError;

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const outcome = query.get('driveHistory');
    if (!outcome) return;
    setCallbackResult(outcome);
    query.delete('driveHistory');
    navigate({ pathname: location.pathname, search: query.toString() ? `?${query}` : '' }, { replace: true, state: location.state });
  }, [location.pathname, location.search, location.state, navigate]);

  async function finishGoogleSignIn(identity, verifiedSession) {
    setError('');
    try {
      const sessionData = verifiedSession || await refreshSession();
      if (!sessionData?.authenticated) throw new Error('Your WildTrack session could not be loaded.');
      navigate(getGoogleSignInReturnTo(returnTo, sessionData), { replace: true });
    } catch (failure) {
      setError(failure?.message || 'Your WildTrack session could not be loaded.');
    }
  }

  return (
    <main className="wt-student-access-page">
      <Container size="sm" className="wt-student-access-container">
        <Stack gap="md">
          <FormArtwork artwork={STUDENT_ARTWORK.loginHero} mascotClassName="wt-login-hero-mascot" ariaLabel="WildTrack sign in banner">
            <div className="wt-login-banner-copy">
              <Title order={1} className="wt-login-banner-title">Welcome to WildTrack</Title>
              <Text className="wt-login-banner-subtitle">Access your capstone workspace, submit deliverables, and track adviser feedback.</Text>
            </div>
          </FormArtwork>
          <Paper className="wt-form-surface wt-login-surface" radius="md" p={{ base: 'xl', sm: 36 }}>
            <Stack gap="lg" align="center" ta="center">
              <div className="wt-login-surface-intro">
                <Title order={2} size="h3" className="wt-login-surface-title">Sign in with Google</Title>
                <Text size="sm" c="dimmed" className="wt-login-surface-desc">Choose your account to connect to your student or faculty workspace.</Text>
              </div>
              <div className="wt-google-access-action">
                {sessionStatus === 'error' ? <Button onClick={() => refreshSession()}>Retry sign-in check</Button> : (
                  <GoogleSignInButton enableOneTap={!callbackError} autoSelect={!callbackError} returnTo={returnTo} onAuthenticated={finishGoogleSignIn} />
                )}
              </div>
              {shownError ? (
                <Alert className="wt-google-access-error" color="red" variant="light" icon={<WarningCircle size={19} />} role="alert">
                  {shownError}
                </Alert>
              ) : null}
              {session?.authenticated && session?.driveHistoryRequired && !session?.driveHistoryConnected ? (
                <Button variant="subtle" onClick={async () => {
                  try { await logoutStudentAccount(); } catch (failure) { setError(failure?.message || 'Sign-out could not be completed.'); }
                }}>Cancel sign-in</Button>
              ) : null}
              <div className="wt-login-footer-note">
                <LockSimple size={15} weight="bold" />
                <span>WildTrack securely identifies submissions using Google Identity Services.</span>
              </div>
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </main>
  );
}
