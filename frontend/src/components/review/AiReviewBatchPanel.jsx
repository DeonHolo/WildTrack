import { Alert, Button, Group, Progress, Stack, Text } from '@mantine/core';
import { AiReviewBatchFailures } from './AiReviewBatchFailures.jsx';

export function AiReviewBatchPanel({ batch, error, busy, dismissed = false, onDismiss, onResume, onChoose, onPrepare, onRefresh, refreshing = false }) {
  if (dismissed && batch?.state === 'COMPLETED' && !error) return null;
  if (!batch || batch.state === 'CANCELLED') return error ? <Alert color="red" role="alert">{error}</Alert> : null;
  const running = batch.state === 'RUNNING';
  const paused = batch.state === 'PAUSED';
  const preparing = batch.state === 'PLANNING';
  const failed = batch.entries.filter(entry => entry.error).length;
  return <Alert role="status" color={paused || failed || error ? 'orange' : running || preparing ? 'blue' : 'green'}
    withCloseButton={batch.state === 'COMPLETED' && Boolean(onDismiss) && !busy}
    onClose={onDismiss} closeButtonLabel="Dismiss finished AI Review batch"
    title={preparing ? 'Preparing AI Review' : running ? 'AI Review running' : paused ? 'AI Review paused' : batch.state === 'READY' ? 'AI Review ready to start' : 'AI Review batch finished'}>
    <Stack gap="sm">
      <Text size="sm" fw={600}>{preparing ? `${batch.preparedPdfs} of ${batch.totalPdfs} PDF submissions checked`
        : `${batch.completedDocuments} of ${batch.selectedDocuments || batch.uniqueDocuments} unique documents processed · ${batch.totalPdfs} total PDF submissions`}</Text>
      <Progress value={preparing ? batch.preparedPdfs / Math.max(1, batch.totalPdfs) * 100
        : batch.completedDocuments / Math.max(1, batch.selectedDocuments) * 100} animated={running || preparing} />
      <Text size="sm">{batch.message}</Text>
      {batch.reusedDocuments ? <Text size="sm">{batch.reusedDocuments} saved {batch.reusedDocuments === 1 ? 'review reused' : 'reviews reused'}.</Text> : null}
      {error ? <Text size="sm">{error}</Text> : null}
      {failed ? <AiReviewBatchFailures entries={batch.entries} /> : null}
      <Group gap="sm">
        {batch.state === 'READY' ? <Button onClick={onChoose}>Choose review scope</Button> : null}
        {paused && batch.pendingDocuments > 0 ? <Button loading={busy} onClick={onResume}>Continue remaining ({batch.pendingDocuments})</Button> : null}
        {!running && !preparing ? <Button variant="default" loading={refreshing} onClick={onRefresh}>Check saved reviews</Button> : null}
        {paused || batch.state === 'COMPLETED' && failed ? <Button variant="default" onClick={onPrepare}>Review retry options</Button> : null}
      </Group>
    </Stack>
  </Alert>;
}
