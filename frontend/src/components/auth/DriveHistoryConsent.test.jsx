import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { DriveHistoryConsent } from './DriveHistoryConsent.jsx';

const getDriveHistoryConsentStatus = vi.fn();
const startDriveHistoryConsent = vi.fn();
const useWorkspaceSession = vi.fn();
vi.mock('../../app/WorkspaceSession.jsx', () => ({ useWorkspaceSession: () => useWorkspaceSession() }));
vi.mock('../../lib/api.js', () => ({
  getDriveHistoryConsentStatus: (...args) => getDriveHistoryConsentStatus(...args),
  startDriveHistoryConsent: (...args) => startDriveHistoryConsent(...args)
}));

function show() {
  return render(<MantineProvider theme={wildTrackTheme} forceColorScheme="light"><DriveHistoryConsent /></MantineProvider>);
}

describe('post-login Drive history consent', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    getDriveHistoryConsentStatus.mockReset().mockResolvedValue({ configured: true, connected: false });
    startDriveHistoryConsent.mockReset();
    useWorkspaceSession.mockReturnValue({ session: { authenticated: true, googleSubject: 'student-subject', email: 'student@example.test' } });
  });

  it('asks after sign-in and allows skipping without affecting the authenticated session', async () => {
    show();
    expect(await screen.findByText('Allow file history from Google Drive?')).toBeInTheDocument();
    expect(screen.getByText(/read-only Drive metadata access/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(screen.queryByRole('region', { name: 'Google Drive history access' })).not.toBeInTheDocument();
    expect(sessionStorage.getItem('wildtrack.drive-history-consent-dismissed:student-subject')).toBe('1');
    expect(startDriveHistoryConsent).not.toHaveBeenCalled();
  });

  it('does not leave a connected-status card floating over the application', async () => {
    getDriveHistoryConsentStatus.mockResolvedValue({ configured: true, connected: true });
    show();
    await waitFor(() => expect(getDriveHistoryConsentStatus).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('region', { name: 'Google Drive history access' })).not.toBeInTheDocument();
  });

  it('does not prompt when the endpoint is not configured or the user is signed out', async () => {
    getDriveHistoryConsentStatus.mockResolvedValue({ configured: false, connected: false });
    const view = show();
    await waitFor(() => expect(getDriveHistoryConsentStatus).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('region', { name: 'Google Drive history access' })).not.toBeInTheDocument();
    view.unmount();
    getDriveHistoryConsentStatus.mockClear();
    useWorkspaceSession.mockReturnValue({ session: { authenticated: false } });
    show();
    expect(getDriveHistoryConsentStatus).not.toHaveBeenCalled();
  });

  it.each(['declined', 'error', 'unavailable'])('shows optional %s callback feedback and waits for explicit retry', async outcome => {
    window.history.replaceState({}, '', '/student?driveHistory=' + outcome + '&section=it');
    sessionStorage.setItem('wildtrack.drive-history-consent-dismissed:student-subject', '1');
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission/);
    expect(startDriveHistoryConsent).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?section=it');
    fireEvent.click(screen.getByRole('button', { name: 'Retry Drive permission' }));
    await waitFor(() => expect(startDriveHistoryConsent).toHaveBeenCalledTimes(1));
  });

  it('has no optional prompt or skip action when Drive permission is required for login', () => {
    useWorkspaceSession.mockReturnValue({ session: { authenticated: true, googleSubject: 'student-subject', driveHistoryRequired: true, driveHistoryConnected: false } });
    show();
    expect(getDriveHistoryConsentStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Google Drive history access' })).not.toBeInTheDocument();
  });

});
