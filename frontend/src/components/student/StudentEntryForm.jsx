import { Alert, Button, Container, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FormArtwork } from '../public/FormArtwork.jsx';
import { STUDENT_ARTWORK } from '../../lib/studentArtwork.js';
import { connectStudentAccount } from '../../lib/api.js';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope.js';

export function StudentEntryForm({ email, submissionPath, onConnected }) {
  const [identity, setIdentity] = useState({ studentNumber: '', studentName: '', teamCode: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = useWorkspaceScope('');
  async function connect(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await connectStudentAccount(identity.studentNumber.trim(), identity.studentName.trim(), identity.teamCode.trim());
      if (current()) await onConnected(result);
    } catch (failure) {
      if (current()) setError(failure?.message || 'Your account could not be connected. Try again.');
    } finally { if (current()) setBusy(false); }
  }
  return <Container size="sm" w="100%" px={0}>
    <Stack gap="md">
      <FormArtwork artwork={STUDENT_ARTWORK.studentEntry} ariaLabel="Student entry banner" />
      <Paper className="wt-form-surface" radius="md" p={{ base: 'lg', sm: 'xl' }}>
        <form onSubmit={connect}>
          <Stack gap="lg">
            <div>
              <Title order={1} className="wt-form-title">Connect your student account</Title>
              <Text mt="sm">Enter your details as they appear in your class record.</Text>
              <Text mt="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>{email}</Text>
            </div>
            <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <Stack gap="md">
                <TextInput label="Student Number" required maxLength={80} autoComplete="off" placeholder="e.g. 20-0649-750"
                  value={identity.studentNumber} onChange={event => setIdentity({ ...identity, studentNumber: event.currentTarget.value })} />
                <TextInput label="Student Name" required maxLength={240} autoComplete="off" placeholder="LAST NAME, FIRST NAME M."
                  value={identity.studentName} onChange={event => setIdentity({ ...identity, studentName: event.currentTarget.value })} />
                <TextInput label="Team Code" required maxLength={160} autoComplete="off" placeholder="e.g. 2627-sem1-it411-41"
                  value={identity.teamCode} onChange={event => setIdentity({ ...identity, teamCode: event.currentTarget.value })} />
              </Stack>
            </fieldset>
            {error ? <Alert color="red" role="alert">{error}</Alert> : null}
            <Button type="submit" size="md" loading={busy} disabled={Object.values(identity).some(value => !value.trim())}>Connect account</Button>
            {submissionPath ? <Button component={Link} to={submissionPath} variant="default" size="md">Return to deliverable</Button> : null}
          </Stack>
        </form>
      </Paper>
    </Stack>
  </Container>;
}
