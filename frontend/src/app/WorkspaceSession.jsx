import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createWorkspaceResourceCache } from '../lib/workspaceResourceCache.js';
import {
  createWorkspace as createBackendWorkspace,
  getCurrentSession,
  getWorkspaces,
  logout,
  updateWorkspace as updateBackendWorkspace
} from '../lib/api.js';
import { browserStorageKeys } from '../lib/browserStorage.js';
import { requiresDriveHistoryConsent } from '../lib/driveHistoryLogin.js';
import { disableGoogleAutoSelect } from '../lib/googleIdentitySession.js';

const WorkspaceSessionContext = createContext(null);
const EMPTY_WORKSPACES = [];

export function WorkspaceSessionProvider({ children }) {
  const [resourceCache] = useState(createWorkspaceResourceCache);
  const [session, setSession] = useState(null);
  const [sessionStatus, setSessionStatus] = useState('loading');
  const [sessionError, setSessionError] = useState('');
  const [allWorkspaces, setAllWorkspaces] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [workspaceCatalogStatus, setWorkspaceCatalogStatus] = useState('idle');
  const [workspaceCatalogError, setWorkspaceCatalogError] = useState('');
  const activeRef = useRef('');
  const sessionRequest = useRef(0);
  const catalogRequest = useRef(0);
  const sessionIdentity = useRef('');
  const workspaceAccess = useRef(false);

  useLayoutEffect(() => {
    if (session !== null) resourceCache.retainAccount(session?.authenticated && !requiresDriveHistoryConsent(session)
      ? JSON.stringify([session.email, session.googleSubject, session.roles]) : '');
  }, [resourceCache, session?.authenticated, session?.email, session?.googleSubject, JSON.stringify(session?.roles || []), session?.driveHistoryRequired, session?.driveHistoryConnected]);

  useEffect(() => {
    const invalidate = () => {
      resourceCache.invalidate();
      try { localStorage.setItem('wildtrack.resource-invalidation', `${Date.now()}:${Math.random()}`); } catch { /* Optional storage. */ }
    };
    window.addEventListener('wildtrack:server-mutation', invalidate);
    return () => window.removeEventListener('wildtrack:server-mutation', invalidate);
  }, [resourceCache]);

  const refreshWorkspaceCatalog = useCallback(async () => {
    if (!workspaceAccess.current) return [];
    const request = ++catalogRequest.current;
    setWorkspaceCatalogStatus('loading');
    setWorkspaceCatalogError('');
    try {
      const key = JSON.stringify([sessionIdentity.current, '', 'workspace-catalog']);
      const cached = resourceCache.read(key);
      if (!activeRef.current && Array.isArray(cached) && cached.length) {
        const cachedActive = activeWorkspaceCatalog(cached);
        const selected = cachedActive.find(workspace => workspace.id === readActiveWorkspaceId())?.id || '';
        const nextActive = selected || cachedActive[0]?.id || '';
        setAllWorkspaces(cached);
        setWorkspaces(cachedActive);
        activeRef.current = nextActive;
        setActiveWorkspaceId(nextActive);
        setSelectedWorkspaceId(selected || (cachedActive.length === 1 ? nextActive : ''));
        setWorkspaceCatalogStatus('ready');
      }
      const list = await resourceCache.load(key, getWorkspaces);
      if (request !== catalogRequest.current) return [];
      const all = Array.isArray(list) ? list : [];
      const next = activeWorkspaceCatalog(all);
      setAllWorkspaces(all);
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
      if (error?.status === 401 || error?.status === 403) {
        resourceCache.clear();
        setAllWorkspaces([]);
        setWorkspaces([]);
        activeRef.current = '';
        setActiveWorkspaceId('');
        setSelectedWorkspaceId('');
      }
      setWorkspaceCatalogStatus('error');
      setWorkspaceCatalogError(error?.message || 'Workspaces could not be loaded.');
      return [];
    }
  }, [resourceCache]);

  const refreshSession = useCallback(async ({ blockAppAccess = false } = {}) => {
    const request = ++sessionRequest.current;
    catalogRequest.current += 1;
    if (blockAppAccess || !workspaceAccess.current) {
      workspaceAccess.current = false;
      setSessionStatus('loading');
    }
    setSessionError('');
    try {
      const current = await getCurrentSession();
      if (request !== sessionRequest.current) return null;
      const identity = current?.authenticated ? JSON.stringify([current.email, current.googleSubject, current.roles]) : '';
      const allowed = current?.authenticated && !requiresDriveHistoryConsent(current);
      resourceCache.retainAccount(allowed ? identity : '');
      if (!allowed || sessionIdentity.current !== identity) {
        setAllWorkspaces([]);
        setWorkspaces([]);
        activeRef.current = '';
        setActiveWorkspaceId('');
        setSelectedWorkspaceId('');
      }
      sessionIdentity.current = identity;
      workspaceAccess.current = Boolean(allowed);
      const permissionIdentity = JSON.stringify([identity, current?.driveHistoryRequired, current?.driveHistoryConnected]);
      try {
        if (localStorage.getItem('wildtrack.session-identity') !== permissionIdentity) localStorage.setItem('wildtrack.session-identity', permissionIdentity);
      } catch { /* Optional storage. */ }
      setSession(current);
      setSessionStatus('ready');
      if (allowed) await refreshWorkspaceCatalog();
      else {
        setAllWorkspaces([]);
        setWorkspaces([]);
        activeRef.current = '';
        setActiveWorkspaceId('');
        setSelectedWorkspaceId('');
        setWorkspaceCatalogStatus('idle');
      }
      if (request !== sessionRequest.current) return null;
      return current;
    } catch (error) {
      if (request !== sessionRequest.current) return null;
      workspaceAccess.current = false;
      sessionIdentity.current = '';
      resourceCache.clear();
      const anonymous = { authenticated: false, roles: [] };
      setSession(anonymous);
      setAllWorkspaces([]);
      setWorkspaces([]);
      activeRef.current = '';
      setActiveWorkspaceId('');
      setSelectedWorkspaceId('');
      setWorkspaceCatalogStatus('idle');
      setSessionStatus('error');
      setSessionError(error?.message || 'Session could not be loaded.');
      return anonymous;
    }
  }, [refreshWorkspaceCatalog, resourceCache]);

  const completeGoogleSignIn = useCallback(async () => {
    const current = await refreshSession({ blockAppAccess: true });
    if (!current?.authenticated) throw new Error('Your WildTrack session could not be opened. Please retry Google sign-in.');
    // Required deployments sign in through the combined server OAuth flow.
    // A stale ID-token callback never opens access or starts a second consent.
    return requiresDriveHistoryConsent(current) ? null : current;
  }, [refreshSession]);

  useEffect(() => {
    refreshSession();
    return () => {
      sessionRequest.current += 1;
      catalogRequest.current += 1;
    };
  }, [refreshSession]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === 'wildtrack.session-identity') {
        // Another tab changed account or permissions. Remove private content before reauthentication.
        resourceCache.clear();
        workspaceAccess.current = false;
        sessionRequest.current += 1;
        catalogRequest.current += 1;
        setSession(null);
        setAllWorkspaces([]);
        setWorkspaces([]);
        activeRef.current = '';
        setActiveWorkspaceId('');
        setSelectedWorkspaceId('');
        refreshSession();
      } else if (event.key === 'wildtrack.resource-invalidation') {
        resourceCache.invalidate();
        window.dispatchEvent(new Event('wildtrack:refresh-resources'));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [resourceCache, refreshSession]);

  useEffect(() => {
    const requireDriveHistory = () => {
      if (!workspaceAccess.current) return;
      workspaceAccess.current = false;
      resourceCache.clear();
      sessionRequest.current += 1;
      catalogRequest.current += 1;
      setSession(null);
      setAllWorkspaces([]);
      setWorkspaces([]);
      activeRef.current = '';
      setActiveWorkspaceId('');
      setSelectedWorkspaceId('');
      refreshSession({ blockAppAccess: true });
    };
    window.addEventListener('wildtrack:drive-history-required', requireDriveHistory);
    return () => window.removeEventListener('wildtrack:drive-history-required', requireDriveHistory);
  }, [resourceCache, refreshSession]);

  const switchWorkspace = useCallback(async (workspaceIdOrPublicKey) => {
    if (!workspaceAccess.current) return { ok: false, error: 'Complete Google sign-in before choosing a workspace.' };
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
    if (!workspaceAccess.current) return { ok: false, error: 'Complete Google sign-in before creating a workspace.' };
    const sessionAtStart = sessionRequest.current;
    const workspaceAtStart = activeRef.current;
    const isCurrent = () => sessionRequest.current === sessionAtStart && activeRef.current === workspaceAtStart;
    try {
      const workspace = await createBackendWorkspace({ ...payload, active: true });
      if (!isCurrent()) return { ok: false, error: 'Session or workspace changed. Reload to view the created workspace.' };
      catalogRequest.current += 1;
      setAllWorkspaces((current) => [...current.filter((item) => item.id !== workspace.id), workspace]);
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

  const refreshWorkspaceManagementCatalog = useCallback(async () => {
    if (!workspaceAccess.current) return { ok: false, error: 'Complete Google sign-in before loading workspaces.' };
    const sessionAtStart = sessionRequest.current;
    try {
      const list = await getWorkspaces(true);
      if (sessionRequest.current !== sessionAtStart) return { ok: false, error: 'Session changed.' };
      const all = Array.isArray(list) ? list : [];
      const active = activeWorkspaceCatalog(all);
      setAllWorkspaces(all);
      setWorkspaces(active);
      if (!active.some((workspace) => workspace.id === activeRef.current)) {
        const nextActiveId = active[0]?.id || '';
        activeRef.current = nextActiveId;
        setActiveWorkspaceId(nextActiveId);
        setSelectedWorkspaceId(nextActiveId);
        writeActiveWorkspaceId(nextActiveId);
      }
      return { ok: true, workspaces: all };
    } catch (error) {
      if (sessionRequest.current !== sessionAtStart) return { ok: false, error: 'Session changed.' };
      return { ok: false, error: error?.message || 'Archived workspaces could not be loaded.' };
    }
  }, []);

  const updateWorkspace = useCallback(async (workspaceId, updates = {}) => {
    if (!workspaceAccess.current) return { ok: false, error: 'Complete Google sign-in before updating a workspace.' };
    const sessionAtStart = sessionRequest.current;
    const existing = allWorkspaces.find((workspace) => workspace.id === workspaceId);
    if (!existing) return { ok: false, error: 'Workspace was not found.' };
    const payload = {
      name: existing.name,
      program: existing.program,
      courseCode: existing.courseCode,
      semester: existing.semester,
      academicYear: existing.academicYear,
      active: existing.active !== false,
      ...updates
    };
    try {
      const workspace = await updateBackendWorkspace(workspaceId, payload);
      if (sessionRequest.current !== sessionAtStart) return { ok: false, error: 'Session changed. Reload to view the workspace update.' };
      catalogRequest.current += 1;
      const nextAll = allWorkspaces.map((item) => item.id === workspace.id ? workspace : item);
      const nextActiveWorkspaces = activeWorkspaceCatalog(nextAll);
      setAllWorkspaces(nextAll);
      setWorkspaces(nextActiveWorkspaces);

      let nextActiveId = activeRef.current;
      if (!nextActiveWorkspaces.some((item) => item.id === nextActiveId)) {
        nextActiveId = nextActiveWorkspaces[0]?.id || '';
        activeRef.current = nextActiveId;
        setActiveWorkspaceId(nextActiveId);
        setSelectedWorkspaceId(nextActiveId);
        writeActiveWorkspaceId(nextActiveId);
      } else if (!nextActiveId && workspace.active !== false) {
        nextActiveId = workspace.id;
        activeRef.current = nextActiveId;
        setActiveWorkspaceId(nextActiveId);
        setSelectedWorkspaceId(nextActiveId);
        writeActiveWorkspaceId(nextActiveId);
      }
      setWorkspaceCatalogStatus('ready');
      return { ok: true, workspace };
    } catch (error) {
      if (sessionRequest.current !== sessionAtStart) return { ok: false, error: 'Session changed.' };
      return { ok: false, error: error?.message || 'Workspace could not be updated.' };
    }
  }, [allWorkspaces]);

  const logoutSession = useCallback(async () => {
    workspaceAccess.current = false;
    setSession(current => ({
      authenticated: false, roles: [],
      driveHistoryRequired: current?.driveHistoryRequired === true,
      driveHistoryConnected: false,
      driveHistoryConfigured: current?.driveHistoryConfigured === true
    }));
    setSessionStatus('ready');
    setAllWorkspaces([]);
    setWorkspaces([]);
    setActiveWorkspaceId('');
    setSelectedWorkspaceId('');
    resourceCache.clear();
    sessionIdentity.current = '';
    sessionRequest.current += 1;
    catalogRequest.current += 1;
    disableGoogleAutoSelect();
    try {
      await logout();
    } finally {
      try { localStorage.setItem('wildtrack.session-identity', ''); } catch { /* Optional storage. */ }
      setSession(current => ({
      authenticated: false, roles: [],
      driveHistoryRequired: current?.driveHistoryRequired === true,
      driveHistoryConnected: false,
      driveHistoryConfigured: current?.driveHistoryConfigured === true
    }));
      setSessionStatus('ready');
      setSessionError('');
      setAllWorkspaces([]);
      setWorkspaces([]);
      activeRef.current = '';
      setActiveWorkspaceId('');
      setSelectedWorkspaceId('');
      setWorkspaceCatalogStatus('idle');
    }
  }, []);

  const canAccessWorkspace = sessionStatus === 'ready' && session?.authenticated && !requiresDriveHistoryConsent(session);
  const visibleWorkspaces = canAccessWorkspace ? workspaces : EMPTY_WORKSPACES;
  const visibleAllWorkspaces = canAccessWorkspace ? allWorkspaces : EMPTY_WORKSPACES;
  const visibleWorkspaceId = canAccessWorkspace ? activeWorkspaceId : '';
  const activeWorkspace = visibleWorkspaces.find((workspace) => workspace.id === activeWorkspaceId) || visibleWorkspaces[0] || null;
  const value = useMemo(() => ({
    resourceCache,
    session,
    sessionStatus,
    sessionError,
    canAccessWorkspace: Boolean(canAccessWorkspace),
    driveHistoryPending: requiresDriveHistoryConsent(session),
    account: canAccessWorkspace && session.email ? { email: session.email, name: session.name || '' } : null,
    allWorkspaces: visibleAllWorkspaces,
    archivedWorkspaces: visibleAllWorkspaces.filter((workspace) => workspace.active === false),
    workspaces: visibleWorkspaces,
    activeWorkspace,
    activeWorkspaceId: visibleWorkspaceId,
    needsWorkspaceChoice: visibleWorkspaces.length > 1 && selectedWorkspaceId !== visibleWorkspaceId,
    workspaceCatalogStatus,
    workspaceCatalogError,
    refreshWorkspaceCatalog,
    refreshWorkspaceManagementCatalog,
    refreshSession,
    completeGoogleSignIn,
    switchWorkspace,
    createWorkspace,
    updateWorkspace,
    logoutStudentAccount: logoutSession,
    logoutStaffSession: logoutSession
  }), [
    activeWorkspace,
    activeWorkspaceId,
    allWorkspaces,
    canAccessWorkspace,
    completeGoogleSignIn,
    visibleAllWorkspaces,
    visibleWorkspaces,
    visibleWorkspaceId,
    createWorkspace,
    logoutSession,
    refreshSession,
    refreshWorkspaceCatalog,
    refreshWorkspaceManagementCatalog,
    selectedWorkspaceId,
    session,
    sessionError,
    sessionStatus,
    switchWorkspace,
    updateWorkspace,
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

function activeWorkspaceCatalog(workspaces) {
  return (workspaces || []).filter((workspace) => workspace.active !== false);
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
