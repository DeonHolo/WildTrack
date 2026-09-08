import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceSessionProvider, useWorkspaceSession } from './WorkspaceSession.jsx';

const api = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  getCurrentSession: vi.fn(),
  getWorkspaces: vi.fn(),
  logout: vi.fn()
}));

vi.mock('../lib/api.js', () => api);
vi.mock('../lib/googleIdentitySession.js', () => ({ disableGoogleAutoSelect: vi.fn() }));

describe('WorkspaceSession', () => {
  beforeEach(() => {
    localStorage.clear();
    api.getCurrentSession.mockReset().mockResolvedValue({
      authenticated: true,
      email: 'server@student.test',
      name: '',
      roles: []
    });
    api.getWorkspaces.mockReset().mockResolvedValue([{ id: 'ws-1', name: 'Backend workspace' }]);
  });

  it('exposes the backend session identity and workspace catalog', async () => {
    const wrapper = ({ children }) => <WorkspaceSessionProvider>{children}</WorkspaceSessionProvider>;
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper });

    await waitFor(() => expect(result.current.sessionStatus).toBe('ready'));
    expect(result.current.account).toEqual({ email: 'server@student.test', name: '' });
    expect(result.current.activeWorkspace).toEqual({ id: 'ws-1', name: 'Backend workspace' });
  });

  it('does not restore an authenticated session when a refresh finishes after logout', async () => {
    const wrapper = ({ children }) => <WorkspaceSessionProvider>{children}</WorkspaceSessionProvider>;
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper });
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe('ws-1'));
    let finish;
    api.getCurrentSession.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    let refreshing;
    act(() => { refreshing = result.current.refreshSession(); });
    await act(async () => { await result.current.logoutStudentAccount(); });
    await act(async () => {
      finish({ authenticated: true, email: 'server@student.test', roles: [] });
      await refreshing;
    });
    expect(result.current.account).toBeNull();
    expect(result.current.activeWorkspaceId).toBe('');
    expect(result.current.workspaces).toEqual([]);
    expect(result.current.sessionStatus).toBe('ready');
  });

  it('discards a workspace catalog that finishes after logout', async () => {
    const wrapper = ({ children }) => <WorkspaceSessionProvider>{children}</WorkspaceSessionProvider>;
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper });
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe('ws-1'));
    let finish;
    api.getWorkspaces.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    let refreshing;
    act(() => { refreshing = result.current.refreshWorkspaceCatalog(); });
    await act(async () => { await result.current.logoutStudentAccount(); });
    await act(async () => {
      finish([{ id: 'private-workspace', name: 'Private workspace' }]);
      await refreshing;
    });
    expect(result.current.workspaces).toEqual([]);
    expect(result.current.activeWorkspaceId).toBe('');
  });

  it('clears private workspace data when session verification fails', async () => {
    const wrapper = ({ children }) => <WorkspaceSessionProvider>{children}</WorkspaceSessionProvider>;
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper });
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe('ws-1'));
    api.getCurrentSession.mockRejectedValueOnce(new Error('Session unavailable'));
    await act(async () => { await result.current.refreshSession(); });
    expect(result.current.account).toBeNull();
    expect(result.current.workspaces).toEqual([]);
    expect(result.current.activeWorkspaceId).toBe('');
    expect(result.current.sessionError).toBe('Session unavailable');
  });

  it('does not restore a workspace created before the user logged out', async () => {
    const wrapper = ({ children }) => <WorkspaceSessionProvider>{children}</WorkspaceSessionProvider>;
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper });
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe('ws-1'));
    let finish;
    api.createWorkspace.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    let creating;
    act(() => { creating = result.current.createWorkspace({ name: 'Private new workspace' }); });
    await act(async () => { await result.current.logoutStudentAccount(); });
    let outcome;
    await act(async () => {
      finish({ id: 'private-new', name: 'Private new workspace' });
      outcome = await creating;
    });
    expect(result.current.workspaces).toEqual([]);
    expect(result.current.activeWorkspaceId).toBe('');
    expect(outcome.ok).toBe(false);
  });
});
