import { Alert, Divider, Paper, PasswordInput, SegmentedControl, Stack, Text, TextInput, Title } from '@mantine/core';
import { GoogleLogo, Key, WarningCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useWorkflow } from '../app/WorkflowContext.jsx';
import { Button } from '../components/ui.jsx';

export function RegisterPage() {
  const { registerStudentAccount, loginStudentAccount } = useWorkflow();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState(() => location.pathname === '/login' ? 'login' : 'register');
  const [form, setForm] = useState({ email: '', password: '' });
  const [message, setMessage] = useState('');

  function register(authMethod = 'Email') {
    setMessage('');
    if (authMethod === 'Google') {
      setMessage('Google sign-in is currently unavailable. Use email registration.');
      return;
    }
    if (!form.email || !form.password) {
      setMessage('Enter your email and password.');
      return;
    }
    const response = registerStudentAccount({ email: form.email, authMethod });
    if (!response.ok) {
      setMessage(response.error);
      return;
    }
    setMessage('Account registered. Connect your Student Number in the dashboard.');
    window.setTimeout(() => navigate('/student'), 500);
  }

  function login(event) {
    event.preventDefault();
    setMessage('');
    if (!form.email) {
      setMessage('Enter the email used for registration.');
      return;
    }
    const response = loginStudentAccount({ email: form.email });
    if (!response.ok) {
      setMessage(response.error);
      return;
    }
    navigate('/student');
  }

  const registrationSucceeded = message.startsWith('Account registered');

  return (
    <main className="public-page auth-page">
      <Paper component="section" className="auth-card auth-card-focused" withBorder shadow="sm">
        <Stack className="auth-panel" gap="lg">
          <header className="auth-heading">
            <Title order={1}>{mode === 'register' ? 'Create your account' : 'Sign in to WildTrack'}</Title>
            <Text c="dimmed" mt="xs">{mode === 'register'
              ? 'Create an optional account to view your submissions, tracker status, and adviser feedback.'
              : 'Use the account connected to your student dashboard.'}</Text>
          </header>

          <SegmentedControl
            fullWidth
            value={mode}
            onChange={(value) => { setMode(value); setMessage(''); }}
            aria-label="Access mode"
            data={[
              { value: 'register', label: 'Register' },
              { value: 'login', label: 'Sign in' }
            ]}
          />

          {mode === 'register' ? (
            <form onSubmit={(event) => { event.preventDefault(); register('Email'); }}>
              <Stack gap="md">
                <Button type="button" variant="secondary" icon={GoogleLogo} onClick={() => register('Google')}>Continue with Google</Button>
                <Divider label="or use email" labelPosition="center" />
                <TextInput
                  label="Email"
                  required
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.currentTarget.value })}
                  placeholder="student@gmail.com"
                />
                <PasswordInput
                  label="Password"
                  required
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.currentTarget.value })}
                  placeholder="Create a password"
                />
                {message ? <Alert color={registrationSucceeded ? 'green' : 'orange'} icon={<WarningCircle aria-hidden="true" />}>{message}</Alert> : null}
                <Button icon={Key}>Create account</Button>
                <Text size="sm" c="dimmed">After registration, connect your Student Number from the dashboard to load your official name, team, submissions, and tracker data.</Text>
              </Stack>
            </form>
          ) : (
            <form onSubmit={login}>
              <Stack gap="md">
                <TextInput
                  label="Email"
                  required
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.currentTarget.value })}
                  placeholder="student@gmail.com"
                />
                <PasswordInput
                  label="Password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.currentTarget.value })}
                  placeholder="Password"
                />
                {message ? <Alert color="orange" icon={<WarningCircle aria-hidden="true" />}>{message}</Alert> : null}
                <Button icon={Key}>Sign in</Button>
              </Stack>
            </form>
          )}

          <Divider />
          <Text size="sm" c="dimmed">An account is not required to answer a public deliverable form.</Text>
          <Button component={Link} to="/student" variant="secondary">Return to dashboard</Button>
        </Stack>
      </Paper>
    </main>
  );
}