import { useState } from 'react';
import { Button, Group, Modal, NativeSelect, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import { StatusIndicator } from '../ui.jsx';
import { aiReviewAssessment, aiReviewReportStatus, formatDateTime } from '../../lib/workflow.js';

function resultStatus(report) {
  const rows = (report?.coverage?.criteria || []).map(aiReviewAssessment);
  if ((report?.findings || report?.flags || []).length
      || (report?.missingRequiredSections || report?.missingSections || []).length
      || rows.some(row => row?.assessment === 'NEEDS_ATTENTION')) return 'Needs attention';
  const status = aiReviewReportStatus(report);
  return status === 'Needs manual verification' ? 'Check in PDF'
    : status === 'Limited review coverage' ? 'Review limits' : 'No issues';
}

const priorities = { 'Needs attention': 0, 'Check in PDF': 1, 'Review limits': 2, 'No issues': 3 };
const filters = [
  { value: 'all', label: 'All saved reviews' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'Check in PDF', label: 'Check in PDF' },
  { value: 'Review limits', label: 'Review limits' },
  { value: 'No issues', label: 'No issues' },
  { value: 'previous', label: 'Previous reviews' }
];

export function SavedAiReviewsDialog({ opened, targets, onClose, onOpen }) {
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('attention');
  const reviews = targets.map(target => ({ ...target, result: resultStatus(target.report) }));
  const visible = reviews.filter(target => filter === 'all'
    || (filter === 'attention' ? priorities[target.result] < 2
      : filter === 'previous' ? target.previous : target.result === filter));
  const byName = (a, b) => a.studentName.localeCompare(b.studentName, 'en', { sensitivity: 'base' })
    || a.deliverableTitle.localeCompare(b.deliverableTitle, 'en', { sensitivity: 'base' })
    || a.label.localeCompare(b.label, 'en', { sensitivity: 'base' });
  const time = value => Date.parse(value) || 0;
  visible.sort((a, b) => (sort === 'attention' ? priorities[a.result] - priorities[b.result]
    : sort === 'newest' ? time(b.generatedAt) - time(a.generatedAt)
      : sort === 'deliverable' ? a.deliverableTitle.localeCompare(b.deliverableTitle, 'en', { sensitivity: 'base' }) : 0)
    || byName(a, b));

  return <Modal opened={opened} onClose={onClose} title="Saved AI Reviews" centered size="lg">
    <Stack gap="md">
      <Text size="sm" c="dimmed">Choose a saved review to open. This does not run AI Review.</Text>
      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
        <NativeSelect label="Show" value={filter} onChange={event => setFilter(event.currentTarget.value)} data={filters} />
        <NativeSelect label="Sort by" value={sort} onChange={event => setSort(event.currentTarget.value)} data={[
          { value: 'attention', label: 'Needs attention first' },
          { value: 'student', label: 'Student name A–Z' },
          { value: 'deliverable', label: 'Deliverable A–Z' },
          { value: 'newest', label: 'Newest review first' }
        ]} />
      </SimpleGrid>
      <Text size="sm" c="dimmed" role="status">{visible.length} of {targets.length} saved reviews</Text>
      <Stack component="ul" gap="sm" m={0} p={0} style={{ listStyle: 'none' }}>
        {visible.map(target => <Paper component="li" withBorder p="sm" key={target.key}>
          <Stack gap="xs">
            <Group justify="space-between" align="flex-start" gap="xs">
              <Text size="sm" fw={650} style={{ overflowWrap: 'anywhere' }}>{target.studentName}</Text>
              <StatusIndicator status={target.result} />
            </Group>
            <Text size="sm">{target.deliverableTitle} · {target.fieldLabel}</Text>
            <Group justify="space-between" gap="xs">
              <Text size="sm" c="dimmed">{target.previous ? 'Previous review' : 'Reviewed'}{target.generatedAt ? ` ${formatDateTime(target.generatedAt)}` : ''}</Text>
              <Button variant="default" style={{ backgroundColor: 'transparent', color: 'inherit' }} onClick={() => onOpen(target)} aria-label={`View review: ${target.label}`}>View AI Review</Button>
            </Group>
          </Stack>
        </Paper>)}
      </Stack>
      {!visible.length ? <Text size="sm">No saved reviews match this filter.</Text> : null}
    </Stack>
  </Modal>;
}
