import { MantineProvider } from '@mantine/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { ReviewSubmissionsTable } from './ReviewSubmissionsTable.jsx';

const savedInconclusive = {
  status: 'COMPLETED',
  report: { outcome: 'INCONCLUSIVE', summary: 'The available evidence was insufficient.' }
};
const savedReviewed = {
  status: 'COMPLETED',
  report: { outcome: 'ISSUES_IDENTIFIED', findings: [{ title: 'Missing test inputs' }] }
};

function renderAiStatus(reviews) {
  const fields = reviews.map((_, index) => ({
    definitionId: `pdf-${index}`,
    id: `pdf-${index}`,
    label: `PDF ${index + 1}`,
    type: 'drive',
    pdfRequired: true,
    aiReviewEnabled: true,
    documentCheckPolicy: 'MANUAL'
  }));
  const values = Object.fromEntries(fields.map((field) => [field.id, `https://example.test/${field.id}.pdf`]));
  const response = {
    id: 'response-a',
    studentNumber: 'STUDENT-A',
    studentName: 'Example Student',
    submittedAt: '2026-01-01T00:00:00Z',
    reviewStatus: 'Received',
    values,
    artifactAiReviews: Object.fromEntries(fields.flatMap((field, index) => reviews[index] ? [[
      field.definitionId,
      { sourceUrl: values[field.id], ...reviews[index] }
    ]] : []))
  };
  render(
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ReviewSubmissionsTable
        responses={[response]}
        state={{ students: [] }}
        deliverable={{ id: 'deliverable-a', shortTitle: 'STD', fields }}
        documentCheckEnabled
        selectedIds={new Set()}
        onOpen={vi.fn()}
        onToggle={vi.fn()}
        onToggleAll={vi.fn()}
      />
    </MantineProvider>
  );
  const row = screen.getByRole('button', { name: 'Review Example Student response' }).closest('tr');
  return within(row).getAllByRole('cell')[5];
}

describe('ReviewSubmissionsTable AI Review status', () => {
  it('shows a current saved insufficient-evidence report as Limited review coverage', () => {
    expect(renderAiStatus([savedInconclusive])).toHaveTextContent(/^Limited review coverage$/);
  });

  it.each([
    ['a reviewed PDF', [savedReviewed], 'Limited review coverage'],
    ['an unreviewed PDF', [null], 'Limited review coverage'],
    ['a running review', [{ status: 'RUNNING' }], 'Reviewing'],
    ['a retry-required review', [{ status: 'UNCERTAIN' }], 'Retry required'],
    ['running and retry-required reviews', [{ status: 'RUNNING' }, { status: 'UNCERTAIN' }], 'Retry required']
  ])('preserves the aggregate status with an inconclusive PDF and %s', (_, otherReviews, expected) => {
    expect(renderAiStatus([savedInconclusive, ...otherReviews])).toHaveTextContent(new RegExp(`^${expected}$`));
  });

  it('keeps Reviewed when every PDF has a current substantive report', () => {
    expect(renderAiStatus([savedReviewed, savedReviewed])).toHaveTextContent(/^Reviewed$/);
  });

  it('keeps specific manual-verification questions visible ahead of limited coverage', () => {
    const manual = { status: 'COMPLETED', report: { outcome: 'INCONCLUSIVE', verificationNotes: [{ issue: 'Check the original diagram.' }] } };
    expect(renderAiStatus([savedInconclusive, manual, savedReviewed])).toHaveTextContent(/^Check in PDF$/);
  });

  it('does not present an inconclusive report for a replaced PDF as current', () => {
    expect(renderAiStatus([{
      ...savedInconclusive,
      sourceUrl: 'https://example.test/replaced.pdf'
    }])).toHaveTextContent(/^Not reviewed$/);
  });
});

const sortableFields = [{ id: 'pdf', definitionId: 'pdf', pdfRequired: true, aiReviewEnabled: true, documentCheckPolicy: 'MANUAL' }];
const sortableDeliverable = { id: 'std', shortTitle: 'STD', title: 'Software Test Document', fields: sortableFields };
const sortableResponse = {
  id: 'student-a', deliverableId: 'std', studentNumber: 'STUDENT-A', studentName: 'Example Student',
  submittedAt: '2026-01-01T00:00:00Z', values: { pdf: 'https://example.test/std.pdf' }
};

function tableElement(overrides = {}) {
  return (
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ReviewSubmissionsTable
        responses={[sortableResponse]}
        state={{ students: [], deliverables: [sortableDeliverable] }}
        deliverable={sortableDeliverable}
        sort={{ column: 'submitted', direction: 'desc' }}
        selectedIds={new Set()}
        onSort={vi.fn()}
        onOpen={vi.fn()}
        onToggle={vi.fn()}
        onToggleAll={vi.fn()}
        {...overrides}
      />
    </MantineProvider>
  );
}

describe('ReviewSubmissionsTable sortable headers', () => {
  it('exposes only the active direction on its column and updates the visible direction', () => {
    const view = render(tableElement());
    expect(screen.getByRole('columnheader', { name: /Submitted/ })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('button', { name: 'Sort by Submitted' })).toHaveAttribute('data-sort-direction', 'desc');
    expect(view.container.querySelectorAll('th[aria-sort]')).toHaveLength(1);

    view.rerender(tableElement({ sort: { column: 'student', direction: 'asc' } }));
    expect(screen.getByRole('columnheader', { name: /Student/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: /Submitted/ })).not.toHaveAttribute('aria-sort');
    expect(screen.getByRole('button', { name: 'Sort by Student' })).toHaveAttribute('data-sort-direction', 'asc');
    expect(view.container.querySelectorAll('th[aria-sort]')).toHaveLength(1);
  });

  it('lets each sortable header request its column with a click', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(tableElement({ onSort, showDeliverable: true }));
    const columns = [
      ['Student', 'student'], ['Team', 'team'], ['Deliverable', 'deliverable'], ['Submitted', 'submitted'],
      ['Document Check', 'documentCheck'], ['AI Review', 'aiReview'], ['Decision', 'decision']
    ];
    for (const [label, column] of columns) {
      await user.click(screen.getByRole('button', { name: `Sort by ${label}` }));
      expect(onSort).toHaveBeenLastCalledWith(column);
    }
    expect(onSort).toHaveBeenCalledTimes(columns.length);
  });

  it('supports Enter and Space on a focused header button', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(tableElement({ onSort }));
    const button = screen.getByRole('button', { name: 'Sort by Student' });
    button.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onSort).toHaveBeenNthCalledWith(1, 'student');
    expect(onSort).toHaveBeenNthCalledWith(2, 'student');
  });

  it('hides the Deliverable column in the single-deliverable view', () => {
    render(tableElement());
    expect(screen.getByRole('table', { name: 'STD submissions' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Deliverable/ })).not.toBeInTheDocument();
  });

  it('labels and evaluates every All-view row using its own deliverable', () => {
    const proposal = { id: 'proposal', shortTitle: 'Proposal', title: 'Project Proposal', fields: [] };
    const stdResponse = {
      ...sortableResponse,
      artifactChecks: { pdf: { sourceUrl: sortableResponse.values.pdf, checkedAt: '2026-01-01T00:00:00Z' } },
      artifactAiReviews: { pdf: { ...savedReviewed, sourceUrl: sortableResponse.values.pdf } }
    };
    const proposalResponse = { ...sortableResponse, id: 'student-b', studentNumber: 'STUDENT-B', studentName: 'Second Student', deliverableId: proposal.id };
    render(tableElement({
      showDeliverable: true,
      state: { students: [], deliverables: [sortableDeliverable, proposal] },
      responses: [stdResponse, proposalResponse]
    }));
    expect(screen.getByRole('table', { name: 'All deliverables submissions' })).toBeInTheDocument();
    const stdRow = screen.getByRole('button', { name: 'Review Example Student response' }).closest('tr');
    expect(within(stdRow).getByText('STD')).toHaveAttribute('title', 'Software Test Document');
    expect(within(stdRow).getByText('Looks filled')).toBeInTheDocument();
    expect(within(stdRow).getByText('Reviewed')).toBeInTheDocument();
    const proposalRow = screen.getByRole('button', { name: 'Review Second Student response' }).closest('tr');
    expect(within(proposalRow).getByText('Proposal')).toHaveAttribute('title', 'Project Proposal');
    expect(within(proposalRow).getAllByText('Not applicable')).toHaveLength(2);
  });

  it('keeps selection and opening keyed to the response when Deliverable is visible', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    const onToggleAll = vi.fn();
    render(tableElement({ showDeliverable: true, onOpen, onToggle, onToggleAll }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Example Student response' }));
    expect(onToggle).toHaveBeenCalledWith(sortableResponse.id, true);
    await user.click(screen.getByRole('checkbox', { name: 'Select all visible responses' }));
    expect(onToggleAll).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Open Example Student review details' }));
    expect(onOpen).toHaveBeenCalledWith(sortableResponse.id);
  });
});
