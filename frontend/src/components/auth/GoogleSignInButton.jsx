import { Alert, Box, Button, Loader, Stack, Text } from '@mantine/core';
import { WarningCircle } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { authenticateGoogle } from '../../lib/api.js';
import { useWorkspaceSession } from '../../app/WorkspaceSession.jsx';
import { clearGoogleAutoPromptSuppression, isGoogleAutoPromptSuppressed } from '../../lib/googleIdentitySession.js';
import { SessionLoadingScreen } from './SessionLoadingScreen.jsx';

export { disableGoogleAutoSelect } from '../../lib/googleIdentitySession.js';

const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
const GOOGLE_LOAD_ERROR = 'Google sign-in couldn’t connect. Check your internet connection and allow Google sign-in in your browser or extension settings, then select Retry.';
let googleIdentityPromise;
function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (googleIdentityPromise) return googleIdentityPromise;
  const pending = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-wildtrack-google-identity]');
    const script = existing || document.createElement('script');
    let timer;
    function finish(error) {
      clearTimeout(timer);
      script.removeEventListener('load', loaded);
      script.removeEventListener('error', failed);
      if (error) {
        script.remove();
        reject(error);
      } else resolve(window.google.accounts.id);
    }
    function loaded() {
      finish(window.google?.accounts?.id ? null : new Error(GOOGLE_LOAD_ERROR));
    }
    function failed() { finish(new Error(GOOGLE_LOAD_ERROR)); }
    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', failed, { once: true });
    timer = setTimeout(failed, 15000);
    if (!existing) {
      script.src = GOOGLE_IDENTITY_SCRIPT;
      script.async = true;
      script.defer = true;
      script.dataset.wildtrackGoogleIdentity = 'true';
      document.head.appendChild(script);
    }
  });
  googleIdentityPromise = pending;
  // A blocked or timed-out script must not poison later visits or an explicit retry.
  pending.then(() => { if (googleIdentityPromise === pending) googleIdentityPromise = null; },
    () => { if (googleIdentityPromise === pending) googleIdentityPromise = null; });
  return googleIdentityPromise;
}

export function GoogleSignInButton({
  clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID,
  enableOneTap = false,
  autoSelect = false,
  onAuthenticated
}) {
  const buttonRef = useRef(null);
  const callbackRef = useRef(onAuthenticated);
  let workspaceSession = null;
  try { workspaceSession = useWorkspaceSession(); } catch { /* Standalone identity button. */ }
  const completionRef = useRef(workspaceSession?.completeGoogleSignIn);
  const verifyingRef = useRef(false);
  completionRef.current = workspaceSession?.completeGoogleSignIn;
  callbackRef.current = onAuthenticated;
  const [status, setStatus] = useState(clientId ? 'loading' : 'error');
  const [error, setError] = useState(clientId ? '' : 'Google sign-in is not configured on this machine.');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    if (!clientId) return () => { active = false; };
    setStatus('loading');
    setError('');
    loadGoogleIdentity()
      .then((googleIdentity) => {
        if (!active || !buttonRef.current) return;
        const promptSuppressed = isGoogleAutoPromptSuppressed();
        googleIdentity.initialize({
          client_id: clientId,
          auto_select: Boolean(enableOneTap && autoSelect && !promptSuppressed),
          cancel_on_tap_outside: true,
          itp_support: true,
          callback: async ({ credential }) => {
            if (!active || verifyingRef.current) return;
            if (!credential) {
              setStatus('error');
              setError('Google did not return a sign-in credential.');
              return;
            }
            verifyingRef.current = true;
            setStatus('verifying');
            setError('');
            try {
              const identity = await authenticateGoogle(credential);
              if (!active) return;
              clearGoogleAutoPromptSuppression();
              if (completionRef.current) {
                const session = await completionRef.current();
                if (!active || !session) return;
                await callbackRef.current?.(identity, session);
              } else {
                await callbackRef.current?.(identity);
              }
              if (!active) return;
              verifyingRef.current = false;
              setStatus('ready');
            } catch (failure) {
              verifyingRef.current = false;
              if (!active) return;
              setStatus('error');
              const networkFailure = failure instanceof TypeError || /failed to fetch|networkerror|load failed|cors request/i.test(failure?.message || '');
              setError(networkFailure
                ? 'WildTrack couldn’t finish signing you in. Check your internet connection and your browser or extension blocking settings, then try again.'
                : failure?.message || 'Google sign-in could not be verified.');
            }
          }
        });
        buttonRef.current.replaceChildren();
        const width = window.innerWidth < 420 ? Math.max(220, Math.min(window.innerWidth - 80, 280)) : 300;
        googleIdentity.renderButton(buttonRef.current, {
          type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width
        });
        if (enableOneTap && !promptSuppressed) googleIdentity.prompt?.();
        setStatus('ready');
      })
      .catch((failure) => {
        if (!active) return;
        setStatus('error');
        setError(failure?.message || 'Google sign-in could not be loaded.');
      });
    return () => { active = false; };
  }, [autoSelect, clientId, enableOneTap, retry]);

  return (
    <Stack gap="xs" className="wt-google-sign-in">
      <Box ref={buttonRef} className="wt-google-sign-in-button" aria-label="Continue with Google"
        style={status === 'loading' ? { display: 'none' } : undefined} />
      {status === 'verifying' ? createPortal(<SessionLoadingScreen overlay message="Verifying Google account…" />, document.body) : null}
      {status === 'loading' ? (
        <Text size="sm" c="dimmed" role="status">
          <Loader size="xs" mr="xs" />
          Loading Google sign-in...
        </Text>
      ) : null}
      {error ? <Alert color="red" variant="light" icon={<WarningCircle size={19} />} title="Google sign-in unavailable" role="alert">
        <Stack gap="sm">
          <Text size="sm">{error}</Text>
          {clientId ? <Button variant="default" size="sm" onClick={() => setRetry(value => value + 1)} style={{ alignSelf: 'flex-start' }}>Retry Google sign-in</Button> : null}
        </Stack>
      </Alert> : null}
    </Stack>
  );
}
