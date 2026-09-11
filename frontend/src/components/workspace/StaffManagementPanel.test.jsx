import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications, notifications } from '@mantine/notifications';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { StaffManagementPanel } from './StaffManagementPanel.jsx';

const api = vi.hoisted(() => ({
  getStaffProfiles: vi.fn(),
  upsertStaffEmail: vi.fn(),
  saveStaffProfile: vi.fn(),
  assignAdviserTeam: vi.fn(),
  unassignAdviserTeam: vi.fn(),
  revokeStaffAccess: vi.fn()
}));

vi.mock('../../lib/api.js', () => ({
  getStaffProfiles: api.getStaffProfiles,
  getStaffDirectory: async () => directory(await api.getStaffProfiles()),
  saveStaffDirectory: api.saveStaffProfile,
  saveStaffProfile: api.saveStaffProfile,
  upsertStaffEmail: api.upsertStaffEmail,
  assignAdviserTeam: api.assignAdviserTeam,
  unassignAdviserTeam: api.unassignAdviserTeam,
  revokeStaffAccess: api.revokeStaffAccess
}));

function directory(profiles) {
  return { workspaceIds: ['ws-123'], profiles: profiles.map(profile => ({ profile, assignments: (profile.assignedTeams || []).map(teamCode => ({ workspaceId: 'ws-123', teamCode })) })),
    teams: ['01', '02', '03'].map(number => ({ workspaceId: 'ws-123', workspaceName: 'IT332', teamCode: '2526-sem2-it332-' + number, adviserNames: number === '02' ? ['Dr. Rivera'] : [] })) };
}

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

  it.each(['account'])('discards a late staff list after changing %s', async (change) => {
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

  it('renders concise staff summaries without dumping assigned team identifiers into each card', async () => {
    renderPanel();

    expect(await screen.findByText('ralph@example.com')).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('adviser@example.com')).toBeInTheDocument();
    expect(screen.getByText('Adviser')).toBeInTheDocument();
    expect(screen.getByText('1 assigned capstone team. Open Edit access to review assignments.')).toBeInTheDocument();
    expect(screen.queryByText(/2526-sem2-it332-01/)).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Revoked access/i })).not.toBeInTheDocument();
  });

  it('shows revoked staff on a separate tab only when revoked access exists', async () => {
    api.getStaffProfiles.mockResolvedValueOnce([
      {
        id: 'staff-1', googleSubject: 'sub-ralph', googleEmail: 'ralph@example.com', roles: ['ADMIN'], enabled: true, assignedTeams: []
      },
      {
        id: 'staff-disabled', googleSubject: 'sub-disabled', googleEmail: 'disabled@example.com', adviserName: 'Former Adviser', roles: ['ADVISER'], enabled: false, assignedTeams: []
      }
    ]);
    renderPanel();

    expect(await screen.findByRole('tab', { name: 'Revoked access (1)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Active (1)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('disabled@example.com')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Revoked access (1)' }));
    expect(await screen.findByText('disabled@example.com')).toBeInTheDocument();
    expect(screen.getByText('Access revoked. Open Edit access to review or reactivate this account.')).toBeInTheDocument();
  });

  it('lets the staff section be collapsed without hiding its management header', async () => {
    renderPanel();
    await screen.findByText('ralph@example.com');
    const collapse = screen.getByRole('button', { name: 'Collapse Staff & Advisers' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(collapse);
    expect(screen.getByRole('button', { name: 'Expand Staff & Advisers' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Add staff \/ adviser/i })).toBeInTheDocument();
  });

  it('shows a recoverable staff load error instead of claiming the workspace has no staff', async () => {
    api.getStaffProfiles.mockRejectedValueOnce(new Error('Staff access expired. Sign in again.'));
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent('Staff access expired. Sign in again.');
    expect(screen.queryByText(/No staff or advisers registered/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('ralph@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('allows an adviser to be saved with no teams', async () => {
    api.saveStaffProfile.mockResolvedValue({
      id: 'staff-3',
      googleSubject: 'sub-new',
      googleEmail: 'new.adviser@example.com',
      roles: ['ADVISER']
    });
    api.assignAdviserTeam.mockResolvedValue(undefined);

    renderPanel();
    await screen.findByText('ralph@example.com');
    fireEvent.click(screen.getByRole('button', { name: /Add staff \/ adviser/i }));

    const emailInput = await screen.findByLabelText(/Google Email/i);
    fireEvent.change(emailInput, { target: { value: 'new.adviser@example.com' } });

    fireEvent.click(screen.getByRole('button', { name: /Save staff member/i }));

    await waitFor(() => {
      expect(api.saveStaffProfile).toHaveBeenCalledWith(expect.objectContaining({ googleEmail: 'new.adviser@example.com', role: 'ADVISER', assignments: [] }));
    });
  });

  it('prefills imported adviser teams and saves the whole assignment once', async () => {
    const user = userEvent.setup();
    renderPanel({ students: [{ teamCode: '2526-sem2-it332-02', adviserName: 'Dr. Rivera' }], projectMetadata: [] });
    await screen.findByText('ralph@example.com');
    fireEvent.click(screen.getByRole('button', { name: /Add staff \/ adviser/i }));
    fireEvent.change(await screen.findByLabelText(/Google Email/i), { target: { value: 'rivera@example.com' } });
    const nameInput = screen.getByRole('textbox', { name: 'Staff / adviser name' });
    await user.click(nameInput);
    await user.type(nameInput, 'Rivera');
    await user.click(await screen.findByText('Dr. Rivera'));
    expect(nameInput).toHaveValue('Dr. Rivera');
    fireEvent.click(screen.getByRole('button', { name: 'Save staff member' }));
    await waitFor(() => expect(api.saveStaffProfile).toHaveBeenCalledWith(expect.objectContaining({
      googleEmail: 'rivera@example.com', adviserName: 'Dr. Rivera', assignments: [{ workspaceId: 'ws-123', teamCode: '2526-sem2-it332-02' }]
    })));
    expect(api.assignAdviserTeam).not.toHaveBeenCalled();
  });

  it('does not publish an old staff-save result into a new workspace', async () => {
    let finish;
    api.saveStaffProfile.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const view = renderPanel();
    await screen.findByText('ralph@example.com');
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
