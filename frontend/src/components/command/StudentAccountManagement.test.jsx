import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentAccountManagement } from './StudentAccountManagement.jsx';
import { createWorkspaceResourceCache } from '../../lib/workspaceResourceCache.js';

const api = vi.hoisted(() => ({ getStudentAccountBindings: vi.fn(), disconnectStudentAccountBinding: vi.fn(), recoverStudentAccountBinding: vi.fn() }));
const context = vi.hoisted(() => ({ session: { authenticated: true, email: 'admin@example.com', roles: ['ADMIN'] }, resourceCache: null }));
vi.mock('../../app/WorkspaceSession.jsx', () => ({ useWorkspaceSession: () => context }));
vi.mock('../../lib/api.js', () => api);
const record = (number = 'student-1') => ({ accounts: [{ studentRecordId: number, studentNumber: number, studentName: number, status: 'BOUND', googleEmail: `${number}@example.com` }] });
function View({ opened = true, workspaceId = 'workspace-1', onChanged = vi.fn() }) {
  return <MantineProvider><StudentAccountManagement workspaceId={workspaceId} opened={opened} onClose={() => {}} onChanged={onChanged} /></MantineProvider>;
}
describe('Student account management snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    context.session = { authenticated: true, email: 'admin@example.com', roles: ['ADMIN'] };
    context.resourceCache = createWorkspaceResourceCache();
    api.getStudentAccountBindings.mockResolvedValue(record());
    api.disconnectStudentAccountBinding.mockResolvedValue({});
  });
  it('preloads while closed and keeps the records visible on reopen and navigation', async () => {
    const view = render(<View opened={false} />);
    await waitFor(() => expect(api.getStudentAccountBindings).toHaveBeenCalledTimes(1));
    view.rerender(<View />);
    expect(await screen.findByLabelText('Account binding for student-1')).toBeInTheDocument();
    api.getStudentAccountBindings.mockReturnValue(new Promise(() => {}));
    view.rerender(<View opened={false} />);
    view.rerender(<View />);
    expect(screen.queryByText(/Loading account bindings/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Account binding for student-1')).toBeInTheDocument();
    view.unmount();
    render(<View />);
    expect(screen.getByLabelText('Account binding for student-1')).toBeInTheDocument();
  });
  it('hides the old workspace immediately and ignores its delayed mutation', async () => {
    let finishMutation;
    api.disconnectStudentAccountBinding.mockReturnValue(new Promise(resolve => { finishMutation = resolve; }));
    const changed = vi.fn();
    const view = render(<View onChanged={changed} />);
    await screen.findByLabelText('Account binding for student-1');
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect account' }));
    api.getStudentAccountBindings.mockResolvedValue(record('student-2'));
    view.rerender(<View workspaceId="workspace-2" onChanged={changed} />);
    expect(screen.queryByLabelText('Account binding for student-1')).not.toBeInTheDocument();
    await screen.findByLabelText('Account binding for student-2');
    await act(async () => finishMutation({}));
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Account binding for student-2')).toBeInTheDocument();
  });
  it('refreshes a disconnected record and removes a cached snapshot after access is denied', async () => {
    render(<View />);
    await screen.findByLabelText('Account binding for student-1');
    api.getStudentAccountBindings.mockResolvedValue({ accounts: [{ ...record().accounts[0], status: 'UNBOUND' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect account' }));
    await screen.findByText('The student can connect an account using their class details.');
    api.getStudentAccountBindings.mockRejectedValue(Object.assign(new Error('Workspace access denied'), { status: 403 }));
    await act(async () => window.dispatchEvent(new Event('wildtrack:refresh-resources')));
    await screen.findByText('Workspace access denied');
    expect(screen.queryByLabelText('Account binding for student-1')).not.toBeInTheDocument();
  });
});
