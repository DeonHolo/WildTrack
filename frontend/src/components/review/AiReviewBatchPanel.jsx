import { Alert, Button, Group, Progress, Stack, Text } from '@mantine/core';
import { isAiBatchAccessRestriction } from '../../lib/aiReviewBatch.js';
import { AiReviewBatchFailures } from './AiReviewBatchFailures.jsx';

export function AiReviewBatchPanel({ batch, error, busy, dismissed = false, onDismiss, onResume, onChoose, onPrepare, onRefresh, refreshing = false }) {
  if (dismissed && batch?.state === 'COMPLETED' && !error) return null;
  if (!batch || batch.state === 'CANCELLED') return error ? <Alert color="red" role="alert">{error}</Alert> : null;
  const running = batch.state === 'RUNNING';
  const paused = batch.state === 'PAUSED';
  const preparing = batch.state === 'PLANNING';
  const failed = batch.entries.filter(entry => entry.error).length;
  const counts = summarizeBatch(batch.entries);
  const technicalFailure = counts.failed > 0 || batch.entries.some(entry => entry.error && !isAiBatchAccessRestriction(entry));
  const color = paused || technicalFailure || error ? 'orange' : running || preparing ? 'blue' : 'green';
  return <Alert role="status" color={color}
    withCloseButton={batch.state === 'COMPLETED' && Boolean(onDismiss) && !busy}
    onClose={onDismiss} closeButtonLabel="Dismiss finished AI Review batch"
    title={preparing ? 'Preparing AI Review' : running ? 'AI Review running' : paused ? 'AI Review paused' : batch.state === 'READY' ? 'AI Review ready to start' : 'AI Review batch finished'}>
    <Stack gap="sm">
      <Text size="sm" fw={600}>{preparing ? `${batch.preparedPdfs} of ${batch.totalPdfs} PDF submissions checked`
        : `${batch.completedDocuments ?? 0} of ${batch.selectedDocuments ?? 0} unique review attempts finished · ${batch.totalPdfs} total PDF submissions`}</Text>
      <Progress color={color} value={preparing ? batch.preparedPdfs / Math.max(1, batch.totalPdfs) * 100
        : batch.completedDocuments / Math.max(1, batch.selectedDocuments) * 100} animated={running || preparing} />
      <Text size="sm">{batch.message}</Text>
      {batch.reusedDocuments ? <Text size="sm">{batch.reusedDocuments} saved {batch.reusedDocuments === 1 ? 'review reused' : 'reviews reused'}.</Text> : null}
      {!preparing ? <Text size="sm">
        {counts.completed} AI {counts.completed === 1 ? 'review' : 'reviews'} available
        {counts.blocked ? ` · ${counts.blocked} blocked before AI` : ''}
        {counts.failed ? ` · ${counts.failed} failed or unconfirmed` : ''}
        {counts.pending ? ` · ${counts.pending} pending` : ''}
      </Text> : null}
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

function summarizeBatch(entries = []) {
  const groups = new Map();
  for (const entry of entries) {
    if (!entry.selected || !entry.preview?.key) continue;
    if (!groups.has(entry.preview.key)) groups.set(entry.preview.key, []);
    groups.get(entry.preview.key).push(entry);
  }
  let completed = 0, blocked = 0, failed = 0, pending = 0;
  for (const group of groups.values()) {
    if (group.every(entry => entry.phase === 'DONE')) {
      if (group.some(entry => entry.resultStatus === 'COMPLETED')) completed += 1;
      else if (group.every(entry => entry.noAiStarted)) blocked += 1;
      else failed += 1;
    } else pending += 1;
  }
  return { finished: completed + blocked + failed, completed, blocked, failed, pending };
}
