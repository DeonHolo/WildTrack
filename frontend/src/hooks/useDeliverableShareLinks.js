import { useEffect, useState } from 'react';
import { getDeliverableShareLink } from '../lib/api.js';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { useWorkspaceScope } from './useWorkspaceScope.js';

const validPath = path => /^\/s\/[0-9a-f]{64}$/.test(path || '');
const FRESH_MS = 60000;

export function useDeliverableShareLinks(workspaceId, deliverables) {
  const scope = useWorkspaceScope(workspaceId);
  const { session, resourceCache } = useWorkspaceSession();
  const account = session?.authenticated ? JSON.stringify([session.email, session.googleSubject, session.roles]) : '';
  const ids = JSON.stringify(deliverables.filter(item => item.id).map(item => [item.id, item.status, item.updatedAt, item.version]).sort((a, b) => a[0].localeCompare(b[0])));
  const key = JSON.stringify([account, workspaceId, 'deliverable-share-links', ids]);
  const cache = account && workspaceId ? resourceCache : null;
  const cached = cache?.read(key);
  const initial = cached && Object.values(cached).every(validPath) ? cached : {};
  const [result, setResult] = useState({ key, paths: initial, errors: {} });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const saved = cache?.read(key);
    const paths = saved && Object.values(saved).every(validPath) ? saved : {};
    setResult({ key, paths, errors: {} });
    if (!workspaceId || !account || (retry === 0 && cache?.isFresh(key, FRESH_MS))) return () => { active = false; };
    const entries = JSON.parse(ids);
    if (!entries.length) return () => { active = false; };
    const load = async () => {
      const results = await Promise.all(entries.map(async ([id]) => {
        try {
          const link = await getDeliverableShareLink(workspaceId, id);
          if (!validPath(link?.path)) throw new Error('Invalid share link');
          return [id, link.path];
        } catch (error) { return [id, null, error?.status]; }
      }));
      if (active && scope() && results.some(([, , status]) => status === 401 || status === 403)) cache?.clear();
      const next = Object.fromEntries(results.filter(([, path]) => path).map(([id, path]) => [id, path]));
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
  return { paths: current ? result.paths : initial, errors: current ? result.errors : {}, reload: () => setRetry(value => value + 1) };
}
