import { Alert, Group, Modal } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui.jsx';
import { dismissWorkTask, getWorkTaskDismissals } from '../../lib/api.js';
import { documentChangeAcknowledgementKey } from '../../lib/documentChangeAcknowledgement.js';
import { historyDate } from '../../lib/fileHistoryPresentation.js';

export function DocumentChangeNotice({ observation, target, allowAcknowledge = true }) {
  const taskKey = allowAcknowledge ? documentChangeAcknowledgementKey(target, observation) : '';
  const workspaceId = target?.workspaceId;
  const scope = `${workspaceId || ''}/${taskKey}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [receipt, setReceipt] = useState({ scope, acknowledged: false, loading: Boolean(taskKey) });
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    currentScope.current = scope;
    setConfirming(false);
    setSaving(false);
    setError('');
    setReceipt({ scope, acknowledged: false, loading: Boolean(taskKey) });
    if (taskKey) getWorkTaskDismissals(workspaceId).then(keys => {
      if (active) setReceipt({ scope, acknowledged: keys.includes(taskKey), loading: false });
    }).catch(() => {
      if (active) {
        setReceipt({ scope, acknowledged: false, loading: false });
        setError('Your acknowledgement could not be loaded. You can try acknowledging again.');
      }
    });
    return () => { active = false; currentScope.current = null; };
  }, [scope, workspaceId, taskKey]);

  async function acknowledge() {
    if (!taskKey || saving || currentScope.current !== scope) return;
    setSaving(true);
    setError('');
    try {
      await dismissWorkTask(workspaceId, taskKey);
      if (currentScope.current !== scope) return;
      setReceipt({ scope, acknowledged: true, loading: false });
      setConfirming(false);
    } catch {
      if (currentScope.current === scope) setError('The acknowledgement could not be saved. The notice is still active. Try again.');
    } finally {
      if (currentScope.current === scope) setSaving(false);
    }
  }

  if (receipt.scope === scope && receipt.acknowledged) return null;
  return <>
    <Alert color="orange" title="PDF content changed" mb="md">
      Document Check detected changed PDF content on {historyDate(observation.firstObservedAt)}.
      {observation.driveModifiedTime ? ` Drive edit: ${historyDate(observation.driveModifiedTime)}.` : ''}
      {' '}The check result below is for the updated file. Open File history to compare the recorded changes.
      {taskKey ? <Group mt="sm">
        <Button variant="secondary" disabled={receipt.scope !== scope || receipt.loading}
          onClick={() => setConfirming(true)}>Acknowledge change</Button>
      </Group> : null}
      {error && !confirming ? <p role="alert">{error}</p> : null}
    </Alert>
    <Modal opened={confirming} onClose={() => setConfirming(false)} title="Acknowledge this PDF change?"
      centered transitionProps={{ duration: 0 }} closeOnEscape={!saving} closeOnClickOutside={!saving}
      withCloseButton={!saving} closeButtonProps={{ 'aria-label': 'Close acknowledgement confirmation' }}>
      <p>You acknowledge that the submitted PDF has changed. This hides this notice for your account.</p>
      <p>File History stays available. This does not accept the submission or refresh AI Review.
        Another content change will show a new notice.</p>
      {error ? <Alert color="red" role="alert">{error}</Alert> : null}
      <Group justify="flex-end" mt="lg">
        <Button variant="secondary" disabled={saving} onClick={() => setConfirming(false)}>Cancel</Button>
        <Button loading={saving} onClick={acknowledge}>Acknowledge change</Button>
      </Group>
    </Modal>
  </>;
}
