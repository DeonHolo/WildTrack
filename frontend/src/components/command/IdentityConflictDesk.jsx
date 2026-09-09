import { Alert, Button, Group, Modal, Paper, Radio, ScrollArea, NativeSelect, Stack, Text, Textarea, Title } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { decideIdentityConflict, getIdentityConflicts } from '../../lib/api.js';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope.js';
import { useWorkspaceResource } from '../../hooks/useWorkspaceResource.js';
import { ResourceBoundary } from '../ResourceBoundary.jsx';
import { StatusIndicator } from '../ui.jsx';
import { formatDateTime } from '../../lib/workflow.js';

const empty = () => [];
const loadHistory = workspaceId => getIdentityConflicts(workspaceId, true);

export function IdentityConflictDesk({ workspaceId, conflict, history = false, onClose, onDecided }) {
  const [selected, setSelected] = useState(conflict || null);
  const [decision, setDecision] = useState('RESOLVED');
  const [confirmedSubject, setConfirmedSubject] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const isCurrent = useWorkspaceScope(workspaceId);
  const records = useWorkspaceResource(workspaceId, loadHistory, empty, 'identity-history');
  useEffect(() => { if (records.status === 'error' && records.error) setError(records.error); }, [records.status, records.error]);
  function choose(item) { setSelected(item); setNote(''); setConfirmedSubject(''); setError(''); }
  async function save() {
    if (busy.current || !isCurrent() || !note.trim() || (decision === 'RESOLVED' && !confirmedSubject)) return;
    busy.current = true; setSaving(true); setError('');
    try {
      const updated = await decideIdentityConflict(workspaceId, selected.id, decision, note.trim(), decision === 'RESOLVED' ? confirmedSubject : null);
      if (!isCurrent()) return;
      setSelected(updated); onDecided(updated); await records.reload();
    } catch (failure) { if (isCurrent()) setError(failure.message || 'The decision could not be saved.'); }
    finally { if (isCurrent()) { busy.current = false; setSaving(false); } }
  }
  async function refresh() {
    const latest = await records.reload();
    if (latest && isCurrent()) { choose(latest.find(item => item.id === selected?.id) || null); }
  }
  return <Modal opened onClose={() => { if (!busy.current) onClose(); }} size="lg" centered scrollAreaComponent={ScrollArea.Autosize}
    title={history ? 'Identity conflict history' : 'Review identity conflict'} closeOnEscape={!saving} closeOnClickOutside={!saving} withCloseButton={!saving}>
    <Stack>
      {selected ? <>
        {history ? <Button variant="subtle" size="compact-sm" onClick={() => setSelected(null)}>Back to history</Button> : null}
        <Group justify="space-between"><div><Title order={3}>{selected.studentName || 'Student record'}</Title>
          <Text size="sm">{selected.studentNumber} · {selected.teamCode}</Text></div><StatusIndicator status={selected.status} /></Group>
        <Text size="sm" c="dimmed">Reported {formatDateTime(selected.createdAt)}</Text>
        <Radio.Group label="Accounts claiming this student record" value={confirmedSubject} onChange={setConfirmedSubject}>
          <Stack gap="sm" mt="xs">{[selected.existingIdentity, selected.conflictingIdentity].filter(Boolean).map((account, index) => (
            <Paper withBorder p="sm" key={account.googleSubject}>
              {selected.status === 'OPEN' && decision === 'RESOLVED' ? <Radio value={account.googleSubject} label={account.googleEmail || 'Unknown account'} disabled={saving || !account.active} />
                : <Text size="sm" fw={600}>{account.googleEmail || 'Unknown account'}</Text>}
              <Text size="xs" c="dimmed" mt={4}>{index === 0 ? 'Earlier claim' : 'Later claim'} · {account.active ? 'Connected' : 'Disconnected'}</Text>
            </Paper>))}</Stack>
        </Radio.Group>
        {selected.status === 'OPEN' ? <>
          <NativeSelect label="Decision" value={decision} onChange={event => setDecision(event.currentTarget.value)} disabled={saving}
            data={[{ value: 'RESOLVED', label: 'Confirm the correct account' }, { value: 'DISMISSED', label: 'Dismiss: no correction needed' }]} />
          <Text size="sm">{decision === 'RESOLVED' ? 'Verify the student outside the app, then select their correct Google account above. The other account is disconnected from this record; submitted files and history remain intact.'
            : 'Dismiss only after checking the claims. This records your decision without changing either account connection.'}</Text>
          <Textarea label="Decision note" required maxLength={700} minRows={3} value={note} disabled={saving}
            placeholder="How was the correct account verified, or why is no correction needed?" onChange={event => setNote(event.currentTarget.value)} />
        </> : <Paper withBorder p="md"><Text fw={600}>{selected.status === 'RESOLVED' ? 'Resolution recorded' : 'Dismissal recorded'}</Text>
          <Text size="sm">{selected.decidedByEmail} · {formatDateTime(selected.decidedAt)}</Text>
          <Text size="sm" mt="xs" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{selected.decisionNote || 'No note recorded.'}</Text></Paper>}
        {error ? <Alert color="red"><Text size="sm">{error}</Text><Button variant="subtle" size="xs" onClick={refresh} disabled={saving}>Reload conflict</Button></Alert> : null}
        <Group justify="flex-end"><Button variant="default" onClick={onClose} disabled={saving}>Close</Button>
          {selected.status === 'OPEN' ? <Button loading={saving} disabled={!note.trim() || (decision === 'RESOLVED' && !confirmedSubject)} onClick={save}>Record decision</Button> : null}</Group>
      </> : <ResourceBoundary status={records.status} error={records.error} onRetry={records.reload}>
        {!records.data.length ? <Text c="dimmed">No identity conflicts have been recorded in this workspace.</Text> : records.data.map(item => (
          <Paper withBorder p="sm" key={item.id}><Group justify="space-between" wrap="wrap"><div>
            <Text size="sm" fw={600}>{item.studentName} · {item.studentNumber}</Text>
            <Text size="xs" c="dimmed">{item.decidedAt ? formatDateTime(item.decidedAt) : formatDateTime(item.createdAt)}{item.decidedByEmail ? ' · ' + item.decidedByEmail : ''}</Text>
            <StatusIndicator status={item.status} /></div><Button variant="default" size="xs" onClick={() => choose(item)}>View details</Button></Group></Paper>))}
      </ResourceBoundary>}
    </Stack>
  </Modal>;
}
