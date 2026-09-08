import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';

// Capture this predicate with an operation; it expires on scope change or unmount.
export function useWorkspaceScope(workspaceId) {
  const { session } = useWorkspaceSession();
  const account = session?.authenticated ? JSON.stringify([session.email, session.googleSubject, session.roles]) : '';
  const scope = useMemo(() => ({}), [workspaceId, account]);
  const current = useRef(null);
  useLayoutEffect(() => {
    current.current = scope;
    return () => { current.current = null; };
  }, [scope]);
  return useCallback(() => current.current === scope, [scope]);
}
