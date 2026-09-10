import { useState } from 'react';
import { Button, Checkbox, Group, Stack, Text } from '@mantine/core';

export function AiReviewDialog({ responses, excludeArchived = false, retry = false, retryTokens = {}, onConfirm, onCancel }) {
  const [includeArchived, setIncludeArchived] = useState(false);
  const archived = responses.filter(response => response.archiveStatus === 'Archived').length;
  const selected = responses.filter(response => !excludeArchived || includeArchived || response.archiveStatus !== 'Archived');
  const retryCount = selected.filter(response => Boolean(retryTokens?.[response.id])).length;
  const mixedBatch = retryCount > 0 && retryCount < selected.length;
  return <Stack gap="md">
    <Text size="sm">{selected.length} {selected.length === 1 ? 'response' : 'responses'} selected. Identical PDFs from the same team and deliverable share a review when the requirements match.</Text>
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
      <Button disabled={!selected.length} onClick={() => onConfirm(selected.map(response => response.id))}>
        {retry ? 'Retry reviews' : retryCount > 0 ? 'Start / retry reviews' : 'Start review'}
      </Button>
    </Group>
  </Stack>;
}
