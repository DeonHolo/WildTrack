import { Alert, Button, Group, Modal, Paper, Radio, ScrollArea, Stack, Text, TextInput, Title } from '@mantine/core';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceResource } from '../../hooks/useWorkspaceResource.js';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope.js';
import {
  disconnectStudentAccountBinding,
  getStudentAccountBindings,
  recoverStudentAccountBinding
} from '../../lib/api.js';

const emptyBindings = () => ({ accounts: [] });

export function StudentAccountManagement({ workspaceId, opened, onClose, onChanged }) {
  // Mounted with Today's work, so the first open can use its account-scoped snapshot.
  const { data, status, error: loadError, reload } = useWorkspaceResource(workspaceId,
    getStudentAccountBindings, emptyBindings, 'student-account-bindings');
  const isCurrentScope = useWorkspaceScope(workspaceId);
  const [mutationError, setMutationError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState({});
  const [savingKey, setSavingKey] = useState('');
  const saving = useRef(false);

  useLayoutEffect(() => {
    setMutationError(''); setQuery(''); setSelected({}); setSavingKey(''); saving.current = false;
  }, [isCurrentScope]);

  useEffect(() => {
    if (!opened || !workspaceId) return;
    reload({ background: true, force: false });
  }, [opened, workspaceId, reload]);

  const state = { data, status, error: mutationError || loadError };

  const accounts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (state.data?.accounts || []).filter(account => !needle || [
      account.studentNumber, account.studentName, account.teamCode, account.googleEmail,
      ...(account.candidates || []).map(candidate => candidate.googleEmail)
    ].some(value => String(value || '').toLowerCase().includes(needle)));
  }, [query, state.data]);

  async function disconnect(account) {
    const key = `${account.studentRecordId}:disconnect`;
    if (saving.current || !isCurrentScope()) return;
    saving.current = true;
    setSavingKey(key);
    setMutationError('');
    try {
      await disconnectStudentAccountBinding(workspaceId, account.studentRecordId);
      if (!isCurrentScope()) return;
      await reload();
      if (!isCurrentScope()) return;
      onChanged?.();
    } catch (error) {
      if (isCurrentScope()) setMutationError(error?.message || 'The account binding could not be disconnected.');
    } finally {
      if (isCurrentScope()) { saving.current = false; setSavingKey(''); }
    }
  }

  async function recover(account) {
    const confirmedSubject = selected[account.studentRecordId];
    if (!confirmedSubject || saving.current || !isCurrentScope()) return;
    saving.current = true;
    const key = `${account.studentRecordId}:recover`;
    setSavingKey(key);
    setMutationError('');
    try {
      await recoverStudentAccountBinding(workspaceId, account.studentRecordId, confirmedSubject);
      if (!isCurrentScope()) return;
      setSelected(current => ({ ...current, [account.studentRecordId]: '' }));
      await reload();
      if (!isCurrentScope()) return;
      onChanged?.();
    } catch (error) {
      if (isCurrentScope()) setMutationError(error?.message || 'The account binding could not be recovered.');
    } finally {
      if (isCurrentScope()) { saving.current = false; setSavingKey(''); }
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Student account management" size="lg" centered scrollAreaComponent={ScrollArea.Autosize}>
      <Stack gap="md">
        <Alert color="orange" title="First-claim limitation">
          {state.data?.firstClaimLimitation || 'The first successful connection through the account entry form or deliverable submission is self-declared and does not prove the student’s identity. Another account cannot replace an active connection.'}
        </Alert>
        <Text size="sm" c="dimmed">
          Disconnect an account to let a student connect again using their details. You can also select a previously recorded account. Existing submissions and audit records are retained.
        </Text>
        <TextInput value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder="Search student, team, or account" aria-label="Search student account bindings" />
        {state.error ? <Alert color="red" role="alert">{state.error}<Button variant="subtle" size="xs" onClick={() => { setMutationError(''); reload(); }}>Retry</Button></Alert> : null}
        {state.status === 'loading' ? <Text c="dimmed">Loading account bindings…</Text> : null}
        {state.status === 'ready' && !accounts.length ? <Text c="dimmed">No matching student account records.</Text> : null}
        {accounts.map(account => {
          const candidates = account.candidates || [];
          const canRecover = account.status !== 'BOUND' && candidates.length > 0;
          return (
            <Paper withBorder p="md" key={account.studentRecordId} aria-label={`Account binding for ${account.studentNumber}`}>
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start" wrap="wrap">
                  <div>
                    <Title order={4}>{account.studentName || 'Student record'}</Title>
                    <Text size="sm" c="dimmed">{account.studentNumber} · {account.teamCode || 'No team'}</Text>
                  </div>
                  <Text size="xs" fw={800}>{account.status === 'CONFLICT' ? 'Needs review' : account.status === 'BOUND' ? 'Bound' : 'Not bound'}</Text>
                </Group>
                {account.status === 'BOUND' ? (
                  <Group justify="space-between" wrap="wrap">
                    <Text size="sm">{account.googleEmail || 'Recorded Google account'}</Text>
                    <Button color="red" variant="light" size="xs" disabled={Boolean(savingKey)} loading={savingKey === `${account.studentRecordId}:disconnect`} onClick={() => disconnect(account)}>
                      Disconnect account
                    </Button>
                  </Group>
                ) : canRecover ? (
                  <Stack gap="xs">
                    {account.status === 'CONFLICT' ? <Alert color="yellow">Multiple existing claims remain unresolved. Choose an account only after administrator verification.</Alert> : null}
                    <Radio.Group
                      label="Previously recorded accounts"
                      value={selected[account.studentRecordId] || ''}
                      onChange={value => setSelected(current => ({ ...current, [account.studentRecordId]: value }))}
                    >
                      <Stack gap="xs" mt="xs">
                        {candidates.map(candidate => (
                          <Radio key={candidate.googleSubject} value={candidate.googleSubject}
                            label={`${candidate.googleEmail || 'Unknown account'}${candidate.active ? ' · currently claimed' : ''}`} />
                        ))}
                      </Stack>
                    </Radio.Group>
                    <Button size="xs" variant="light" disabled={!selected[account.studentRecordId] || Boolean(savingKey)}
                      loading={savingKey === `${account.studentRecordId}:recover`} onClick={() => recover(account)}>
                      Recover selected account
                    </Button>
                  </Stack>
                ) : <Text size="sm" c="dimmed">The student can connect an account using their class details.</Text>}
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </Modal>
  );
}
