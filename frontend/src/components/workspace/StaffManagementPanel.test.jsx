import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

function renderPanel(props = {}) {
  return render(
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ModalsProvider>
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

describe('StaffManagementPanel', () => {
  beforeEach(() => {
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

  it('renders staff members with role badges and assigned teams', async () => {
    renderPanel();

    expect(await screen.findByText('ralph@example.com')).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('adviser@example.com')).toBeInTheDocument();
    expect(screen.getByText('Adviser')).toBeInTheDocument();
    expect(screen.getByText('2526-sem2-it332-01')).toBeInTheDocument();
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
