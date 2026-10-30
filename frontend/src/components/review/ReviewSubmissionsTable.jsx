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
import { CaretDown, CaretRight, CaretUp, CaretUpDown } from '@phosphor-icons/react';
import { findStudent, formatDateTime } from '../../lib/workflow.js';
import {
  aggregateAiStatus,
  aggregateDocumentStatus,
  resolveReviewDeliverable,
  reviewDecisionStatus
} from '../../lib/reviewTable.js';
import { StatusIndicator } from '../ui.jsx';
import { AiReviewHelp } from './AiReviewHelp.jsx';

function SortHeader({ column, children, className, sort, onSort }) {
  const active = sort?.column === column;
  const ascending = sort?.direction === 'asc';
  const nextDirection = active ? (ascending ? 'descending' : 'ascending') : (column === 'submitted' ? 'descending' : 'ascending');
  const SortIcon = active ? (ascending ? CaretUp : CaretDown) : CaretUpDown;

  return (
    <Table.Th className={className} aria-sort={active ? (ascending ? 'ascending' : 'descending') : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: className === 'wt-review-status-cell' ? 'center' : undefined }}><UnstyledButton
        aria-label={`Sort by ${children}`}
        title={`Sort ${nextDirection}`}
        data-sort-direction={active ? sort.direction : undefined}
        onClick={() => onSort?.(column)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: className === 'wt-review-status-cell' ? 'center' : undefined,
          gap: 5,
          width: column === 'aiReview' ? 'auto' : '100%',
          minHeight: 32,
          color: active ? 'var(--mantine-color-wildtrackMaroon-7)' : 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          textTransform: 'inherit',
          whiteSpace: 'nowrap'
        }}
      >
        {children}
        <SortIcon size={14} weight={active ? 'bold' : 'regular'} aria-hidden="true" style={{ flexShrink: 0 }} />
      </UnstyledButton>
      {column === 'aiReview' ? <AiReviewHelp /> : null}</div>
    </Table.Th>
  );
}

export function ReviewSubmissionsTable({
  conflictStudentNumbers = [],
  responses,
  state,
  deliverable,
  showDeliverable = false,
  sort,
  onSort,
  selectedResponseId,
  selectedIds,
  onOpen,
  onToggle,
  onToggleAll
}) {
  const allVisibleSelected = responses.length > 0 && responses.every((response) => selectedIds.has(response.id));
  const someVisibleSelected = responses.some((response) => selectedIds.has(response.id));
  const sortHeaderProps = { sort, onSort };

  return (
    <div className="wt-review-submissions-surface">
      {responses.length ? (
        <ScrollArea type="auto" scrollbarSize={10}>
          <Table
            aria-label={showDeliverable ? 'All deliverables submissions' : `${deliverable?.shortTitle || deliverable?.title || 'Deliverable'} submissions`}
            className="wt-review-submissions-table"
            data-all-deliverables={showDeliverable || undefined}
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
                <SortHeader column="student" {...sortHeaderProps}>Student</SortHeader>
                <SortHeader column="team" {...sortHeaderProps}>Team</SortHeader>
                {showDeliverable && <SortHeader column="deliverable" {...sortHeaderProps}>Deliverable</SortHeader>}
                <SortHeader column="submitted" {...sortHeaderProps}>Submitted</SortHeader>
                <SortHeader column="documentCheck" className="wt-review-status-cell" {...sortHeaderProps}>Document Check</SortHeader>
                <SortHeader column="aiReview" className="wt-review-status-cell" {...sortHeaderProps}>AI Review</SortHeader>
                <SortHeader column="decision" className="wt-review-status-cell" {...sortHeaderProps}>Decision</SortHeader>
                <Table.Th className="wt-review-open-cell"><VisuallyHidden>Open details</VisuallyHidden></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {responses.map((response) => {
                const student = findStudent(state.students, response.studentNumber);
                const studentName = student?.name || response.studentName || response.studentNumber;
                const rowDeliverable = resolveReviewDeliverable(response, state, deliverable);
                const documentStatus = aggregateDocumentStatus(response, rowDeliverable);
                const aiStatus = aggregateAiStatus(response, rowDeliverable);
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
                    {showDeliverable && (
                      <Table.Td><Text size="sm" fw={650} title={rowDeliverable?.title}>{rowDeliverable?.shortTitle || rowDeliverable?.title || 'Unavailable deliverable'}</Text></Table.Td>
                    )}
                    <Table.Td><Text size="sm" className="wt-nowrap wt-tabular">{formatDateTime(response.updatedAt || response.submittedAt)}</Text></Table.Td>
                    <Table.Td className="wt-review-status-cell"><StatusIndicator status={documentStatus} /></Table.Td>
                    <Table.Td className="wt-review-status-cell"><StatusIndicator status={aiStatus} /></Table.Td>
                    <Table.Td className="wt-review-status-cell"><StatusIndicator status={reviewDecisionStatus(response)} /></Table.Td>
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
