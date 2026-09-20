import { Alert, Badge, Button, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { getSubmittedFileHistory, startDriveHistoryConsent } from '../../lib/api.js';
import { formatDateTime } from '../../lib/workflow.js';
import { ObservedFileHistory } from './ObservedFileHistory.jsx';

function readableBytes(bytes) {
  if (bytes == null || bytes === '') return 'Unavailable';
  const size = Number(bytes);
  if (!Number.isFinite(size) || size < 0) return 'Unavailable';
  return size < 1024 ? `${size} bytes` : `${(size / 1024).toFixed(1)} KB`;
}

export function SubmittedFileHistory({ workspaceId, responseId, fieldId, observedHistory, audience = 'staff', initialHistory = null, initialLoading = false, onRefresh, refreshing = false }) {
  const studentView = audience === 'student';
  const [pageTokens, setPageTokens] = useState(['']);
  const [pageIndex, setPageIndex] = useState(0);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const token = pageTokens[pageIndex] || '';

  useEffect(() => {
    if (!workspaceId || !responseId || !fieldId) {
      setLoading(false);
      setHistory(null);
      setError('Choose a submitted PDF to view its history.');
      return undefined;
    }
    let current = true;
    if (pageIndex === 0 && initialHistory) {
      setHistory(initialHistory);
      setError('');
      setLoading(false);
      return () => { current = false; };
    }
    if (pageIndex === 0 && initialLoading) {
      setLoading(true);
      setError('');
      setHistory(null);
      return () => { current = false; };
    }
    setLoading(true);
    setError('');
    setHistory(null);
    getSubmittedFileHistory(workspaceId, responseId, fieldId, token)
      .then(result => { if (current) setHistory(result); })
      .catch(failure => { if (current) setError(failure.message || 'File history could not be loaded.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [workspaceId, responseId, fieldId, token, pageIndex, initialHistory, initialLoading]);

  const revisions = Array.isArray(history?.revisions) ? history.revisions : [];
  const status = history?.status || 'UNAVAILABLE';

  return (
    <Stack gap="md" aria-label="Submitted file history">
      {!studentView ? (
        <Paper withBorder p="md" radius="md" aria-label="WildTrack observations">
          <ObservedFileHistory history={observedHistory} />
          {!observedHistory ? <Text size="sm" c="dimmed">WildTrack observed history is unavailable for this file.</Text> : null}
        </Paper>
      ) : <Text size="sm" c="dimmed">WildTrack observations are available to authorized staff. Google Drive revision details for your submitted PDF appear below without owner or editor identities.</Text>}

      <Paper withBorder p="md" radius="md" aria-label="Google Drive revision metadata">
        <Stack gap="sm">
          <Group justify="space-between" align="center" gap="sm" wrap="wrap">
            <Text fw={750}>Google Drive revision metadata</Text>
            <Group gap="xs" wrap="wrap">
              <Badge variant="light">Page {pageIndex + 1}</Badge>
              {onRefresh ? <Button variant="light" size="sm" loading={refreshing} disabled={loading || refreshing}
                onClick={() => {
                  setPageIndex(0);
                  setPageTokens(['']);
                  onRefresh();
                }}>Refresh history</Button> : null}
            </Group>
          </Group>
          <Text size="md" lh={1.5} c="dimmed">Google Drive may provide revisions of the exact PDF submitted in this form. Access permissions and Google retention affect coverage.</Text>

          {loading ? <Group role="status" gap="xs"><Loader size="xs" /><Text size="sm">Loading file history…</Text></Group> : null}
          {error ? <Alert color="orange" role="alert">{error}</Alert> : null}
          {!loading && !error && status !== 'AVAILABLE' && status !== 'INCOMPLETE' ? (
            <Alert color="blue" role="status">
              {history?.coverageMessage || (status === 'NOT_CONNECTED'
                ? 'No submitter of this file currently has usable Drive history access. An owner or editor may authorize access when signing in.'
                : status === 'PERMISSION_DENIED' ? 'Connected submitters currently lack permission to read the file revisions.'
                  : 'Google Drive revision history is currently unavailable for this submitted file.')}
              {studentView && status === 'NOT_CONNECTED' ? (
                <Button variant="light" size="sm" mt="sm" onClick={startDriveHistoryConsent}>Optionally allow Drive metadata</Button>
              ) : null}
            </Alert>
          ) : null}

          {!loading && !error && ['AVAILABLE', 'INCOMPLETE'].includes(status) && !revisions.length ? (
            <Text size="md" lh={1.5} c="dimmed">No Google Drive revisions were returned for this submitted file.</Text>
          ) : null}
          {!loading && !error && ['AVAILABLE', 'INCOMPLETE'].includes(status) ? revisions.map((revision, index) => (
            <Paper key={`${revision.id || 'revision'}-${index}`} withBorder radius="sm" p="sm" role="group" aria-label={`Drive revision ${index + 1} on page ${pageIndex + 1}`}>
              <Stack gap={3}>
                <Group gap="xs" wrap="wrap">
                  <Badge color="blue" variant="light" size="xs">Google Drive revision</Badge>
                  <Text size="md" fw={650}>{revision.modifiedTime ? formatDateTime(revision.modifiedTime) : 'Modification time unavailable'}</Text>
                </Group>
                <Text size="md" lh={1.5} c="dimmed">File type: {revision.mimeType || 'Unavailable'} · Size: {readableBytes(revision.size)}</Text>
                {!studentView && revision.modifiedBy ? <Text size="md" lh={1.5}>Modified by {revision.modifiedBy}{revision.modifiedByEmail && !revision.modifiedBy.includes(revision.modifiedByEmail) ? ` (${revision.modifiedByEmail})` : ''}</Text> : null}
                {!studentView && !revision.modifiedBy && revision.modifiedByEmail ? <Text size="md" lh={1.5}>Modified by {revision.modifiedByEmail}</Text> : null}
                {!studentView && !revision.modifiedBy && !revision.modifiedByEmail ? <Text size="md" lh={1.5} c="dimmed">Editor identity unavailable</Text> : null}
              </Stack>
            </Paper>
          )) : null}

          {!loading && !error && ['AVAILABLE', 'INCOMPLETE'].includes(status) ? (
            <Group justify="space-between" gap="sm" wrap="wrap">
              <Button variant="default" size="xs" disabled={pageIndex === 0} onClick={() => setPageIndex(index => index - 1)}>Previous page</Button>
              <Text size="sm" c="dimmed">Page {pageIndex + 1}</Text>
              <Button variant="default" size="xs" disabled={!history?.nextPageToken} onClick={() => {
                if (!history?.nextPageToken) return;
                setPageTokens(current => [...current.slice(0, pageIndex + 1), history.nextPageToken]);
                setPageIndex(index => index + 1);
              }}>Next page</Button>
            </Group>
          ) : null}
          <Text size="md" lh={1.5} c="dimmed">{studentView
            ? 'This history can be incomplete. Earlier edits may be unavailable because of file permissions, access changes, or Google retention.'
            : history?.historyMayBeIncomplete || status === 'INCOMPLETE'
              ? 'Revision history may be incomplete because Google can omit older revisions or editor information.'
              : 'WildTrack only displays the revisions Google returns for this submitted file. Earlier edits may be unavailable.'}</Text>
        </Stack>
      </Paper>
    </Stack>
  );
}
