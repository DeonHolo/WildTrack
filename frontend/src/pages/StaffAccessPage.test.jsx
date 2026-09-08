import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { StaffAccessPage } from './StaffAccessPage.jsx';

const clients = vi.hoisted(() => ({ unassignTeam: vi.fn(), revokeStaff: vi.fn() }));
const scope = vi.hoisted(() => ({ activeWorkspaceId: 'workspace', session: { authenticated: true, email: 'admin@example.com' } }));
vi.mock('../app/WorkspaceSession.jsx', () => ({ useWorkspaceSession: () => scope }));
vi.mock('../hooks/useWorkspaceResource.js', () => ({ useWorkspaceResource: () => ({
  data: { profiles: [{ googleSubject: 'adviser', googleEmail: 'adviser@example.test', roles: ['ADVISER'], assignedTeams: ['TEAM-A'] }], teamCodes: ['TEAM-A'] },
  status: 'ready', error: '', setData: vi.fn(), reload: vi.fn()
}) }));
vi.mock('../lib/staffAccessClient.js', () => ({
  ...clients, emptyStaffAccess: vi.fn(), loadStaffAccess: vi.fn(), addStaff: vi.fn(), assignTeam: vi.fn()
}));

beforeEach(() => { vi.resetAllMocks(); scope.activeWorkspaceId = 'workspace'; });

it('discards an old staff mutation failure after switching workspace', async () => {
  let fail;
  clients.unassignTeam.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
  const tree = () => <MantineProvider><ModalsProvider><StaffAccessPage /></ModalsProvider></MantineProvider>;
  const view = render(tree());
  fireEvent.click(screen.getByRole('button', { name: 'Remove TEAM-A' }));
  scope.activeWorkspaceId = 'new-workspace';
  view.rerender(tree());
  await act(async () => { fail(new Error('Private old assignment failure')); });
  expect(screen.queryByText('Private old assignment failure')).not.toBeInTheDocument();
});

it.each(['unassign', 'revoke'])('shows rejected %s without removing existing access locally', async (action) => {
  clients[action === 'unassign' ? 'unassignTeam' : 'revokeStaff'].mockRejectedValue(new Error('Access changed. Reload and try again.'));
  render(<MantineProvider><ModalsProvider><StaffAccessPage /></ModalsProvider></MantineProvider>);
  if (action === 'unassign') fireEvent.click(screen.getByRole('button', { name: 'Remove TEAM-A' }));
  else {
    fireEvent.click(screen.getByRole('button', { name: 'Revoke', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke access', exact: true }));
  }
  expect(await screen.findByRole('alert')).toHaveTextContent('Access changed. Reload and try again.');
  expect(screen.getByText('adviser@example.test')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove TEAM-A' })).toBeInTheDocument();
});
