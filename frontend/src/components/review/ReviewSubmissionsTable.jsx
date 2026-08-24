import {
  ActionIcon,
  Checkbox,
  ScrollArea,
  Stack,
  Table,
  Text,
  Tooltip,
  UnstyledButton,
  VisuallyHidden
} from '@mantine/core';
import { WarningCircle, CaretRight } from '@phosphor-icons/react';
import { documentCheckStatus } from './DocumentCheckDialog.jsx';
import { findStudent, formatDateTime, isAiReportCurrent } from '../../lib/workflow.js';
import { StatusIndicator } from '../ui.jsx';

export function ReviewSubmissionsTable({
  conflictStudentNumbers = [],
  responses,
  state,
  deliverable,
  documentCheckEnabled,
  selectedResponseId,
  selectedIds,
  onOpen,
  onToggle,
  onToggleAll
}) {
  const allVisibleSelected = responses.length > 0 && responses.every((response) => selectedIds.has(response.id));
  const someVisibleSelected = responses.some((response) => selectedIds.has(response.id));

  return (
    <div className="wt-review-submissions-surface">
      {responses.length ? (
        <ScrollArea type="auto" scrollbarSize={10}>
          <Table
            aria-label={`${deliverable.shortTitle} submissions`}
            className="wt-review-submissions-table"
            verticalSpacing="xs"
            horizontalSpacing="sm"
            highlightOnHover
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="wt-review-select-cell">
                  <Checkbox
                    size="sm"
                    aria-label="Select all visible responses"
                    checked={allVisibleSelected}
                    indeterminate={!allVisibleSelected && someVisibleSelected}
                    onChange={(event) => onToggleAll(event.currentTarget.checked)}
                  />
                </Table.Th>
                <Table.Th>Student</Table.Th>
                <Table.Th>Team</Table.Th>
                <Table.Th>Submitted</Table.Th>
                <Table.Th className="wt-review-status-cell">Document Check</Table.Th>
                <Table.Th className="wt-review-status-cell">AI Review</Table.Th>
                <Table.Th className="wt-review-status-cell">Decision</Table.Th>
                <Table.Th className="wt-review-open-cell"><VisuallyHidden>Open details</VisuallyHidden></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {responses.map((response) => {
                const student = findStudent(state.students, response.studentNumber);
                const studentName = student?.name || response.studentName || response.studentNumber;
                const archived = response.archiveStatus === 'Archived';
                const decision = archived ? 'Archived' : response.reviewStatus || response.primaryStatus || 'Received';
                return (
                  <Table.Tr key={response.id} data-selected={selectedResponseId === response.id || undefined}>
                    <Table.Td className="wt-review-select-cell">
                      <Checkbox
                        size="sm"
                        aria-label={`Select ${studentName} response`}
                        checked={selectedIds.has(response.id)}
                        onChange={(event) => onToggle(response.id, event.currentTarget.checked)}
                      />
                    </Table.Td>
                    <Table.Td>
                      <UnstyledButton className="wt-review-student-button" aria-label={`Review ${studentName} response`} onClick={() => onOpen(response.id)}>
                        <Stack gap={1}>
                          <Text component="span" size="sm" fw={750}>{studentName}</Text>
                          <Text component="span" size="xs" c="dimmed" className="wt-tabular">{response.studentNumber}</Text>
                          {conflictStudentNumbers.includes(response.studentNumber) && (
                            <Text component="span" size="xs" c="orange.7" fw={700}>Identity conflict</Text>
                          )}
                        </Stack>
                      </UnstyledButton>
                    </Table.Td>
                    <Table.Td><Text size="sm" className="wt-nowrap wt-tabular">{student?.teamCode || response.teamCode || 'Not assigned'}</Text></Table.Td>
                    <Table.Td><Text size="sm" className="wt-nowrap wt-tabular">{formatDateTime(response.updatedAt || response.submittedAt)}</Text></Table.Td>
                    <Table.Td className="wt-review-status-cell"><StatusIndicator status={documentCheckEnabled ? documentCheckStatus(response) : 'Not applicable'} /></Table.Td>
                    <Table.Td className="wt-review-status-cell"><StatusIndicator status={isAiReportCurrent(response) ? 'Reviewed' : 'Not reviewed'} /></Table.Td>
                    <Table.Td className="wt-review-status-cell"><StatusIndicator status={decision} /></Table.Td>
                    <Table.Td className="wt-review-open-cell">
                      <Tooltip label={`Review ${studentName}`}>
                        <ActionIcon variant="subtle" color="wildtrackMaroon" size="lg" aria-label={`Open ${studentName} review details`} onClick={() => onOpen(response.id)}>
                          <CaretRight size={17} aria-hidden="true" />
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      ) : null}
    </div>
  );
}
