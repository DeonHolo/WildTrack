import { Alert, Box, Loader, Stack, Text } from '@mantine/core';
import { WarningCircle } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { authenticateGoogle } from '../../lib/api.js';
import { clearGoogleAutoPromptSuppression, disableGoogleAutoSelect, isGoogleAutoPromptSuppressed } from '../../lib/googleIdentitySession.js';

export { disableGoogleAutoSelect } from '../../lib/googleIdentitySession.js';

const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
let googleIdentityPromise;
function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (googleIdentityPromise) return googleIdentityPromise;

  googleIdentityPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-wildtrack-google-identity]');
    const script = existing || document.createElement('script');
    if (!existing) {
      script.src = GOOGLE_IDENTITY_SCRIPT;
      script.async = true;
      script.defer = true;
      script.dataset.wildtrackGoogleIdentity = 'true';
      document.head.appendChild(script);
    }
    script.addEventListener('load', () => {
      if (window.google?.accounts?.id) resolve(window.google.accounts.id);
      else reject(new Error('Google Identity Services did not load correctly.'));
    }, { once: true });
    script.addEventListener('error', () => reject(new Error('Google sign-in could not be loaded. Check your connection.')), { once: true });
  });
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
  const [status, setStatus] = useState(clientId ? 'loading' : 'error');
  const [error, setError] = useState(clientId ? '' : 'Google sign-in is not configured on this machine.');

  useEffect(() => {
    callbackRef.current = onAuthenticated;
  }, [onAuthenticated]);

  useEffect(() => {
    let active = true;
    if (!clientId) return () => { active = false; };

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
            if (!credential) {
              setStatus('error');
              setError('Google did not return a sign-in credential.');
              return;
            }
            setStatus('verifying');
            setError('');
            try {
              const identity = await authenticateGoogle(credential);
              if (!active) return;
              clearGoogleAutoPromptSuppression();
              callbackRef.current?.(identity);
              setStatus('ready');
            } catch (requestError) {
              if (!active) return;
              setStatus('error');
              setError(requestError.message || 'Google sign-in could not be verified.');
            }
          }
        });
        buttonRef.current.replaceChildren();
        googleIdentity.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular'
        });
        if (enableOneTap && !promptSuppressed) googleIdentity.prompt?.();
        setStatus('ready');
      })
      .catch((loadError) => {
        if (!active) return;
        setStatus('error');
        setError(loadError.message);
      });

    return () => { active = false; };
  }, [autoSelect, clientId, enableOneTap]);

  return (
    <Stack gap="xs" className="wt-google-sign-in">
      <Box
        ref={buttonRef}
        className="wt-google-sign-in-button"
        aria-label="Continue with Google"
        style={status === 'loading' ? { display: 'none' } : undefined}
      />
      {status === 'loading' || status === 'verifying' ? (
        <Text size="sm" c="dimmed" role="status">
          <Loader size="xs" mr="xs" />
          {status === 'verifying' ? 'Verifying Google account...' : 'Loading Google sign-in...'}
        </Text>
      ) : null}
      {error ? (
        <Alert color="red" variant="light" icon={<WarningCircle size={19} />} role="alert">
          {error}
        </Alert>
      ) : null}
    </Stack>
  );
}