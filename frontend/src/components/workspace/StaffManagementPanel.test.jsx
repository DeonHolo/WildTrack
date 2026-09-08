import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications, notifications } from '@mantine/notifications';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { StaffManagementPanel } from './StaffManagementPanel.jsx';

const api = vi.hoisted(() => ({
  getStaffProfiles: vi.fn(),
  upsertStaffEmail: vi.fn(),
  assignAdviserTeam: vi.fn(),
  unassignAdviserTeam: vi.fn(),
  revokeStaffAccess: vi.fn()
}));

vi.mock('../../lib/api.js', () => ({
  getStaffProfiles: api.getStaffProfiles,
  upsertStaffEmail: api.upsertStaffEmail,
  assignAdviserTeam: api.assignAdviserTeam,
  unassignAdviserTeam: api.unassignAdviserTeam,
  revokeStaffAccess: api.revokeStaffAccess
}));

const scope = vi.hoisted(() => ({ email: 'admin@example.com' }));
vi.mock('../../app/WorkspaceSession.jsx', () => ({
  useWorkspaceSession: () => ({ session: { authenticated: true, email: scope.email } })
}));

function panelTree(props = {}) {
  return (
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ModalsProvider>
        <Notifications />
        <StaffManagementPanel
          workspaceId="ws-123"
          students={[
            { teamCode: '2526-sem2-it332-01' },
            { teamCode: '2526-sem2-it332-02' }
          ]}
          projectMetadata={[
            { groupCode: '2526-sem2-it332-03' }
          ]}
          {...props}
        />
      </ModalsProvider>
    </MantineProvider>
  );
}

function renderPanel(props = {}) {
  return render(panelTree(props));
}

describe('StaffManagementPanel', () => {
  beforeEach(() => {
    notifications.clean();
    scope.email = 'admin@example.com';
    Object.values(api).forEach((fn) => fn.mockReset());
    api.getStaffProfiles.mockResolvedValue([
      {
        id: 'staff-1',
        googleSubject: 'sub-ralph',
        googleEmail: 'ralph@example.com',
        roles: ['ADMIN'],
        enabled: true,
        assignedTeams: []
      },
      {
        id: 'staff-2',
        googleSubject: 'sub-adviser',
        googleEmail: 'adviser@example.com',
        roles: ['ADVISER'],
        enabled: true,
        assignedTeams: ['2526-sem2-it332-01']
      }
    ]);
  });

  it.each(['workspace', 'account'])('discards a late staff list after changing %s', async (change) => {
    let resolveOld;
    api.getStaffProfiles.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    const view = renderPanel();
    if (change === 'account') scope.email = 'other@example.com';
    view.rerender(panelTree({ workspaceId: change === 'workspace' ? 'ws-new' : 'ws-123' }));
    await act(async () => {
      resolveOld([{ googleSubject: 'old', googleEmail: 'obsolete@example.com', roles: ['ADMIN'] }]);
    });
    expect(screen.queryByText('obsolete@example.com')).not.toBeInTheDocument();
    expect(await screen.findByText('ralph@example.com')).toBeInTheDocument();
  });

  it('renders staff members with role badges and assigned teams', async () => {
    renderPanel();

    expect(await screen.findByText('ralph@example.com')).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('adviser@example.com')).toBeInTheDocument();
    expect(screen.getByText('Adviser')).toBeInTheDocument();
    expect(screen.getByText('2526-sem2-it332-01')).toBeInTheDocument();
  });

  it('shows a recoverable staff load error instead of claiming the workspace has no staff', async () => {
    api.getStaffProfiles.mockRejectedValueOnce(new Error('Staff access expired. Sign in again.'));
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent('Staff access expired. Sign in again.');
    expect(screen.queryByText(/No staff or advisers registered/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry staff load' }));
    expect(await screen.findByText('ralph@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('opens add staff dialog and submits new adviser with selected teams', async () => {
    api.upsertStaffEmail.mockResolvedValue({
      id: 'staff-3',
      googleSubject: 'sub-new',
      googleEmail: 'new.adviser@example.com',
      roles: ['ADVISER']
    });
    api.assignAdviserTeam.mockResolvedValue(undefined);

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Add staff \/ adviser/i }));

    const emailInput = await screen.findByLabelText(/Google Email/i);
    fireEvent.change(emailInput, { target: { value: 'new.adviser@example.com' } });

    fireEvent.click(screen.getByRole('button', { name: /Save staff member/i }));

    await waitFor(() => {
      expect(api.upsertStaffEmail).toHaveBeenCalledWith('ws-123', 'new.adviser@example.com', ['ADVISER']);
    });
  });

  it('unassigns a team when clicking the close button on a team pill', async () => {
    api.unassignAdviserTeam.mockResolvedValue(undefined);
    renderPanel();

    const unassignBtn = await screen.findByRole('button', { name: 'Unassign 2526-sem2-it332-01' });
    fireEvent.click(unassignBtn);

    await waitFor(() => {
      expect(api.unassignAdviserTeam).toHaveBeenCalledWith('ws-123', 'sub-adviser', '2526-sem2-it332-01');
    });
  });

  it('does not publish an old staff-save result into a new workspace', async () => {
    let finish;
    api.upsertStaffEmail.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const view = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Add staff \/ adviser/i }));
    fireEvent.change(await screen.findByLabelText(/Google Email/i), { target: { value: 'private-old@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Save staff member/i }));
    view.rerender(panelTree({ workspaceId: 'ws-new' }));
    await act(async () => { finish({ googleSubject: 'old-adviser' }); });
    expect(screen.queryByText(/private-old@example.com is now assigned/)).not.toBeInTheDocument();
  });

  it('revokes staff access with confirmation', async () => {
    api.revokeStaffAccess.mockResolvedValue(undefined);
    renderPanel();

    const revokeBtn = await screen.findByRole('button', { name: 'Revoke access for adviser@example.com' });
    fireEvent.click(revokeBtn);

    const confirmBtn = await screen.findByRole('button', { name: 'Revoke access' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.revokeStaffAccess).toHaveBeenCalledWith('ws-123', 'sub-adviser');
    });
  });
});
