import { useState } from 'react';
import { Button, Checkbox, Group, Stack, Text } from '@mantine/core';

export function AiReviewDialog({ targets = null, responses = [], excludeArchived = false, retry = false, retryTokens = {}, onConfirm, onCancel }) {
  const [includeArchived, setIncludeArchived] = useState(false);
  const items = targets || responses.map((response) => ({
    key: response.id,
    responseId: response.id,
    response,
    field: null,
    label: response.studentName || response.studentNumber || response.id
  }));
  const archived = items.filter(item => item.response?.archiveStatus === 'Archived').length;
  const selected = items.filter(item => !excludeArchived || includeArchived || item.response?.archiveStatus !== 'Archived');
  const retryCount = selected.filter(item => Boolean(retryTokens?.[item.key])).length;
  const mixedBatch = retryCount > 0 && retryCount < selected.length;
  return <Stack gap="md">
    <Text size="sm">{selected.length} {selected.length === 1 ? 'PDF artifact' : 'PDF artifacts'} selected. Identical PDFs from the same team, deliverable, and artifact field share a review when the requirements match.</Text>
    {excludeArchived && archived > 0 ? <Checkbox checked={includeArchived}
      onChange={event => setIncludeArchived(event.currentTarget.checked)}
      label={`Include archived submissions (${archived})`}
      description="Archived submissions are excluded by default." /> : null}
    <Text size="sm">{retryCount > 0
      ? `${retryCount} ${retryCount === 1 ? 'review needs' : 'reviews need'} an explicit retry. Previous attempts may already have used tokens; retrying may use additional tokens or incur charges.${mixedBatch ? ' Other selected responses will start normally or reuse a saved matching review.' : ''}`
      : retry
        ? 'This sends a new request for each selected review that needs retrying. Previous attempts may already have used tokens; retrying may use additional tokens or incur charges.'
        : 'New reviews send document contents to Gemini and use AI tokens. Saved matching reviews are reused.'}</Text>
    <Text size="sm" c="dimmed">AI feedback is advisory. Review it before making an academic decision.</Text>
    <Group justify="flex-end" gap="sm" wrap="nowrap" pt="sm">
      <Button variant="default" onClick={onCancel}>Cancel</Button>
      <Button disabled={!selected.length} onClick={() => onConfirm(targets ? selected : selected.map(item => item.responseId))}>
        {retry ? 'Retry reviews' : retryCount > 0 ? 'Start / retry reviews' : 'Start review'}
      </Button>
    </Group>
  </Stack>;
}
