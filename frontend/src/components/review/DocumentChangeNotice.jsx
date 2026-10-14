import { Alert, Group, Modal } from '@mantine/core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui.jsx';
import { dismissWorkTask, getWorkTaskDismissals } from '../../lib/api.js';
import { documentChangeAcknowledgementKey } from '../../lib/documentChangeAcknowledgement.js';
import { historyDate } from '../../lib/fileHistoryPresentation.js';
import { useWorkspaceResource } from '../../hooks/useWorkspaceResource.js';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope.js';

const emptyAcknowledgements = () => [];

export function DocumentChangeNotice({ observation, target, allowAcknowledge = true }) {
  const taskKey = allowAcknowledge ? documentChangeAcknowledgementKey(target, observation) : '';
  const workspaceId = target?.workspaceId;
  const load = useCallback(id => getWorkTaskDismissals(id), []);
  const { data: keys, setData, status, error: loadError, reload } = useWorkspaceResource(
    taskKey ? workspaceId : null, load, emptyAcknowledgements, 'document-change-acknowledgements');
  const workspaceCurrent = useWorkspaceScope(workspaceId);
  const scope = useMemo(() => ({}), [workspaceCurrent, taskKey]);
  const activeScope = useRef(null);
  useLayoutEffect(() => {
    activeScope.current = scope;
    return () => { activeScope.current = null; };
  }, [scope]);
  const initialFlow = useMemo(() => ({ scope, confirming: false, saving: false, error: '' }), [scope]);
  const [flow, setFlow] = useState(initialFlow);
  const current = flow.scope === scope ? flow : initialFlow;
  useEffect(() => { setFlow(initialFlow); }, [initialFlow]);

  async function acknowledge() {
    const isCurrent = () => workspaceCurrent() && activeScope.current === scope;
    if (!taskKey || status !== 'ready' || current.saving || !isCurrent()) return;
    setFlow({ scope, confirming: true, saving: true, error: '' });
    try {
      await dismissWorkTask(workspaceId, taskKey);
      if (!isCurrent()) return;
      // Invalidate reads started before this successful save, and cache the receipt
      // so reopening the dialog can render the acknowledged state immediately.
      setData(previous => previous.includes(taskKey) ? previous : [...previous, taskKey]);
      setFlow(initialFlow);
    } catch {
      if (isCurrent()) setFlow({ scope, confirming: true, saving: false,
        error: 'The acknowledgement could not be saved. The notice is still active. Try again.' });
    }
  }

  // Unknown is not unacknowledged: never paint an attention notice before its
  // account/workspace-scoped receipt is known, including the first render.
  if (taskKey && status !== 'ready') {
    return status === 'error' ? <Alert color="orange" title="Change acknowledgement unavailable" mb="md">
      File History records a PDF change, but your acknowledgement status could not be loaded.
      <Group mt="sm"><Button variant="secondary" onClick={() => reload()}>Try again</Button></Group>
    </Alert> : null;
  }
  if (taskKey && keys.includes(taskKey)) return null;
  return <>
    <Alert color="orange" title="PDF content changed" mb="md">
      Document Check detected changed PDF content on {historyDate(observation.firstObservedAt)}.
      {observation.driveModifiedTime ? ` Drive edit: ${historyDate(observation.driveModifiedTime)}.` : ''}
      {' '}The check result below is for the updated file. Open File history to compare the recorded changes.
      {taskKey ? <Group mt="sm">
        <Button variant="secondary" onClick={() => setFlow({ ...initialFlow, confirming: true })}>Acknowledge change</Button>
      </Group> : null}
      {loadError ? <p role="alert">Your acknowledgement status could not be refreshed. Try again.</p> : null}
    </Alert>
    <Modal opened={current.confirming} onClose={() => setFlow(initialFlow)} title="Acknowledge this PDF change?"
      centered transitionProps={{ duration: 0 }} closeOnEscape={!current.saving} closeOnClickOutside={!current.saving}
      withCloseButton={!current.saving} closeButtonProps={{ 'aria-label': 'Close acknowledgement confirmation' }}>
      <p>You acknowledge that the submitted PDF has changed. This hides this notice for your account.</p>
      <p>File History stays available. This does not accept the submission or refresh AI Review.
        Another content change will show a new notice.</p>
      {current.error ? <Alert color="red" role="alert">{current.error}</Alert> : null}
      <Group justify="flex-end" mt="lg">
        <Button variant="secondary" disabled={current.saving} onClick={() => setFlow(initialFlow)}>Cancel</Button>
        <Button loading={current.saving} onClick={acknowledge}>Acknowledge change</Button>
      </Group>
    </Modal>
  </>;
}
