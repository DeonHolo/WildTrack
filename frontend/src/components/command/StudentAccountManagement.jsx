import { Alert, Button, Group, Modal, Paper, Radio, ScrollArea, Stack, Text, TextInput, Title } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import {
  disconnectStudentAccountBinding,
  getStudentAccountBindings,
  recoverStudentAccountBinding
} from '../../lib/api.js';

export function StudentAccountManagement({ workspaceId, opened, onClose, onChanged }) {
  const [state, setState] = useState({ status: 'idle', data: null, error: '' });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState({});
  const [savingKey, setSavingKey] = useState('');

  useEffect(() => {
    if (!opened || !workspaceId) return;
    let active = true;
    setState(current => ({ ...current, status: 'loading', error: '' }));
    getStudentAccountBindings(workspaceId)
      .then(data => { if (active) setState({ status: 'ready', data, error: '' }); })
      .catch(error => { if (active) setState({ status: 'error', data: null, error: error?.message || 'Account bindings could not be loaded.' }); });
    return () => { active = false; };
  }, [opened, workspaceId]);

  const accounts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (state.data?.accounts || []).filter(account => !needle || [
      account.studentNumber, account.studentName, account.teamCode, account.googleEmail,
      ...(account.candidates || []).map(candidate => candidate.googleEmail)
    ].some(value => String(value || '').toLowerCase().includes(needle)));
  }, [query, state.data]);

  async function reload() {
    try {
      const data = await getStudentAccountBindings(workspaceId);
      setState({ status: 'ready', data, error: '' });
      return data;
    } catch (error) {
      setState(current => ({ ...current, status: 'error', error: error?.message || 'Account bindings could not be loaded.' }));
      return null;
    }
  }

  async function disconnect(account) {
    const key = `${account.studentRecordId}:disconnect`;
    if (savingKey) return;
    setSavingKey(key);
    setState(current => ({ ...current, error: '' }));
    try {
      await disconnectStudentAccountBinding(workspaceId, account.studentRecordId);
      await reload();
      onChanged?.();
    } catch (error) {
      setState(current => ({ ...current, error: error?.message || 'The account binding could not be disconnected.' }));
    } finally {
      setSavingKey('');
    }
  }

  async function recover(account) {
    const confirmedSubject = selected[account.studentRecordId];
    if (!confirmedSubject || savingKey) return;
    const key = `${account.studentRecordId}:recover`;
    setSavingKey(key);
    setState(current => ({ ...current, error: '' }));
    try {
      await recoverStudentAccountBinding(workspaceId, account.studentRecordId, confirmedSubject);
      setSelected(current => ({ ...current, [account.studentRecordId]: '' }));
      await reload();
      onChanged?.();
    } catch (error) {
      setState(current => ({ ...current, error: error?.message || 'The account binding could not be recovered.' }));
    } finally {
      setSavingKey('');
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Student account management" size="lg" centered scrollAreaComponent={ScrollArea.Autosize}>
      <Stack gap="md">
        <Alert color="orange" title="First-claim limitation">
          {state.data?.firstClaimLimitation || 'Account ownership is self-declared by the first successful submission. It is not verified student ownership.'}
        </Alert>
        <Text size="sm" c="dimmed">
          Disconnect a mistaken binding or explicitly recover a previously recorded account. Existing submissions and audit records are retained.
        </Text>
        <TextInput value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder="Search student, team, or account" aria-label="Search student account bindings" />
        {state.error ? <Alert color="red" role="alert">{state.error}<Button variant="subtle" size="xs" onClick={reload}>Retry</Button></Alert> : null}
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
                    <Button color="red" variant="light" size="xs" loading={savingKey === `${account.studentRecordId}:disconnect`} onClick={() => disconnect(account)}>
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
                    <Button size="xs" variant="light" disabled={!selected[account.studentRecordId]}
                      loading={savingKey === `${account.studentRecordId}:recover`} onClick={() => recover(account)}>
                      Recover selected account
                    </Button>
                  </Stack>
                ) : <Text size="sm" c="dimmed">This Student Number will bind when its first valid submission is saved.</Text>}
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </Modal>
  );
}
