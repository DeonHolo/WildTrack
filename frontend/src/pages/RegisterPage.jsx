import { Alert, Container, Paper, Stack, Text, Title } from '@mantine/core';
import { LockSimple, WarningCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { GoogleSignInButton } from '../components/auth/GoogleSignInButton.jsx';
import { FormArtwork } from '../components/public/FormArtwork.jsx';
import { STUDENT_ARTWORK } from '../lib/studentArtwork.js';

export function RegisterPage() {
  const { refreshSession } = useWorkspaceSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');

  async function finishGoogleSignIn() {
    setError('');
    try {
      const sessionData = await refreshSession();
      const roles = (sessionData?.roles || []).map((r) => String(r).toUpperCase());
      if (roles.includes('ADMIN')) {
        navigate(location.state?.from || '/', { replace: true });
        return;
      }
      if (roles.includes('ADVISER')) {
        navigate(location.state?.from || '/adviser', { replace: true });
        return;
      }
    } catch (error) {
      setError(error?.message || 'Your WildTrack session could not be loaded.');
      return;
    }
    navigate(location.state?.from || '/student', { replace: true });
  }

  return (
    <main className="wt-student-access-page">
      <Container size="sm" className="wt-student-access-container">
        <Stack gap="md">
          <FormArtwork artwork={STUDENT_ARTWORK.loginHero} ariaLabel="WildTrack sign in banner">
            <div className="wt-login-banner-copy">
              <Title order={1} className="wt-login-banner-title">Welcome to WildTrack</Title>
              <Text className="wt-login-banner-subtitle">
                Access your capstone workspace, submit deliverables, and track adviser feedback.
              </Text>
            </div>
          </FormArtwork>

          <Paper className="wt-form-surface wt-login-surface" radius="md" p={{ base: 'xl', sm: 36 }}>
            <Stack gap="lg" align="center" ta="center">
              <div className="wt-login-surface-intro">
                <Title order={2} size="h3" className="wt-login-surface-title">
                  Sign in with Google
                </Title>
                <Text size="sm" c="dimmed" className="wt-login-surface-desc">
                  Choose your account to connect to your student or faculty workspace.
                </Text>
              </div>

              <div className="wt-google-access-action">
                <GoogleSignInButton enableOneTap autoSelect onAuthenticated={finishGoogleSignIn} />
              </div>

              {error ? (
                <Alert
                  className="wt-google-access-error"
                  color="red"
                  variant="light"
                  icon={<WarningCircle size={19} />}
                  role="alert"
                >
                  {error}
                </Alert>
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
