import { MantineProvider } from '@mantine/core';
import { render, screen, within } from '@testing-library/react';
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
  it('shows a current saved inconclusive report as Inconclusive', () => {
    expect(renderAiStatus([savedInconclusive])).toHaveTextContent(/^Inconclusive$/);
  });

  it.each([
    ['a reviewed PDF', [savedReviewed], 'Inconclusive'],
    ['an unreviewed PDF', [null], 'Inconclusive'],
    ['a running review', [{ status: 'RUNNING' }], 'Reviewing'],
    ['a retry-required review', [{ status: 'UNCERTAIN' }], 'Retry required'],
    ['running and retry-required reviews', [{ status: 'RUNNING' }, { status: 'UNCERTAIN' }], 'Retry required']
  ])('preserves the aggregate status with an inconclusive PDF and %s', (_, otherReviews, expected) => {
    expect(renderAiStatus([savedInconclusive, ...otherReviews])).toHaveTextContent(new RegExp(`^${expected}$`));
  });

  it('keeps Reviewed when every PDF has a current substantive report', () => {
    expect(renderAiStatus([savedReviewed, savedReviewed])).toHaveTextContent(/^Reviewed$/);
  });

  it('does not present an inconclusive report for a replaced PDF as current', () => {
    expect(renderAiStatus([{
      ...savedInconclusive,
      sourceUrl: 'https://example.test/replaced.pdf'
    }])).toHaveTextContent(/^Not reviewed$/);
  });
});
