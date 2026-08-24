import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disableGoogleAutoSelect, GoogleSignInButton } from './GoogleSignInButton.jsx';
import { wildTrackTheme } from '../../app/theme.js';

const authenticateGoogle = vi.fn();

vi.mock('../../lib/api.js', () => ({
  authenticateGoogle: (...args) => authenticateGoogle(...args)
}));

function renderButton(props = {}) {
  return render(
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <GoogleSignInButton
        clientId={props.clientId ?? ''}
        onAuthenticated={props.onAuthenticated || vi.fn()}
        enableOneTap={props.enableOneTap}
        autoSelect={props.autoSelect}
      />
    </MantineProvider>
  );
}

function installGoogleIdentity(overrides = {}) {
  const api = {
    initialize: vi.fn(),
    renderButton: vi.fn((element) => { element.textContent = 'Continue with Google'; }),
    prompt: vi.fn(),
    disableAutoSelect: vi.fn(),
    ...overrides
  };
  window.google = { accounts: { id: api } };
  return api;
}

describe('GoogleSignInButton', () => {
  beforeEach(() => {
    authenticateGoogle.mockReset();
    sessionStorage.clear();
    document.querySelectorAll('script[data-wildtrack-google-identity]').forEach((script) => script.remove());
    delete window.google;
  });

  it('renders an honest configuration error when the client id is missing', async () => {
    renderButton();

    expect(await screen.findByRole('alert')).toHaveTextContent('Google sign-in is not configured');
  });

  it('verifies the Google credential through the backend before authenticating', async () => {
    const onAuthenticated = vi.fn();
    authenticateGoogle.mockResolvedValue({
      subject: 'google-subject-123',
      email: 'student@gmail.com',
      name: 'Student Name'
    });
    installGoogleIdentity({
      initialize: vi.fn(({ callback }) => callback({ credential: 'signed-google-credential' }))
    });

    renderButton({ clientId: 'test-client-id', onAuthenticated });

    await waitFor(() => expect(authenticateGoogle).toHaveBeenCalledWith('signed-google-credential'));
    expect(onAuthenticated).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'google-subject-123',
      email: 'student@gmail.com'
    }));
  });

  it('offers One Tap with automatic selection while retaining the fallback button', async () => {
    const googleIdentity = installGoogleIdentity();

    renderButton({ clientId: 'test-client-id', enableOneTap: true, autoSelect: true });

    await waitFor(() => expect(googleIdentity.initialize).toHaveBeenCalledWith(expect.objectContaining({
      client_id: 'test-client-id',
      auto_select: true
    })));
    expect(googleIdentity.prompt).toHaveBeenCalledTimes(1);
    expect(googleIdentity.renderButton).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Continue with Google')).toHaveTextContent('Continue with Google');
  });

  it('loads Google Identity Services before initializing when the SDK is not already present', async () => {
    renderButton({ clientId: 'test-client-id', enableOneTap: true, autoSelect: true });

    const script = document.querySelector('script[data-wildtrack-google-identity]');
    expect(script).toHaveAttribute('src', 'https://accounts.google.com/gsi/client');

    const googleIdentity = installGoogleIdentity();
    script.dispatchEvent(new Event('load'));

    await waitFor(() => expect(googleIdentity.initialize).toHaveBeenCalledTimes(1));
    expect(googleIdentity.prompt).toHaveBeenCalledTimes(1);
    expect(googleIdentity.renderButton).toHaveBeenCalledTimes(1);
  });
  it('suppresses One Tap and automatic selection after an explicit WildTrack logout', async () => {
    const googleIdentity = installGoogleIdentity();
    disableGoogleAutoSelect();

    renderButton({ clientId: 'test-client-id', enableOneTap: true, autoSelect: true });

    await waitFor(() => expect(googleIdentity.initialize).toHaveBeenCalledWith(expect.objectContaining({
      auto_select: false
    })));
    expect(googleIdentity.disableAutoSelect).toHaveBeenCalledTimes(1);
    expect(googleIdentity.prompt).not.toHaveBeenCalled();
    expect(googleIdentity.renderButton).toHaveBeenCalledTimes(1);
  });
});
