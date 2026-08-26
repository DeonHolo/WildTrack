import { Button, Table, Text } from '@mantine/core';
import {
  Archive,
  ArrowSquareOut,
  FileMagnifyingGlass,
  IdentificationBadge,
  SealWarning,
  Table as TableIcon,
  WarningCircle
} from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '../../lib/workflow.js';

const TYPE_ICONS = {
  'Document Check': FileMagnifyingGlass,
  'Review decision': SealWarning,
  'Identity conflict': IdentificationBadge,
  'Import warning': TableIcon,
  'Archive final': Archive,
  'Archive storage failed': WarningCircle,
  'Integrity check failed': WarningCircle
};

export function WorkQueueTable({ tasks, runningIds, onCheck, onArchive, onDecideConflict }) {
  return (
    <div className="wt-command-table-wrap">
      <Table.ScrollContainer minWidth={700} type="native">
        <Table aria-label="Today's work queue" className="wt-command-table" verticalSpacing={0} horizontalSpacing={0}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Work</Table.Th>
              <Table.Th>Item</Table.Th>
              <Table.Th>Context</Table.Th>
              <Table.Th>Updated</Table.Th>
              <Table.Th>Action</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tasks.map((task) => {
              const Icon = TYPE_ICONS[task.type] || WarningCircle;
              return (
                <Table.Tr key={task.id}>
                  <Table.Td>
                    <div className={'wt-command-type is-' + task.category}>
                      <Icon size={18} weight="duotone" aria-hidden="true" />
                      <Text component="span" size="sm" fw={750}>{task.type}</Text>
                    </div>
                  </Table.Td>
                  <Table.Td>
                    <div className="wt-command-item-copy">
                      <Text component="strong" size="sm" fw={750}>{task.title}</Text>
                      <Text size="xs" c="dimmed">{task.detail}</Text>
                    </div>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" className="wt-mono">{task.teamCode}</Text>
                    <Text size="xs" c="dimmed">{task.deliverableCode}</Text>
                  </Table.Td>
                  <Table.Td><Text size="sm" className="wt-nowrap wt-tabular">{task.updatedAt ? formatDateTime(task.updatedAt) : 'Current import'}</Text></Table.Td>
                  <Table.Td>
                    {task.action === 'check' ? (
                      <Button
                        variant="default"
                        size="sm"
                        loading={runningIds.has(task.response.id)}
                        leftSection={<FileMagnifyingGlass size={17} />}
                        aria-label={task.actionAriaLabel}
                        onClick={() => onCheck(task)}
                      >
                        {task.actionLabel}
                      </Button>
                    ) : task.action === 'conflict' ? (
                      <div className="wt-command-action-pair">
                        <Button
                          variant="default"
                          size="sm"
                          loading={runningIds.has(task.id)}
                          leftSection={<IdentificationBadge size={17} />}
                          aria-label={task.actionAriaLabel}
                          onClick={() => onDecideConflict(task, 'RESOLVED')}
                        >
                          {task.actionLabel}
                        </Button>
                        <Button
                          variant="subtle"
                          color="gray"
                          size="sm"
                          disabled={runningIds.has(task.id)}
                          aria-label={task.dismissAriaLabel}
                          onClick={() => onDecideConflict(task, 'DISMISSED')}
                        >
                          Dismiss
                        </Button>
                      </div>
                    ) : task.action === 'archive' ? (
                      <Button
                        variant="default"
                        size="sm"
                        loading={runningIds.has(task.response.id)}
                        leftSection={<Archive size={17} />}
                        aria-label={task.actionAriaLabel}
                        onClick={() => onArchive(task)}
                      >
                        {task.actionLabel}
                      </Button>
                    ) : (
                      <Button
                        component={Link}
                        to={task.href}
                        variant="default"
                        size="sm"
                        leftSection={<ArrowSquareOut size={17} />}
                        aria-label={task.actionAriaLabel}
                      >
                        {task.actionLabel}
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </div>
  );
}
