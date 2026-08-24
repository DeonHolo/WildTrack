import { Group, Paper, ScrollArea, Table, Text, UnstyledButton } from '@mantine/core';
import { CaretRight } from '@phosphor-icons/react';
import { formatDate } from '../../lib/workflow.js';

export function ReviewDeliverablesTable({ summaries, selectedId, onSelect }) {
  return (
    <Paper withBorder className="wt-review-surface wt-review-deliverables" radius="md">
      <div className="wt-review-section-head">
        <div>
          <Text component="h2" fw={750} size="lg">Deliverables</Text>
          <Text size="sm" c="dimmed">Choose a deliverable to inspect its current submission queue.</Text>
        </div>
        <Text size="sm" fw={700} c="dimmed">{summaries.length} mapped</Text>
      </div>

      {summaries.length ? (
        <ScrollArea type="auto" scrollbarSize={10}>
          <Table aria-label="Deliverables awaiting review" className="wt-review-deliverable-table" verticalSpacing="xs" horizontalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Deliverable</Table.Th>
                <Table.Th>Due</Table.Th>
                <Table.Th className="wt-review-number">Expected</Table.Th>
                <Table.Th className="wt-review-number">Received</Table.Th>
                <Table.Th className="wt-review-number">Missing</Table.Th>
                <Table.Th className="wt-review-number">Unchecked</Table.Th>
                <Table.Th className="wt-review-number">Needs action</Table.Th>
                <Table.Th className="wt-review-number">Accepted</Table.Th>
                <Table.Th className="wt-review-number">Archived</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {summaries.map((summary) => {
                const selected = summary.deliverable.id === selectedId;
                return (
                  <Table.Tr key={summary.deliverable.id} data-selected={selected || undefined}>
                    <Table.Td>
                      <UnstyledButton
                        className="wt-review-deliverable-button"
                        aria-label={`Open ${summary.deliverable.shortTitle} review`}
                        aria-current={selected ? 'true' : undefined}
                        onClick={() => onSelect(summary.deliverable.id)}
                      >
                        <Group gap="sm" wrap="nowrap" className="wt-review-deliverable-label">
                          <Text component="span" fw={800} size="sm" className="wt-review-deliverable-code">{summary.deliverable.shortTitle}</Text>
                          <Text component="span" size="sm" c="dimmed" lineClamp={1} className="wt-review-deliverable-title">{summary.deliverable.title}</Text>
                          <CaretRight className="wt-review-deliverable-chevron" size={16} aria-hidden="true" />
                        </Group>
                      </UnstyledButton>
                    </Table.Td>
                    <Table.Td><Text size="sm" className="wt-nowrap wt-tabular">{formatDate(summary.deliverable.dueAt)}</Text></Table.Td>
                    <Table.Td className="wt-review-number">{summary.expected}</Table.Td>
                    <Table.Td className="wt-review-number">{summary.received}</Table.Td>
                    <Table.Td className="wt-review-number" data-attention={summary.missing > 0 || undefined}>{summary.missing}</Table.Td>
                    <Table.Td className="wt-review-number" data-attention={summary.unchecked > 0 || undefined}>{summary.unchecked}</Table.Td>
                    <Table.Td className="wt-review-number" data-attention={summary.needsAction > 0 || undefined}>{summary.needsAction}</Table.Td>
                    <Table.Td className="wt-review-number">{summary.accepted}</Table.Td>
                    <Table.Td className="wt-review-number">{summary.archived}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      ) : (
        <div className="wt-review-empty">
          <Text fw={700}>No deliverables available</Text>
          <Text size="sm" c="dimmed">Publish a mapped form before reviewing responses.</Text>
        </div>
      )}
    </Paper>
  );
}
