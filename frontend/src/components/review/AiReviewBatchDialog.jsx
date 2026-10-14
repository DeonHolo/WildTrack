import { useState } from 'react';
import { Alert, Button, Checkbox, Group, Progress, Radio, Stack, Text } from '@mantine/core';
import { aiBatchUpdatedDocuments, aiBatchSelection } from '../../lib/aiReviewBatch.js';
import { formatDateTime } from '../../lib/workflow.js';
import { AiReviewBatchFailures } from './AiReviewBatchFailures.jsx';

export function AiReviewBatchDialog({ plan, error, busy, onStart, onCancel }) {
  const [mode, setMode] = useState('ATTENTION');
  const [includeOutdated, setIncludeOutdated] = useState(true);
  const [retryAcknowledged, setRetryAcknowledged] = useState(false);
  const ready = plan?.state === 'READY';
  const counts = aiBatchSelection(plan, mode, includeOutdated);
  const updated = aiBatchUpdatedDocuments(plan?.entries);
  const unverified = (plan?.entries || []).filter(entry => entry.phase === 'UNVERIFIED');
  return <Stack gap="md">
    {error ? <Alert color="red" role="alert">{error}</Alert> : null}
    {!ready ? <div role="status">
      <Text fw={700}>Checking current files and saved reviews</Text>
      <Text size="sm">{plan?.preparedPdfs || 0} of {plan?.totalPdfs || 0} PDF submissions checked. This does not send a Gemini request.</Text>
      <Progress mt="sm" value={plan?.totalPdfs ? plan.preparedPdfs / plan.totalPdfs * 100 : 0} animated />
    </div> : <>
      <div aria-live="polite">
        <Text fw={700} size="lg">{counts.unique} unique {counts.unique === 1 ? 'review' : 'reviews'} to run</Text>
        <Text size="sm">{plan.totalPdfs} total PDF submissions · {counts.artifacts} submissions in this selection</Text>
      </div>
      <Radio.Group label="Which documents should AI Review check?" value={mode} onChange={setMode}>
        <Stack gap="sm" mt="xs">
          <Radio value="ATTENTION" label="Documents needing attention"
            description="No review yet, failed or inconclusive reviews, and reviews with issues." />
          <Radio value="ALL" label="Include successful reviews too"
            description="Also send new reviews for documents with a successful no-issues result." />
        </Stack>
      </Radio.Group>
      {updated.length ? <Alert color="orange" title="Saved reviews no longer match the current files or requirements">
        <Checkbox checked={includeOutdated} onChange={e => setIncludeOutdated(e.currentTarget.checked)}
          label={`Include updated PDFs (${updated.length})`} />
        <Text size="sm" mt="xs">One entry per PDF, using its latest file record. Requirements changes can also make a saved review outdated.</Text>
        <details className="wt-ai-batch-details"><summary>See affected PDFs</summary>
          <Stack gap="sm" mt="sm">
            {updated.map(document => <div key={document.key}>
              <Text size="sm" fw={600}>
                {[document.latest.preview.deliverableTitle, document.latest.preview.artifactLabel].filter(Boolean).join(' · ')} — {document.latest.preview.studentName}
              </Text>
              <Text size="sm">Saved review: {formatDateTime(document.latest.preview.generatedAt)} · Drive edit: {formatDateTime(document.latest.preview.modifiedAt)}</Text>
              {document.latest.checkedAt ? <Text size="sm">Latest Document Check: {formatDateTime(document.latest.checkedAt)}</Text> : null}
              {document.reviewKeys.size > 1 ? <Text size="sm">{document.reviewKeys.size} separate artifact or requirements reviews use this PDF.</Text> : null}
              {document.entries.length > 1 ? <Text size="sm">{document.entries.length} PDF submissions refer to this file.</Text> : null}
              {document.entries.some(e => e.newerHistory) ? <Text size="sm">Document Check also recorded a file update after the saved AI Review.</Text> : null}
            </div>)}
          </Stack>
        </details>
      </Alert> : null}
      {unverified.length ? <Alert color="orange" title="Some PDFs could not be verified">
        <AiReviewBatchFailures entries={unverified} />
        <Text size="sm" mt="xs">These submissions are excluded from the review count because their contents could not be verified.</Text>
      </Alert> : null}
      <Text size="sm">Identical PDFs in the same team, deliverable and artifact field share one review. The count uses verified file contents and current review settings.</Text>
      <Text size="sm">New and repeated reviews send PDF contents to Gemini and use AI tokens.{counts.reruns ? ` ${counts.reruns} completed ${counts.reruns === 1 ? 'review will' : 'reviews will'} be rerun.` : ''}{counts.running ? ` ${counts.running} already-running ${counts.running === 1 ? 'review will' : 'reviews will'} be followed without another AI request.` : ''}</Text>
      {counts.retries ? <Checkbox checked={retryAcknowledged} onChange={e => setRetryAcknowledged(e.currentTarget.checked)}
        label={`I agree to retry ${counts.retries} uncertain ${counts.retries === 1 ? 'review' : 'reviews'}`}
        description="Previous attempts may already have used tokens. These retries can use additional tokens or incur charges." /> : null}
      <Text size="sm">The batch runs on the server. You can navigate away and return to its saved progress. AI feedback remains advisory.</Text>
    </>}
    <Group justify="flex-end" gap="sm">
      <Button variant="default" onClick={onCancel}>Cancel</Button>
      <Button loading={busy} disabled={!ready || !counts.unique || counts.retries > 0 && !retryAcknowledged}
        onClick={() => onStart({ version: plan.version, mode, includeOutdated, retryAcknowledged })}>Start review</Button>
    </Group>
  </Stack>;
}
