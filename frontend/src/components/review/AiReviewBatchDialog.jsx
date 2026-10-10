import { useState } from 'react';
import { Alert, Button, Checkbox, Group, Progress, Radio, Stack, Text } from '@mantine/core';
import { aiBatchGroups, aiBatchSelection } from '../../lib/aiReviewBatch.js';
import { formatDateTime } from '../../lib/workflow.js';

export function AiReviewBatchDialog({ plan, error, busy, onStart, onCancel }) {
  const [mode, setMode] = useState('ATTENTION');
  const [includeOutdated, setIncludeOutdated] = useState(true);
  const [retryAcknowledged, setRetryAcknowledged] = useState(false);
  const ready = plan?.state === 'READY';
  const counts = aiBatchSelection(plan, mode, includeOutdated);
  const updated = aiBatchGroups(plan?.entries, 'ALL').filter(group => group.some(e => e.preview.outdated));
  const unverified = (plan?.entries || []).filter(entry => entry.phase === 'UNVERIFIED');
  return <Stack gap="md">
    {error ? <Alert color="red" role="alert">{error}</Alert> : null}
    {!ready ? <div role="status">
      <Text fw={700}>Checking current files and saved reviews</Text>
      <Text size="sm">{plan?.preparedPdfs || 0} of {plan?.totalPdfs || 0} PDF submissions checked. This does not send a Gemini request.</Text>
      <Progress mt="sm" value={plan?.totalPdfs ? plan.preparedPdfs / plan.totalPdfs * 100 : 0} animated />
    </div> : <>
      <div aria-live="polite">
        <Text fw={700} size="lg">{counts.unique} unique {counts.unique === 1 ? 'document' : 'documents'} to review</Text>
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
          label={`Include these updated documents (${updated.length})`} />
        <details className="wt-ai-batch-details"><summary>See updated documents</summary>
          {updated.map(group => <div key={group[0].preview.key}>
            <Text size="sm" fw={600}>{group[0].preview.deliverableTitle} — {group[0].preview.studentName}</Text>
            <Text size="sm">Saved review: {formatDateTime(group[0].preview.generatedAt)} · Drive edit: {formatDateTime(group[0].preview.modifiedAt)}</Text>
            {group.some(e => e.newerHistory) ? <Text size="sm">Document Check also recorded a file update after the saved AI Review.</Text> : null}
          </div>)}
        </details>
      </Alert> : null}
      {unverified.length ? <Alert color="orange" title={`${unverified.length} PDF submissions could not be verified`}>
        <Text size="sm">They are excluded from the review count. Their uniqueness is unknown, and no AI review has started for them.</Text>
        <details className="wt-ai-batch-details"><summary>See verification failures</summary>
          {unverified.map(entry => <Text size="sm" key={`${entry.target.responseId}:${entry.target.fieldId}`}>{entry.error}</Text>)}
        </details>
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
