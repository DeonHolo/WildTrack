import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceSessionProvider, useWorkspaceSession } from './WorkspaceSession.jsx';
import { browserStorageKeys } from '../lib/browserStorage.js';

const api = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  getCurrentSession: vi.fn(),
  getWorkspaces: vi.fn(),
  logout: vi.fn(),
  updateWorkspace: vi.fn()
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
    api.createWorkspace.mockReset();
    api.updateWorkspace.mockReset();
    api.logout.mockReset();
  });

  it('exposes the backend session identity and workspace catalog', async () => {
    const wrapper = ({ children }) => <WorkspaceSessionProvider>{children}</WorkspaceSessionProvider>;
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper });

    await waitFor(() => expect(result.current.sessionStatus).toBe('ready'));
    expect(result.current.account).toEqual({ email: 'server@student.test', name: '' });
    expect(result.current.activeWorkspace).toEqual({ id: 'ws-1', name: 'Backend workspace' });
  });

  it('auto-selects and persists the only workspace without requiring a choice', async () => {
    const wrapper = ({ children }) => <WorkspaceSessionProvider>{children}</WorkspaceSessionProvider>;
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper });

    await waitFor(() => expect(result.current.activeWorkspaceId).toBe('ws-1'));
    expect(result.current.needsWorkspaceChoice).toBe(false);
    expect(localStorage.getItem(browserStorageKeys.activeWorkspace)).toBe('ws-1');
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

  it('keeps archived workspaces out of normal selection while admin management can archive and restore them', async () => {
    const activeOne = {
      id: 'ws-1', name: 'Workspace One', program: 'IT', courseCode: 'IT332', semester: 'Semester 1', academicYear: '2026-27', active: true
    };
    const activeTwo = {
      id: 'ws-2', name: 'Workspace Two', program: 'CS', courseCode: 'CS332', semester: 'Semester 1', academicYear: '2026-27', active: true
    };
    const archived = {
      id: 'ws-old', name: 'Archived Workspace', program: 'IT', courseCode: 'IT331', semester: 'Semester 2', academicYear: '2025-26', active: false
    };
    api.getWorkspaces.mockReset()
      .mockResolvedValueOnce([activeOne, activeTwo])
      .mockResolvedValueOnce([activeOne, activeTwo, archived]);

    const wrapper = ({ children }) => <WorkspaceSessionProvider>{children}</WorkspaceSessionProvider>;
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper });
    await waitFor(() => expect(result.current.workspaces.map((workspace) => workspace.id)).toEqual(['ws-1', 'ws-2']));
    expect(result.current.allWorkspaces).toEqual([activeOne, activeTwo]);

    await act(async () => { await result.current.refreshWorkspaceManagementCatalog(); });
    expect(api.getWorkspaces).toHaveBeenLastCalledWith(true);
    expect(result.current.workspaces.map((workspace) => workspace.id)).toEqual(['ws-1', 'ws-2']);
    expect(result.current.archivedWorkspaces.map((workspace) => workspace.id)).toEqual(['ws-old']);

    api.updateWorkspace.mockResolvedValueOnce({ ...activeOne, active: false });
    await act(async () => { await result.current.updateWorkspace('ws-1', { active: false }); });
    expect(api.updateWorkspace).toHaveBeenCalledWith('ws-1', expect.objectContaining({
      name: 'Workspace One',
      active: false
    }));
    expect(result.current.workspaces.map((workspace) => workspace.id)).toEqual(['ws-2']);
    expect(result.current.allWorkspaces.find((workspace) => workspace.id === 'ws-1')).toMatchObject({ active: false });
    expect(result.current.archivedWorkspaces.map((workspace) => workspace.id)).toEqual(['ws-1', 'ws-old']);
    expect(result.current.activeWorkspaceId).toBe('ws-2');

    api.updateWorkspace.mockResolvedValueOnce({ ...activeOne, active: true });
    await act(async () => { await result.current.updateWorkspace('ws-1', { active: true }); });
    expect(result.current.workspaces.map((workspace) => workspace.id)).toEqual(['ws-1', 'ws-2']);
    expect(result.current.archivedWorkspaces.map((workspace) => workspace.id)).toEqual(['ws-old']);
  });
});
