import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  Tooltip
} from '@mantine/core';
import { CheckCircle, Copy, PencilSimple, Prohibit } from '@phosphor-icons/react';
import { formatDate, formatTime } from '../../lib/workflow.js';
import { StatusIndicator } from '../ui.jsx';

export function PublishedFormsTable({
  deliverables,
  workspaceKey,
  onCopy,
  onEdit,
  onRepublish,
  onUnpublish
}) {
  return (
    <Paper className="wt-forms-table-surface" withBorder radius="md">
      <div className="wt-section-heading-row">
        <div>
          <Text component="h2" fw={750} size="lg">Published forms</Text>
          <Text size="sm" c="dimmed">One stable public link per mapped deliverable.</Text>
        </div>
        <Text size="sm" fw={700} c="dimmed">{deliverables.length} form{deliverables.length === 1 ? '' : 's'}</Text>
      </div>
      {deliverables.length ? (
        <ScrollArea type="auto" scrollbarSize={10}>
          <Table aria-label="Published submission forms" className="wt-forms-table" verticalSpacing="sm" horizontalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Deliverable</Table.Th>
                <Table.Th>Due</Table.Th>
                <Table.Th>Rule</Table.Th>
                <Table.Th>Public link</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th className="wt-forms-actions-column">Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {deliverables.map((item) => {
                const isPdf = item.fields?.some((field) => field.pdfRequired);
                const path = `/w/${workspaceKey}/submit/${item.slug}`;
                const published = item.status !== 'Unpublished';
                return (
                  <Table.Tr key={item.id}>
                    <Table.Td>
                      <Stack gap={2} miw={190}>
                        <Text fw={750} size="sm">{item.shortTitle}</Text>
                        <Text size="xs" c="dimmed" lineClamp={1}>{item.title}</Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" className="wt-tabular wt-nowrap">{formatDate(item.dueAt)} | {formatTime(item.dueAt)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" className="wt-nowrap">{isPdf ? 'PDF Drive link' : 'Link fields'}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap" miw={270}>
                        <Tooltip label={`Copy ${item.shortTitle} form link`}>
                          <ActionIcon
                            variant="default"
                            size="lg"
                            aria-label={`Copy ${item.shortTitle} form link`}
                            onClick={() => onCopy(item, path)}
                          >
                            <Copy size={17} aria-hidden="true" />
                          </ActionIcon>
                        </Tooltip>
                        <Anchor
                          href={path}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open ${item.shortTitle} submission form`}
                          className="wt-form-link"
                          size="sm"
                        >
                          {path}
                        </Anchor>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <StatusIndicator status={published ? 'Published' : 'Unpublished'} />
                    </Table.Td>
                    <Table.Td className="wt-forms-actions-column">
                      <Group gap="xs" wrap="nowrap" className="wt-form-row-actions">
                        <Button
                          variant="default"
                          size="sm"
                          leftSection={<PencilSimple size={16} aria-hidden="true" />}
                          aria-label={`Edit ${item.shortTitle} form`}
                          onClick={() => onEdit(item)}
                        >
                          Edit
                        </Button>
                        {published ? (
                          <Button
                            variant="subtle"
                            color="red"
                            size="sm"
                            leftSection={<Prohibit size={16} aria-hidden="true" />}
                            aria-label={`Unpublish ${item.shortTitle} form`}
                            onClick={() => onUnpublish(item)}
                          >
                            Unpublish
                          </Button>
                        ) : (
                          <Button
                            variant="light"
                            color="green"
                            size="sm"
                            leftSection={<CheckCircle size={16} aria-hidden="true" />}
                            aria-label={`Republish ${item.shortTitle} form`}
                            onClick={() => onRepublish(item)}
                          >
                            Republish
                          </Button>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      ) : (
        <div className="wt-forms-empty">
          <Text fw={700}>No forms published</Text>
          <Text size="sm" c="dimmed">Publish a mapped deliverable when it is ready for students.</Text>
        </div>
      )}
    </Paper>
  );
}
