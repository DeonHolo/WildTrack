import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { GoogleLogo, Key } from '@phosphor-icons/react';
import { Button, Field } from '../components/ui.jsx';
import { useWorkflow } from '../app/WorkflowContext.jsx';

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
      setMessage('Google sign-in is not connected yet. Use email registration for now.');
      return;
    }
    if (!form.email || (authMethod === 'Email' && !form.password)) {
      setMessage('Enter your email and password.');
      return;
    }
    const response = registerStudentAccount({ email: form.email, authMethod });
    if (!response.ok) {
      setMessage(response.error);
      return;
    }
    setMessage('Account registered. Claim your Student Number in the dashboard.');
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

  return (
    <div className="public-page auth-page">
      <section className="auth-card auth-card-focused">
        <div className="auth-panel">
          <header className="auth-heading">
            <h1>{mode === 'register' ? 'Create your account' : 'Sign in to WildTrack'}</h1>
            <p>{mode === 'register'
              ? 'Create an optional account to view your submissions, tracker status, and adviser feedback.'
              : 'Use the account connected to your student dashboard.'}</p>
          </header>
          <div className="segmented-control" role="tablist" aria-label="Access mode">
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Register</button>
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Sign in</button>
          </div>

          {mode === 'register' ? (
            <form className="form-grid" onSubmit={(event) => { event.preventDefault(); register('Email'); }}>
              <Button type="button" variant="secondary" icon={GoogleLogo} onClick={() => register('Google')}>Continue with Google</Button>
              <div className="divider"><span>or use email</span></div>
              <Field label="Email" required>
                <input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="student@gmail.com" />
              </Field>
              <Field label="Password" required>
                <input type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Create a password" />
              </Field>
              {message ? <div className={`inline-alert ${message.startsWith('Account registered') ? 'success' : 'danger'}`}>{message}</div> : null}
              <Button icon={Key}>Create account</Button>
              <p className="auth-account-note">After registration, connect your Student Number from the dashboard to load your official name, team, submissions, and tracker data.</p>
            </form>
          ) : (
            <form className="form-grid" onSubmit={login}>
              <Field label="Email" required>
                <input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="student@gmail.com" />
              </Field>
              <Field label="Password">
                <input type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Password" />
              </Field>
              {message ? <div className="inline-alert danger">{message}</div> : null}
              <Button icon={Key}>Sign in</Button>
            </form>
          )}
          <p className="auth-footnote">An account is not required to answer a public deliverable form.</p>
          <Link className="text-link" to="/student">Return to dashboard</Link>
        </div>
      </section>
    </div>
  );
}
