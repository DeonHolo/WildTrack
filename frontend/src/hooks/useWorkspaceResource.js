import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';

export function useWorkspaceResource(workspaceId, load, makeEmpty, cacheKey = '') {
  const { session, resourceCache } = useWorkspaceSession();
  const accountKey = session?.authenticated ? JSON.stringify([session.email, session.googleSubject, session.roles]) : '';
  const cache = cacheKey && accountKey ? resourceCache : null;
  const key = JSON.stringify([accountKey, workspaceId, cacheKey]);
  const scope = useMemo(() => ({}), [workspaceId, accountKey, load, makeEmpty, cache, cacheKey]);
  const empty = useMemo(() => ({ scope, data: makeEmpty(), status: workspaceId ? 'loading' : 'idle', error: '' }), [scope]);
  const initial = useMemo(() => {
    const data = cache?.read(key);
    return data === undefined ? empty : { scope, data, status: 'ready', error: '' };
  }, [scope, cache, key, empty]);
  const [snapshot, setSnapshot] = useState(initial);
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
      const data = typeof next === 'function' ? next(base.data) : next;
      cache?.write(key, data);
      return { ...base, data };
    });
  }, [scope, empty, cache, key]);

  const reload = useCallback(async ({ background = false } = {}) => {
    if (activeScope.current !== scope) return null;
    if (background && pendingRequest.current?.scope === scope && pendingRequest.current.id === requestId.current) return null;
    const currentRequest = ++requestId.current;
    if (!background) setSnapshot(current => current.scope !== scope ? initial
      : current.status === 'ready' ? { ...current, error: '' } : empty);
    if (!workspaceId) {
      return null;
    }
    pendingRequest.current = { scope, id: currentRequest };
    try {
      const loaded = await (cache ? cache.load(key, () => load(workspaceId)) : load(workspaceId));
      if (activeScope.current !== scope || requestId.current !== currentRequest) return null;
      setSnapshot({ scope, data: loaded, status: 'ready', error: '' });
      return loaded;
    } catch (loadError) {
      if (activeScope.current !== scope || requestId.current !== currentRequest) return null;
      const unauthorized = loadError?.status === 401 || loadError?.status === 403;
      if (unauthorized) cache?.clear();
      setSnapshot(current => ({
        ...(current.scope === scope && current.status === 'ready' && !unauthorized ? current : { ...empty, status: 'error' }),
        error: loadError?.message || 'Data could not be loaded.'
      }));
      return null;
    } finally {
      if (pendingRequest.current?.id === currentRequest) pendingRequest.current = null;
    }
  }, [load, scope, empty, initial, workspaceId, cache, key]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!workspaceId) return undefined;
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') reload({ background: true });
    };
    const refreshInvalidated = () => reload();
    window.addEventListener('focus', refreshVisible);
    window.addEventListener('wildtrack:refresh-resources', refreshInvalidated);
    document.addEventListener('visibilitychange', refreshVisible);
    const timer = window.setInterval(refreshVisible, 15000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshVisible);
      window.removeEventListener('wildtrack:refresh-resources', refreshInvalidated);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [reload, workspaceId]);

  const current = snapshot.scope === scope ? snapshot : initial;
  return { data: current.data, setData, status: current.status, error: current.error, reload };
}
