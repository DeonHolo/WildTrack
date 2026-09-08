import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';

export function useWorkspaceResource(workspaceId, load, makeEmpty) {
  const { session } = useWorkspaceSession();
  const accountKey = session?.authenticated ? session.email : '';
  const scope = useMemo(() => ({}), [workspaceId, accountKey, load, makeEmpty]);
  const empty = useMemo(() => ({ scope, data: makeEmpty(), status: workspaceId ? 'loading' : 'idle', error: '' }), [scope]);
  const [snapshot, setSnapshot] = useState(empty);
  const activeScope = useRef(null);
  const requestId = useRef(0);
  const pendingRequest = useRef(null);

  useLayoutEffect(() => {
    activeScope.current = scope;
    return () => {
      activeScope.current = null;
      requestId.current += 1;
    };
  }, [scope]);

  const setData = useCallback((next) => {
    if (activeScope.current !== scope) return;
    // A completed mutation must not be overwritten by a read started before it.
    requestId.current += 1;
    setSnapshot((current) => {
      if (activeScope.current !== scope) return current;
      const base = current.scope === scope ? current : empty;
      return { ...base, data: typeof next === 'function' ? next(base.data) : next };
    });
  }, [scope, empty]);

  const reload = useCallback(async ({ background = false } = {}) => {
    if (activeScope.current !== scope) return null;
    if (background && pendingRequest.current?.scope === scope) return null;
    const currentRequest = ++requestId.current;
    if (!background) setSnapshot(empty);
    if (!workspaceId) {
      return null;
    }
    pendingRequest.current = { scope, id: currentRequest };
    try {
      const loaded = await load(workspaceId);
      if (activeScope.current !== scope || requestId.current !== currentRequest) return null;
      setSnapshot({ scope, data: loaded, status: 'ready', error: '' });
      return loaded;
    } catch (loadError) {
      if (activeScope.current !== scope || requestId.current !== currentRequest) return null;
      setSnapshot({ ...empty, status: 'error', error: loadError?.message || 'Data could not be loaded.' });
      return null;
    } finally {
      if (pendingRequest.current?.id === currentRequest) pendingRequest.current = null;
    }
  }, [load, scope, empty, workspaceId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!workspaceId) return undefined;
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') reload({ background: true });
    };
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    const timer = window.setInterval(refreshVisible, 15000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [reload, workspaceId]);

  const current = snapshot.scope === scope ? snapshot : empty;
  return { data: current.data, setData, status: current.status, error: current.error, reload };
}
