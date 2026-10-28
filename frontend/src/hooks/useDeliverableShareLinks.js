import { useEffect, useState } from 'react';
import { getDeliverableShareLink } from '../lib/api.js';
import { useWorkspaceScope } from './useWorkspaceScope.js';

export function useDeliverableShareLinks(workspaceId, deliverables) {
  const scope = useWorkspaceScope(workspaceId);
  const ids = JSON.stringify([...new Set(deliverables.map(item => item.id).filter(Boolean))].sort());
  const [result, setResult] = useState({ key: '', scope: null, paths: {}, errors: {} });
  const [retry, setRetry] = useState(0);
  const key = `${workspaceId}:${ids}`;
  useEffect(() => {
    let active = true;
    setResult({ key, scope, paths: {}, errors: {} });
    if (workspaceId) for (const id of JSON.parse(ids)) {
      getDeliverableShareLink(workspaceId, id).then(link => {
        if (!/^\/s\/[0-9a-f]{64}$/.test(link?.path || '')) throw new Error('The share link could not be loaded.');
        if (active && scope()) setResult(current => ({ ...current, paths: { ...current.paths, [id]: link.path } }));
      }).catch(() => {
        if (active && scope()) setResult(current => ({ ...current, errors: { ...current.errors, [id]: true } }));
      });
    }
    return () => { active = false; };
  }, [workspaceId, ids, scope, retry]);
  const current = result.key === key && result.scope === scope;
  return { paths: current ? result.paths : {}, errors: current ? result.errors : {}, reload: () => setRetry(value => value + 1) };
}
