import { Alert, Box, Container, Paper, Stack, Text, Title } from '@mantine/core';
import { LockSimple, WarningCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWorkflow } from '../app/WorkflowContext.jsx';
import { getCurrentSession } from '../lib/api.js';
import { GoogleSignInButton } from '../components/auth/GoogleSignInButton.jsx';
import { STUDENT_ARTWORK } from '../lib/studentArtwork.js';

export function RegisterPage() {
  const { authenticateGoogleAccount } = useWorkflow();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const artwork = STUDENT_ARTWORK.loginHero || STUDENT_ARTWORK.dashboardWelcome;

  async function finishGoogleSignIn(identity) {
    setError('');
    const response = authenticateGoogleAccount(identity);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    try {
      const sessionData = await getCurrentSession();
      const roles = (sessionData?.roles || []).map((r) => String(r).toUpperCase());
      if (roles.includes('ADMIN')) {
        navigate(location.state?.from || '/', { replace: true });
        return;
      }
      if (roles.includes('ADVISER')) {
        navigate(location.state?.from || '/adviser', { replace: true });
        return;
      }
    } catch {
      // ignore
    }
    navigate(location.state?.from || '/student', { replace: true });
  }

  return (
    <main className="wt-student-access-page">
      <Container size="sm" className="wt-student-access-container">
        <Stack gap="md">
          <Box className="wt-form-artwork wt-login-banner" component="section" aria-label="WildTrack sign in banner">
            <div className="wt-artwork-copy wt-login-banner-copy">
              <Title order={1} className="wt-login-banner-title">Welcome to WildTrack</Title>
              <Text className="wt-login-banner-subtitle">
                Access your capstone workspace, submit deliverables, and track adviser feedback.
              </Text>
            </div>
            <div
              className="wt-artwork-mascot wt-login-banner-art"
              role="img"
              aria-label={artwork.alt}
              style={{
                backgroundImage: `url("${artwork.src}")`,
                backgroundPosition: artwork.position,
                backgroundSize: artwork.size
              }}
            />
          </Box>

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
