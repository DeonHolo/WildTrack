import { Alert, Button, Text } from '@mantine/core';
import { AiBatchProgress } from './AiBatchPresentation.jsx';
import { Stop } from '@phosphor-icons/react';
import { failedAiBatchTargets, isAiBatchTechnicalFailure } from '../../lib/aiReviewBatch.js';
import { AiReviewBatchFailures } from './AiReviewBatchFailures.jsx';

export function AiReviewBatchPanel({ batch, error, busy, dismissed = false, onDismiss, onResume, onStop, onChoose, onCancel, onPrepare, onRetryFailed, onRefresh, refreshing = false }) {
  if (dismissed && batch?.state === 'COMPLETED' && !error) return null;
  if (!batch || batch.state === 'CANCELLED') return error ? <Alert color="red" role="alert">{error}</Alert> : null;
  const running = batch.state === 'RUNNING';
  const paused = batch.state === 'PAUSED';
  const preparing = batch.state === 'PLANNING';
  const precheck = preparing || batch.state === 'READY';
  const attention = batch.entries.filter(entry => entry.error).length;
  const counts = summarizeBatch(batch.entries);
  const technicalFailure = counts.failed > 0 || batch.entries.some(isAiBatchTechnicalFailure);
  const retryTargets = failedAiBatchTargets(batch);
  const color = running || preparing ? 'blue' : paused || technicalFailure || error ? 'orange' : 'green';
  const message = batch.state === 'COMPLETED' && !technicalFailure && !error
    ? counts.completed ? 'AI Review batch finished. Saved results are available.'
      : 'AI Review batch finished. No reviews were produced; check the file-access notices below.'
    : batch.message;
  return <AiBatchProgress color={color} onDismiss={batch.state === 'COMPLETED' && !busy ? onDismiss : undefined}
    closeButtonLabel="Dismiss finished AI Review batch"
    title={preparing ? 'Preparing AI Review' : running ? batch.stopRequested ? 'Stopping AI Review' : 'AI Review running' : paused ? 'AI Review paused' : batch.state === 'READY' ? 'AI Review ready to start' : 'AI Review batch finished'}
    summary={precheck ? `${batch.preparedPdfs} of ${batch.totalPdfs} PDF submissions checked`
      : `${batch.completedDocuments ?? 0} of ${batch.selectedDocuments ?? 0} unique review attempts finished · ${batch.totalPdfs} total PDF submissions`}
    value={precheck ? batch.preparedPdfs / Math.max(1, batch.totalPdfs) * 100
      : batch.completedDocuments / Math.max(1, batch.selectedDocuments) * 100}
    animated={running || preparing} message={message}
    actions={<>
        {running && onStop ? <Button color="#9a3412" variant="outline" leftSection={<Stop size={16} weight="fill" aria-hidden="true" />}
          loading={busy} disabled={batch.stopRequested} onClick={onStop}>{batch.stopRequested ? 'Stop requested' : 'Stop after current document'}</Button> : null}
        {batch.state === 'READY' ? <Button onClick={onChoose}>Choose review scope</Button> : null}
        {(preparing || batch.state === 'READY') && onCancel ? <Button variant="default" disabled={busy} onClick={onCancel}>Cancel precheck</Button> : null}
        {paused && batch.pendingDocuments > 0 ? <Button loading={busy} onClick={onResume}>Continue remaining ({batch.pendingDocuments})</Button> : null}
        {!running && !preparing ? <Button variant="default" loading={refreshing} onClick={onRefresh}>Check saved reviews</Button> : null}
        {!running && !preparing && retryTargets.length && onRetryFailed ? <Button color="orange" variant="outline" onClick={() => onRetryFailed(retryTargets)}>Retry failed AI Reviews ({retryTargets.length})</Button> : null}
        {paused || batch.state === 'COMPLETED' && (attention || technicalFailure) ? <Button variant="default" onClick={onPrepare}>Review retry options</Button> : null}
    </>}>
      {batch.reusedDocuments ? <Text size="sm">{batch.reusedDocuments} saved {batch.reusedDocuments === 1 ? 'review reused' : 'reviews reused'}.</Text> : null}
      {!precheck ? <Text size="sm">
        {counts.completed} AI {counts.completed === 1 ? 'review' : 'reviews'} available
        {counts.blocked ? ` · ${counts.blocked} blocked before AI` : ''}
        {counts.failed ? ` · ${counts.failed} failed or unconfirmed` : ''}
        {counts.pending ? ` · ${counts.pending} pending` : ''}
      </Text> : null}
      {error ? <Text size="sm">{error}</Text> : null}
      {attention ? <AiReviewBatchFailures entries={batch.entries} /> : null}
  </AiBatchProgress>;
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
