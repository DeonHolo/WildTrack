import { useEffect, useState } from 'react';
import { getDeliverableShareLink } from '../lib/api.js';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { useWorkspaceScope } from './useWorkspaceScope.js';

const validPath = path => /^\/s\/(?:[a-z0-9][a-z0-9-]*\/)?[0-9a-f]{64}$/.test(path || '');
const FRESH_MS = 60000;

export function useDeliverableShareLinks(workspaceId, deliverables) {
  const scope = useWorkspaceScope(workspaceId);
  const { session, resourceCache } = useWorkspaceSession();
  const account = session?.authenticated ? JSON.stringify([session.email, session.googleSubject, session.roles]) : '';
  const ids = JSON.stringify(deliverables.filter(item => item.id).map(item => [item.id, item.status, item.updatedAt, item.version, item.sharePath]).sort((a, b) => a[0].localeCompare(b[0])));
  const key = JSON.stringify([account, workspaceId, 'deliverable-share-links', ids]);
  const cache = account && workspaceId ? resourceCache : null;
  const cached = cache?.read(key);
  const inlinePaths = account && workspaceId ? Object.fromEntries(JSON.parse(ids).filter(([, , , , path]) => validPath(path)).map(([id, , , , path]) => [id, path])) : {};
  const initial = { ...(cached && Object.values(cached).every(validPath) ? cached : {}), ...inlinePaths };
  const [result, setResult] = useState({ key, paths: initial, errors: {} });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const saved = cache?.read(key);
    const entries = JSON.parse(ids);
    const inline = Object.fromEntries(entries.filter(([, , , , path]) => validPath(path)).map(([id, , , , path]) => [id, path]));
    const paths = { ...(saved && Object.values(saved).every(validPath) ? saved : {}), ...inline };
    setResult({ key, paths, errors: {} });
    if (!workspaceId || !account || !entries.length) return () => { active = false; };
    const missing = entries.filter(([id]) => !paths[id]);
    if (!missing.length && (Object.keys(inline).length === entries.length || (retry === 0 && cache?.isFresh(key, FRESH_MS)))) return () => { active = false; };
    const load = async () => {
      const results = await Promise.all(missing.map(async ([id]) => {
        try {
          const link = await getDeliverableShareLink(workspaceId, id);
          if (!validPath(link?.path)) throw new Error('Invalid share link');
          return [id, link.path];
        } catch (error) { return [id, null, error?.status]; }
      }));
      if (active && scope() && results.some(([, , status]) => status === 401 || status === 403)) cache?.clear();
      const next = { ...paths, ...Object.fromEntries(results.filter(([, path]) => path).map(([id, path]) => [id, path])) };
      const errors = Object.fromEntries(results.filter(([, path]) => !path).map(([id]) => [id, true]));
      if (active && scope()) {
        if (!Object.keys(errors).length) cache?.write(key, next);
        else cache?.remove(key);
        setResult({ key, paths: next, errors });
      }
    };
    void load();
    return () => { active = false; };
  }, [workspaceId, account, ids, key, scope, retry, cache]);
  const current = result.key === key;
  const paths = current ? { ...result.paths, ...inlinePaths } : initial;
  const errors = current ? result.errors : {};
  const loading = Boolean(account && workspaceId && JSON.parse(ids).some(([id]) => !paths[id] && !errors[id]));
  return { paths, errors, loading, reload: () => setRetry(value => value + 1) };
}
