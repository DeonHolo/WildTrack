import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceSessionProvider, useWorkspaceSession } from '../../app/WorkspaceSession.jsx';
import { wildTrackTheme } from '../../app/theme.js';
import { request } from '../../lib/api.js';
import { RegisterPage } from '../../pages/RegisterPage.jsx';
import { GoogleSignInGate } from './GoogleSignInGate.jsx';

const api = vi.hoisted(() => ({
  getCurrentSession: vi.fn(), getWorkspaces: vi.fn(), logout: vi.fn(),
  createWorkspace: vi.fn(), updateWorkspace: vi.fn(), authenticateGoogle: vi.fn()
}));
vi.mock('../../lib/api.js', async (importOriginal) => ({ ...await importOriginal(), ...api }));

const signedIn = {
  authenticated: true, email: 'student@example.test', googleSubject: 'subject-a', roles: []
};
const anonymous = { authenticated: false, roles: [] };
let current;
let google;
const privateMount = vi.fn();
function SessionProbe() { current = useWorkspaceSession(); return null; }
function PrivatePage() {
  const context = useWorkspaceSession();
  useEffect(() => { privateMount(); }, []);
  return <h1>Private page: {context.activeWorkspace?.name}</h1>;
}
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}{location.search}</span>;
}
function show(path = '/student') {
  return render(<MantineProvider theme={wildTrackTheme}>
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <WorkspaceSessionProvider>
        <SessionProbe />
        <LocationProbe />
        <GoogleSignInGate>
          <Routes>
            <Route path="/login" element={<RegisterPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/w/:workspace/submit/:slug" element={<h1>Public submission form</h1>} />
            <Route path="/submit/:slug" element={<h1>Public submission form</h1>} />
            <Route path="/about" element={<h1>Public information</h1>} />
            <Route path="/privacy" element={<h1>Public information</h1>} />
            <Route path="/terms" element={<h1>Public information</h1>} />
            <Route path="*" element={<PrivatePage />} />
          </Routes>
        </GoogleSignInGate>
      </WorkspaceSessionProvider>
    </MemoryRouter>
  </MantineProvider>);
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const accountKey = JSON.stringify([signedIn.email, signedIn.googleSubject, signedIn.roles]);
const privateCacheKey = JSON.stringify([accountKey, 'workspace-a', 'saved-ai-report']);

describe('Google sign-in and route isolation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-google-client');
    localStorage.clear();
    sessionStorage.clear();
    privateMount.mockClear();
    current = null;
    google = {
      initialize: vi.fn(),
      renderButton: vi.fn(element => { element.textContent = 'Continue with Google'; }),
      prompt: vi.fn()
    };
    window.google = { accounts: { id: google } };
    api.getCurrentSession.mockReset().mockResolvedValue(signedIn);
    api.getWorkspaces.mockReset().mockResolvedValue([{ id: 'workspace-a', name: 'Private workspace' }]);
    api.logout.mockReset().mockResolvedValue(null);
    api.authenticateGoogle.mockReset().mockResolvedValue({ subject: signedIn.googleSubject, email: signedIn.email });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); delete window.google; });

  it('does not mount private routes or request catalogs until Google identity is verified', async () => {
    const session = deferred();
    api.getCurrentSession.mockReturnValueOnce(session.promise);
    show('/review?workspaceId=workspace-a');
    expect(screen.getByRole('status')).toHaveTextContent('Loading WildTrack');
    expect(privateMount).not.toHaveBeenCalled();
    expect(api.getWorkspaces).not.toHaveBeenCalled();
    await act(async () => { session.resolve(signedIn); });
    expect(await screen.findByRole('heading', { name: 'Private page: Private workspace' })).toBeInTheDocument();
    expect(privateMount).toHaveBeenCalledTimes(1);
    expect(api.getWorkspaces).toHaveBeenCalledTimes(1);
  });

  it('redirects anonymous private routes to login without restoring private cached resources', async () => {
    api.getCurrentSession.mockResolvedValue(anonymous);
    localStorage.setItem('wildtrack.resource-snapshots.v2', JSON.stringify([
      { key: privateCacheKey, data: { text: 'Private cached AI report' }, updatedAt: Date.now() }
    ]));
    show('/review?workspaceId=workspace-a');
    expect(await screen.findByRole('heading', { name: 'Welcome to WildTrack' })).toBeInTheDocument();
    expect(privateMount).not.toHaveBeenCalled();
    expect(current.account).toBeNull();
    expect(current.resourceCache.read(privateCacheKey)).toBeUndefined();
    expect(api.getWorkspaces).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/login?returnTo=');
  });

  it.each(['/w/section-a/submit/srs', '/submit/srs'])('keeps public form metadata available on %s', async path => {
    const session = deferred();
    api.getCurrentSession.mockReturnValueOnce(session.promise);
    show(path);
    expect(screen.getByRole('heading', { name: 'Public submission form' })).toBeInTheDocument();
    expect(api.getWorkspaces).not.toHaveBeenCalled();
    await act(async () => { session.resolve(anonymous); });
    expect(screen.getByRole('heading', { name: 'Public submission form' })).toBeInTheDocument();
    expect(privateMount).not.toHaveBeenCalled();
    expect(api.getWorkspaces).not.toHaveBeenCalled();
  });

  it.each(['/about', '/privacy/', '/terms'])('keeps %s readable while identity resolves', async path => {
    const session = deferred();
    api.getCurrentSession.mockReturnValueOnce(session.promise);
    show(path);
    expect(screen.getByRole('heading', { name: 'Public information' })).toBeInTheDocument();
    await act(async () => { session.resolve(anonymous); });
    expect(screen.getByRole('heading', { name: 'Public information' })).toBeInTheDocument();
    expect(privateMount).not.toHaveBeenCalled();
    expect(api.getWorkspaces).not.toHaveBeenCalled();
  });

  it.each(['/about', '/privacy', '/terms'])('keeps %s readable when session verification fails', async path => {
    api.getCurrentSession.mockRejectedValue(new Error('Google is temporarily unavailable.'));
    show(path);
    await waitFor(() => expect(current.sessionStatus).toBe('error'));
    expect(screen.getByRole('heading', { name: 'Public information' })).toBeInTheDocument();
    expect(privateMount).not.toHaveBeenCalled();
    expect(api.getWorkspaces).not.toHaveBeenCalled();
  });

  it('keeps ordinary login mounted during credential verification and returns to the selected form', async () => {
    api.getCurrentSession.mockResolvedValueOnce(anonymous);
    show('/login?returnTo=%2Fw%2Fsection-a%2Fsubmit%2Fsrs%3Fteam%3D4');
    await waitFor(() => expect(google.initialize).toHaveBeenCalledTimes(1));
    const check = deferred();
    api.getCurrentSession.mockReturnValueOnce(check.promise);
    let signingIn;
    act(() => {
      signingIn = google.initialize.mock.calls[0][0].callback({ credential: 'signed-google-credential' });
    });
    await waitFor(() => expect(api.getCurrentSession).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('heading', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.queryByText('Loading WildTrack…')).not.toBeInTheDocument();
    expect(api.authenticateGoogle).toHaveBeenCalledWith('signed-google-credential');
    expect(screen.queryByText(/Drive history|read-only Google Drive/)).not.toBeInTheDocument();
    await act(async () => { check.resolve(signedIn); await signingIn; });
    expect(await screen.findByRole('heading', { name: 'Public submission form' })).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toBe('/w/section-a/submit/srs?team=4');
  });

  it.each(['/login', '/w/section-a/submit/srs'])('offers a recoverable session error from %s', async path => {
    api.getCurrentSession.mockRejectedValue(new Error('Session service is temporarily unavailable.'));
    show(path);
    expect(await screen.findByRole('alert')).toHaveTextContent('Session service is temporarily unavailable.');
    expect(screen.getByRole('heading', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(api.getWorkspaces).not.toHaveBeenCalled();
    expect(api.authenticateGoogle).not.toHaveBeenCalled();
    api.getCurrentSession.mockResolvedValueOnce(anonymous);
    fireEvent.click(screen.getByRole('button', { name: 'Retry sign-in check' }));
    await waitFor(() => expect(google.initialize).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not convert scoped authorization failures into a permission flow or clear the valid account', async () => {
    show('/student');
    await screen.findByRole('heading', { name: 'Private page: Private workspace' });
    current.resourceCache.write(privateCacheKey, { text: 'Private cached AI report' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 'WORKSPACE_FORBIDDEN', message: 'Workspace is unavailable.'
    }), { status: 403 }));
    await act(async () => { await expect(request('/workspace/private')).rejects.toMatchObject({ status: 403 }); });
    expect(screen.getByRole('heading', { name: 'Private page: Private workspace' })).toBeInTheDocument();
    expect(api.getCurrentSession).toHaveBeenCalledTimes(1);
    expect(current.resourceCache.read(privateCacheKey)).toEqual({ text: 'Private cached AI report' });
  });

  it('clears private caches immediately when another tab changes the account', async () => {
    show('/student');
    await screen.findByRole('heading', { name: 'Private page: Private workspace' });
    current.resourceCache.write(privateCacheKey, { text: 'Private cached AI report' });
    const check = deferred();
    api.getCurrentSession.mockReturnValueOnce(check.promise);
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'wildtrack.session-identity', newValue: 'changed-account' })); });
    expect(screen.queryByRole('heading', { name: 'Private page: Private workspace' })).not.toBeInTheDocument();
    expect(current.resourceCache.read(privateCacheKey)).toBeUndefined();
    await act(async () => { check.resolve(anonymous); });
    expect(await screen.findByRole('heading', { name: 'Welcome to WildTrack' })).toBeInTheDocument();
    expect(current.account).toBeNull();
    expect(api.getWorkspaces).toHaveBeenCalledTimes(1);
  });

  it('still verifies Google identity when browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    show('/workspace');
    expect(await screen.findByRole('heading', { name: 'Private page: Private workspace' })).toBeInTheDocument();
    expect(current.account?.email).toBe(signedIn.email);
    expect(api.getWorkspaces).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['/login?returnTo=%2Freview%3FworkspaceId%3Dworkspace-a', [], '/review?workspaceId=workspace-a'],
    ['/login', ['ADMIN'], '/'],
    ['/login?returnTo=%2F%2Fevil.example', ['ADVISER'], '/adviser']
  ])('returns a verified credential from %s to its safe destination', async (path, roles, destination) => {
    api.getCurrentSession.mockResolvedValueOnce(anonymous).mockResolvedValueOnce({ ...signedIn, roles });
    show(path);
    await waitFor(() => expect(google.initialize).toHaveBeenCalledTimes(1));
    await act(async () => { await google.initialize.mock.calls[0][0].callback({ credential: 'signed-google-credential' }); });
    expect(await screen.findByRole('heading', { name: 'Private page: Private workspace' })).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toBe(destination);
    expect(screen.queryByRole('heading', { name: 'Sign in with Google' })).not.toBeInTheDocument();
    expect(api.authenticateGoogle).toHaveBeenCalledWith('signed-google-credential');
  });
});
