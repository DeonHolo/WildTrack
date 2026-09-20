import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { DriveHistoryAccountAccess } from './DriveHistoryAccountAccess.jsx';

const getDriveHistoryConsentStatus = vi.fn();
const disconnectDriveHistoryConsent = vi.fn();
const useWorkspaceSession = vi.fn();
vi.mock('../../app/WorkspaceSession.jsx', () => ({ useWorkspaceSession: () => useWorkspaceSession() }));
vi.mock('../../lib/api.js', () => ({
  getDriveHistoryConsentStatus: (...args) => getDriveHistoryConsentStatus(...args),
  disconnectDriveHistoryConsent: (...args) => disconnectDriveHistoryConsent(...args)
}));

function show() {
  return render(<MantineProvider theme={wildTrackTheme} forceColorScheme="light">
    <DriveHistoryAccountAccess />
  </MantineProvider>);
}

describe('account Drive history settings', () => {
  beforeEach(() => {
    getDriveHistoryConsentStatus.mockReset().mockResolvedValue({ configured: true, connected: true });
    disconnectDriveHistoryConsent.mockReset().mockResolvedValue({ configured: true, connected: false });
    useWorkspaceSession.mockReturnValue({ session: { authenticated: true, googleSubject: 'signed-in-account' } });
  });

  it('offers disconnect from the account menu and hides the control once disconnected', async () => {
    show();
    const settings = await screen.findByRole('button', { name: 'Drive history settings' });
    fireEvent.click(settings);
    expect(settings).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText(/Read-only Google Drive metadata is connected/i)).toBeInTheDocument();
    // JSDOM does not position Mantine's portal, leaving its dropdown display:none despite the expanded trigger.
    fireEvent.click(screen.getByRole('menuitem', { name: 'Disconnect Drive history', hidden: true }));
    await waitFor(() => expect(disconnectDriveHistoryConsent).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Drive history settings' })).not.toBeInTheDocument());
  });

  it('does not show metadata settings for unconnected or signed-out accounts', async () => {
    getDriveHistoryConsentStatus.mockResolvedValue({ configured: true, connected: false });
    const view = show();
    await waitFor(() => expect(getDriveHistoryConsentStatus).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Drive history settings' })).not.toBeInTheDocument();
    view.unmount();
    getDriveHistoryConsentStatus.mockClear();
    useWorkspaceSession.mockReturnValue({ session: { authenticated: false } });
    show();
    expect(getDriveHistoryConsentStatus).not.toHaveBeenCalled();
  });
});
