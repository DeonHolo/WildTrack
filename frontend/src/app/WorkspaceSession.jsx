import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createWorkspace as createBackendWorkspace, getCurrentSession, getWorkspaces, logout } from '../lib/api.js';
import { browserStorageKeys } from '../lib/browserStorage.js';
import { disableGoogleAutoSelect } from '../lib/googleIdentitySession.js';

const WorkspaceSessionContext = createContext(null);

export function WorkspaceSessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [sessionStatus, setSessionStatus] = useState('loading');
  const [sessionError, setSessionError] = useState('');
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [workspaceCatalogStatus, setWorkspaceCatalogStatus] = useState('idle');
  const [workspaceCatalogError, setWorkspaceCatalogError] = useState('');
  const activeRef = useRef('');
  const sessionRequest = useRef(0);
  const catalogRequest = useRef(0);

  const refreshWorkspaceCatalog = useCallback(async () => {
    const request = ++catalogRequest.current;
    setWorkspaceCatalogStatus('loading');
    setWorkspaceCatalogError('');
    try {
      const list = await getWorkspaces();
      if (request !== catalogRequest.current) return [];
      const next = Array.isArray(list) ? list : [];
      setWorkspaces(next);
      const saved = readActiveWorkspaceId();
      const selected = next.find((workspace) => workspace.id === saved)?.id || '';
      const current = next.find((workspace) => workspace.id === activeRef.current)?.id || '';
      const nextActive = selected || current || next[0]?.id || '';
      activeRef.current = nextActive;
      setActiveWorkspaceId(nextActive);
      setSelectedWorkspaceId(selected || (next.length === 1 ? nextActive : ''));
      if (next.length === 1 && nextActive) writeActiveWorkspaceId(nextActive);
      setWorkspaceCatalogStatus('ready');
      return next;
    } catch (error) {
      if (request !== catalogRequest.current) return [];
      setWorkspaces([]);
      activeRef.current = '';
      setActiveWorkspaceId('');
      setSelectedWorkspaceId('');
      setWorkspaceCatalogStatus('error');
      setWorkspaceCatalogError(error?.message || 'Workspaces could not be loaded.');
      return [];
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const request = ++sessionRequest.current;
    catalogRequest.current += 1;
    setSessionStatus('loading');
    setSessionError('');
    try {
      const current = await getCurrentSession();
      if (request !== sessionRequest.current) return null;
      setSession(current);
      setSessionStatus('ready');
      if (current?.authenticated) await refreshWorkspaceCatalog();
      else {
        setWorkspaces([]);
        activeRef.current = '';
        setActiveWorkspaceId('');
        setSelectedWorkspaceId('');
        setWorkspaceCatalogStatus('idle');
      }
      return current;
    } catch (error) {
      if (request !== sessionRequest.current) return null;
      const anonymous = { authenticated: false, roles: [] };
      setSession(anonymous);
      setWorkspaces([]);
      activeRef.current = '';
      setActiveWorkspaceId('');
      setSelectedWorkspaceId('');
      setWorkspaceCatalogStatus('idle');
      setSessionStatus('error');
      setSessionError(error?.message || 'Session could not be loaded.');
      return anonymous;
    }
  }, [refreshWorkspaceCatalog]);

  useEffect(() => {
    refreshSession();
    return () => {
      sessionRequest.current += 1;
      catalogRequest.current += 1;
    };
  }, [refreshSession]);

  const switchWorkspace = useCallback(async (workspaceIdOrPublicKey) => {
    let available = workspaces;
    let target = findWorkspace(available, workspaceIdOrPublicKey);
    if (!target) {
      available = await refreshWorkspaceCatalog();
      target = findWorkspace(available, workspaceIdOrPublicKey);
    }
    if (!target) return { ok: false, error: 'Workspace was not found.' };
    activeRef.current = target.id;
    setActiveWorkspaceId(target.id);
    setSelectedWorkspaceId(target.id);
    writeActiveWorkspaceId(target.id);
    return { ok: true, workspace: target };
  }, [refreshWorkspaceCatalog, workspaces]);

  const createWorkspace = useCallback(async (payload) => {
    const sessionAtStart = sessionRequest.current;
    const workspaceAtStart = activeRef.current;
    const isCurrent = () => sessionRequest.current === sessionAtStart && activeRef.current === workspaceAtStart;
    try {
      const workspace = await createBackendWorkspace({ ...payload, active: true });
      if (!isCurrent()) return { ok: false, error: 'Session or workspace changed. Reload to view the created workspace.' };
      catalogRequest.current += 1;
      setWorkspaces((current) => [...current.filter((item) => item.id !== workspace.id), workspace]);
      activeRef.current = workspace.id;
      setActiveWorkspaceId(workspace.id);
      setSelectedWorkspaceId(workspace.id);
      writeActiveWorkspaceId(workspace.id);
      setWorkspaceCatalogStatus('ready');
      return { ok: true, workspace };
    } catch (error) {
      if (!isCurrent()) return { ok: false, error: 'Session or workspace changed.' };
      return { ok: false, error: error?.message || 'Workspace could not be created.' };
    }
  }, []);

  const logoutSession = useCallback(async () => {
    sessionRequest.current += 1;
    catalogRequest.current += 1;
    disableGoogleAutoSelect();
    try {
      await logout();
    } finally {
      setSession({ authenticated: false, roles: [] });
      setSessionStatus('ready');
      setSessionError('');
      setWorkspaces([]);
      activeRef.current = '';
      setActiveWorkspaceId('');
      setSelectedWorkspaceId('');
      setWorkspaceCatalogStatus('idle');
    }
  }, []);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) || workspaces[0] || null;
  const value = useMemo(() => ({
    session,
    sessionStatus,
    sessionError,
    account: session?.authenticated && session.email ? { email: session.email, name: session.name || '' } : null,
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    needsWorkspaceChoice: workspaces.length > 1 && selectedWorkspaceId !== activeWorkspaceId,
    workspaceCatalogStatus,
    workspaceCatalogError,
    refreshWorkspaceCatalog,
    refreshSession,
    switchWorkspace,
    createWorkspace,
    logoutStudentAccount: logoutSession,
    logoutStaffSession: logoutSession
  }), [
    activeWorkspace,
    activeWorkspaceId,
    createWorkspace,
    logoutSession,
    refreshSession,
    refreshWorkspaceCatalog,
    selectedWorkspaceId,
    session,
    sessionError,
    sessionStatus,
    switchWorkspace,
    workspaceCatalogError,
    workspaceCatalogStatus,
    workspaces
  ]);

  return <WorkspaceSessionContext.Provider value={value}>{children}</WorkspaceSessionContext.Provider>;
}

export function useWorkspaceSession() {
  const context = useContext(WorkspaceSessionContext);
  if (!context) throw new Error('useWorkspaceSession must be used within WorkspaceSessionProvider');
  return context;
}

function findWorkspace(workspaces, value) {
  const key = String(value || '').trim().toLowerCase();
  return workspaces.find((workspace) => (
    String(workspace.id || '').toLowerCase() === key
    || String(workspace.publicKey || '').toLowerCase() === key
    || String(workspace.slug || '').toLowerCase() === key
  ));
}

function readActiveWorkspaceId() {
  try {
    return localStorage.getItem(browserStorageKeys.activeWorkspace) || '';
  } catch {
    return '';
  }
}

function writeActiveWorkspaceId(workspaceId) {
  try {
    localStorage.setItem(browserStorageKeys.activeWorkspace, workspaceId || '');
  } catch {
    // Selection still works for this page when browser storage is unavailable.
  }
}
