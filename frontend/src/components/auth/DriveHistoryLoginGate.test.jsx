import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceSessionProvider, useWorkspaceSession } from '../../app/WorkspaceSession.jsx';
import { wildTrackTheme } from '../../app/theme.js';
import { request } from '../../lib/api.js';
import { RegisterPage } from '../../pages/RegisterPage.jsx';
import { DriveHistoryConsent } from './DriveHistoryConsent.jsx';
import { DriveHistoryLoginGate } from './DriveHistoryLoginGate.jsx';

const api = vi.hoisted(() => ({
  getCurrentSession: vi.fn(), getWorkspaces: vi.fn(), logout: vi.fn(),
  createWorkspace: vi.fn(), updateWorkspace: vi.fn(), authenticateGoogle: vi.fn(),
  startGoogleSignIn: vi.fn(), startDriveHistoryConsent: vi.fn(), getDriveHistoryConsentStatus: vi.fn()
}));
vi.mock('../../lib/api.js', async (importOriginal) => ({ ...await importOriginal(), ...api }));

const pending = {
  authenticated: true, email: 'student@example.test', googleSubject: 'subject-a', roles: [],
  driveHistoryRequired: true, driveHistoryConnected: false, driveHistoryConfigured: true
};
const connected = { ...pending, driveHistoryConnected: true };
let current;
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
        <DriveHistoryLoginGate>
          <Routes>
            <Route path="/login" element={<RegisterPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/w/:workspace/submit/:slug" element={<h1>Public submission form</h1>} />
            <Route path="*" element={<PrivatePage />} />
          </Routes>
          <DriveHistoryConsent />
        </DriveHistoryLoginGate>
      </WorkspaceSessionProvider>
    </MemoryRouter>
  </MantineProvider>);
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const accountKey = JSON.stringify([pending.email, pending.googleSubject, pending.roles]);
const privateCacheKey = JSON.stringify([accountKey, 'workspace-a', 'saved-ai-report']);

describe('required combined Google login and route isolation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    localStorage.clear();
    sessionStorage.clear();
    delete window.google;
    privateMount.mockClear();
    current = null;
    api.getCurrentSession.mockReset().mockResolvedValue(pending);
    api.getWorkspaces.mockReset().mockResolvedValue([{ id: 'workspace-a', name: 'Private workspace' }]);
    api.logout.mockReset().mockResolvedValue(null);
    api.authenticateGoogle.mockReset();
    api.startGoogleSignIn.mockReset();
    api.startDriveHistoryConsent.mockReset();
    api.getDriveHistoryConsentStatus.mockReset().mockResolvedValue({ configured: true, connected: false, required: true });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('never mounts a private route or requests catalogs while identity access is unknown or pending', async () => {
    const session = deferred();
    api.getCurrentSession.mockReturnValueOnce(session.promise);
    localStorage.setItem('wildtrack.resource-snapshots.v2', JSON.stringify([
      { key: privateCacheKey, data: { text: 'Private cached AI report' }, updatedAt: Date.now() },
      { key: JSON.stringify([accountKey, '', 'workspace-catalog']), data: [{ id: 'workspace-a', name: 'Private cached workspace' }], updatedAt: Date.now() }
    ]));
    show('/review?workspaceId=workspace-a');
    expect(screen.getByRole('status')).toHaveTextContent('Checking Google sign-in');
    expect(privateMount).not.toHaveBeenCalled();
    expect(api.getWorkspaces).not.toHaveBeenCalled();
    await act(async () => { session.resolve(pending); });
    expect(await screen.findByRole('heading', { name: 'Welcome to WildTrack' })).toBeInTheDocument();
    expect(privateMount).not.toHaveBeenCalled();
    expect(current.account).toBeNull();
    expect(current.activeWorkspace).toBeNull();
    expect(current.workspaces).toEqual([]);
    expect(current.resourceCache.read(privateCacheKey)).toBeUndefined();
    expect(api.getWorkspaces).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/login?returnTo=');
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();
  });

  it('offers one direct combined OAuth button without a frontend client ID, ID-token call or One Tap', async () => {
    api.getCurrentSession.mockResolvedValue({ ...pending, authenticated: false });
    const google = { initialize: vi.fn(), prompt: vi.fn(), renderButton: vi.fn() };
    window.google = { accounts: { id: google } };
    show('/login?returnTo=%2Fw%2Fsection-a%2Fsubmit%2Fsrs%3Fteam%3D4');
    const button = await screen.findByRole('button', { name: 'Continue with Google' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/Signing in includes read-only Google Drive file information/)).toBeInTheDocument();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(api.startGoogleSignIn).toHaveBeenCalledWith('/w/section-a/submit/srs?team=4'));
    expect(api.startGoogleSignIn).toHaveBeenCalledTimes(1);
    expect(api.authenticateGoogle).not.toHaveBeenCalled();
    expect(api.startDriveHistoryConsent).not.toHaveBeenCalled();
    expect(google.initialize).not.toHaveBeenCalled();
    expect(google.prompt).not.toHaveBeenCalled();
    expect(document.querySelector('script[data-wildtrack-google-identity]')).toBeNull();
  });

  it.each(['declined', 'error', 'unavailable'])('keeps %s callback feedback inline, removes the result query and waits for an explicit retry', async outcome => {
    api.getCurrentSession.mockResolvedValue({ ...pending, authenticated: false });
    show('/login?driveHistory=' + outcome + '&returnTo=%2Fworkspace%3Fsection%3Dit');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Google sign-in/);
    expect(screen.getByRole('heading', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Finish signing in with Google' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Google Drive history access' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location').textContent).not.toContain('driveHistory='));
    expect(api.startGoogleSignIn).not.toHaveBeenCalled();
    expect(api.authenticateGoogle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(api.startGoogleSignIn).toHaveBeenCalledWith('/workspace?section=it'));
    expect(api.startGoogleSignIn).toHaveBeenCalledTimes(1);
  });

  it('shows a failed start inline and allows the usual Google button to retry', async () => {
    api.getCurrentSession.mockResolvedValue({ ...pending, authenticated: false });
    api.startGoogleSignIn.mockRejectedValueOnce(new Error('Google could not be opened.'));
    show('/login');
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Google could not be opened.');
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(api.startGoogleSignIn).toHaveBeenCalledTimes(2));
    expect(api.authenticateGoogle).not.toHaveBeenCalled();
  });

  it('opens the preserved route after a connected callback and cleans only the result query', async () => {
    api.getCurrentSession.mockResolvedValue(connected);
    show('/review?workspaceId=workspace-a&driveHistory=connected');
    expect(await screen.findByRole('heading', { name: 'Private page: Private workspace' })).toBeInTheDocument();
    expect(privateMount).toHaveBeenCalledTimes(1);
    expect(api.getWorkspaces).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/review?workspaceId=workspace-a'));
    expect(screen.getByTestId('location').textContent).not.toContain('driveHistory=');
  });

  it('keeps anonymous public forms available and preserves required mode after cancel/logout', async () => {
    const view = show('/student');
    expect(await screen.findByRole('button', { name: 'Cancel sign-in' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
    await waitFor(() => expect(current.session.authenticated).toBe(false));
    expect(current.session.driveHistoryRequired).toBe(true);
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(api.authenticateGoogle).not.toHaveBeenCalled();
    expect(api.startGoogleSignIn).not.toHaveBeenCalled();
    view.unmount();
    api.getCurrentSession.mockResolvedValue({ ...pending, authenticated: false });
    show('/w/section-a/submit/srs?team=4');
    expect(await screen.findByRole('heading', { name: 'Public submission form' })).toBeInTheDocument();
    expect(api.getWorkspaces).not.toHaveBeenCalled();
  });

  it.each(['/login', '/w/section-a/submit/srs'])('renders the normal login with a recoverable session error from %s', async route => {
    api.getCurrentSession.mockRejectedValue(new Error('Session service is temporarily unavailable.'));
    show(route);
    expect(await screen.findByRole('alert')).toHaveTextContent('Session service is temporarily unavailable.');
    expect(screen.getByRole('heading', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Public submission form' })).not.toBeInTheDocument();
    expect(api.getWorkspaces).not.toHaveBeenCalled();
    expect(api.startGoogleSignIn).not.toHaveBeenCalled();
  });

  it('clears private data immediately on the exact required-permission API response, then redirects to ordinary login', async () => {
    api.getCurrentSession.mockResolvedValueOnce(connected);
    show('/student');
    await screen.findByRole('heading', { name: 'Private page: Private workspace' });
    current.resourceCache.write(privateCacheKey, { text: 'Private cached AI report' });
    const check = deferred();
    api.getCurrentSession.mockReturnValueOnce(check.promise);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 'DRIVE_HISTORY_REQUIRED', message: 'Connect Google Drive history to finish signing in.'
    }), { status: 403 }));
    await act(async () => {
      await expect(request('/workspace/private')).rejects.toMatchObject({ code: 'DRIVE_HISTORY_REQUIRED', status: 403 });
    });
    expect(screen.queryByRole('heading', { name: 'Private page: Private workspace' })).not.toBeInTheDocument();
    expect(current.account).toBeNull();
    expect(current.resourceCache.read(privateCacheKey)).toBeUndefined();
    expect(current.activeWorkspace).toBeNull();
    await act(async () => { check.resolve(pending); });
    expect(await screen.findByRole('heading', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(api.getWorkspaces).toHaveBeenCalledTimes(1);
    expect(api.startGoogleSignIn).not.toHaveBeenCalled();
  });

  it('keeps ordinary scoped 403 failures separate from required permission', async () => {
    api.getCurrentSession.mockResolvedValue(connected);
    show('/student');
    await screen.findByRole('heading', { name: 'Private page: Private workspace' });
    current.resourceCache.write(privateCacheKey, { text: 'Private cached AI report' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 'WORKSPACE_FORBIDDEN', message: 'Workspace is unavailable.' }), { status: 403 }));
    await act(async () => { await expect(request('/workspace/private')).rejects.toMatchObject({ status: 403 }); });
    expect(screen.getByRole('heading', { name: 'Private page: Private workspace' })).toBeInTheDocument();
    expect(api.getCurrentSession).toHaveBeenCalledTimes(1);
    expect(current.resourceCache.read(privateCacheKey)).toEqual({ text: 'Private cached AI report' });
  });

  it('removes cached content before another account is resolved and never restores it for pending permission', async () => {
    api.getCurrentSession.mockResolvedValueOnce(connected);
    show('/student');
    await screen.findByRole('heading', { name: 'Private page: Private workspace' });
    current.resourceCache.write(privateCacheKey, { text: 'Private cached AI report' });
    const check = deferred();
    api.getCurrentSession.mockReturnValueOnce(check.promise);
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'wildtrack.session-identity', newValue: 'changed-account' })); });
    expect(screen.queryByRole('heading', { name: 'Private page: Private workspace' })).not.toBeInTheDocument();
    expect(current.resourceCache.read(privateCacheKey)).toBeUndefined();
    await act(async () => { check.resolve({ ...pending, googleSubject: 'subject-b' }); });
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(current.account).toBeNull();
    expect(api.getWorkspaces).toHaveBeenCalledTimes(1);
    expect(api.startGoogleSignIn).not.toHaveBeenCalled();
  });

  it('still gates a pending account when browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    show('/workspace');
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(privateMount).not.toHaveBeenCalled();
    expect(current.workspaces).toEqual([]);
    expect(api.getWorkspaces).not.toHaveBeenCalled();
  });

  it.each([
    ['/login?driveHistory=connected&returnTo=%2Freview%3FworkspaceId%3Dworkspace-a', [], '/review?workspaceId=workspace-a'],
    ['/login?driveHistory=connected', ['ADMIN'], '/'],
    ['/login?driveHistory=connected&returnTo=%2F%2Fevil.example', ['ADVISER'], '/adviser']
  ])('resumes %s before the normal sign-in card mounts', async (route, roles, destination) => {
    api.getCurrentSession.mockResolvedValue({ ...connected, roles });
    show(route);
    expect(await screen.findByRole('heading', { name: 'Private page: Private workspace' })).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toBe(destination);
    expect(screen.queryByRole('heading', { name: 'Sign in with Google' })).not.toBeInTheDocument();
    expect(privateMount).toHaveBeenCalledTimes(1);
    expect(api.startGoogleSignIn).not.toHaveBeenCalled();
    expect(api.authenticateGoogle).not.toHaveBeenCalled();
  });

});
