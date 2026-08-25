import { Anchor, Container, Stack } from '@mantine/core';
import { ArrowLeft } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useWorkflow } from '../app/WorkflowContext.jsx';
import { getCurrentSession } from '../lib/api.js';
import { GoogleIdentityAccess } from '../components/auth/GoogleIdentityAccess.jsx';

export function RegisterPage() {
  const { authenticateGoogleAccount } = useWorkflow();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');

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
      <Container size="md" className="wt-student-access-container">
        <Stack gap="lg">
          <GoogleIdentityAccess
            description="Open your WildTrack dashboard to check submissions, tracker progress, and adviser feedback."
            error={error}
            onAuthenticated={finishGoogleSignIn}
          />
          <Anchor component={Link} to="/student" className="wt-google-access-return">
            <ArrowLeft size={16} aria-hidden="true" />
            Return to student dashboard
          </Anchor>
        </Stack>
      </Container>
    </main>
  );
}
