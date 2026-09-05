import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceSession } from './WorkspaceSession.jsx';

const workflow = vi.hoisted(() => ({
  session: { authenticated: true, email: 'server@student.test', roles: [] },
  workspaces: [{ id: 'ws-1', name: 'Backend workspace' }],
  activeWorkspace: { id: 'ws-1', name: 'Backend workspace' },
  activeWorkspaceId: 'ws-1',
  needsWorkspaceChoice: false,
  workspaceCatalogStatus: 'ready',
  workspaceCatalogError: '',
  refreshWorkspaceCatalog: vi.fn(),
  switchWorkspace: vi.fn(),
  refreshSession: vi.fn(),
  logoutStudentAccount: vi.fn(),
  logoutStaffSession: vi.fn(),
  state: {
    activeAccountEmail: 'stale@browser.test',
    studentAccounts: [{ email: 'stale@browser.test', googleSubject: 'stale-subject' }]
  }
}));

vi.mock('./WorkflowContext.jsx', () => ({ useWorkflow: () => workflow }));

describe('WorkspaceSession', () => {
  it('exposes the backend session identity instead of a mirrored browser account', () => {
    const { result } = renderHook(() => useWorkspaceSession());

    expect(result.current.account).toEqual({ email: 'server@student.test', name: '' });
    expect(result.current.session).toBe(workflow.session);
  });
});
