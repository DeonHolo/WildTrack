import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SavedAiReviewsDialog } from './SavedAiReviewsDialog.jsx';

const item = (key, studentName, report, extra = {}) => ({ key, studentName, report, label: `${studentName} · SRS · PDF Drive Link`,
  deliverableTitle: 'SRS', fieldLabel: 'PDF Drive Link', generatedAt: '2026-10-29T10:00:00Z', ...extra });
const addressed = { outcome: 'NO_ISSUES_IN_CHECKED_AREAS', coverage: { omittedCriteria: 0, criteria: [{
  id: 'T1', source: 'OFFICIAL_TEMPLATE', requirement: 'Describe recovery.', explanation: 'The retry path is described.',
  assessment: 'APPEARS_ADDRESSED', documentEvidence: 'Users can retry an interrupted upload.', location: { page: 8 }
}] } };
const items = [
  item('clean', 'Alice', addressed),
  item('limits', 'Bob', { outcome: 'INCONCLUSIVE', coverage: { criteria: [{ assessment: 'UNVERIFIED' }] } }),
  item('manual', 'Cara', { verificationNotes: [{ issue: 'Check the arrow direction.' }] }),
  item('concern', 'Dee', { findings: [{ issue: 'Two dates conflict.' }] }, { previous: true, generatedAt: '2026-10-30T10:00:00Z', deliverableTitle: 'SDD' })
];
const open = (targets = items, onOpen = vi.fn()) => render(<MantineProvider><SavedAiReviewsDialog opened targets={targets}
  onClose={vi.fn()} onOpen={onOpen} /></MantineProvider>);
const names = () => screen.getAllByRole('listitem').map(row => row.textContent);

it('puts concerns and manual checks first, then sorts matching results by student', () => {
  open();
  expect(names()).toEqual(['Cara', 'Dee', 'Alice', 'Bob'].map(name => expect.stringContaining(name)));
  expect(screen.getByRole('status')).toHaveTextContent('4 of 4 saved reviews');
  expect(screen.getByLabelText('Sort by')).toHaveValue('attention');
});

it('filters actionable items separately from review limits, with an empty-state count', () => {
  open();
  fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'attention' } });
  expect(names()).toHaveLength(2);
  expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'notes' } });
  expect(screen.getByText('Bob')).toBeInTheDocument();
  expect(names()).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'No issues' } });
  expect(screen.getByText('Alice')).toBeInTheDocument();
  expect(screen.getByText('Bob')).toBeInTheDocument();
  expect(names()).toHaveLength(2);
});

it('sorts alphabetically, by deliverable, and by saved review date without changing target identity', () => {
  const onOpen = vi.fn();
  open(items, onOpen);
  fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'student' } });
  expect(names()[0]).toContain('Alice');
  fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'newest' } });
  expect(names()[0]).toContain('Dee');
  fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'deliverable' } });
  expect(names()[0]).toContain('Dee');
  fireEvent.click(screen.getByRole('button', { name: `View review: ${items[3].label}` }));
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining(items[3]));
  expect(items.map(item => item.key)).toEqual(['clean', 'limits', 'manual', 'concern']);
});

it('labels previous results and does not imply the latest attempt succeeded', () => {
  open();
  fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'previous' } });
  const row = screen.getByRole('listitem');
  expect(row).toHaveTextContent('Dee');
  expect(row).toHaveTextContent('Previous review');
  expect(within(row).getByText('Needs attention')).toBeInTheDocument();
});

it('shows no matches and keeps the controls available', () => {
  open([items[0]]);
  fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'attention' } });
  expect(screen.getByText('No saved reviews match this filter.')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('0 of 1 saved reviews');
  expect(screen.getByLabelText('Show')).toBeEnabled();
});

it('keeps backend-generated positive quote failures out of the attention filter', () => {
  const row = { assessment: 'CHECK_MANUALLY', documentEvidence: null, location: null,
    explanation: "Check Change history in the PDF (AI-cited page 2). The quotation could not be matched to the PDF's readable text. Gemini's unconfirmed observation: The change history includes dates." };
  open([item('legacy', 'Bob', { outcome: 'INCONCLUSIVE', coverage: { criteria: [row] } })]);
  expect(screen.getByText('No issues', { selector: 'span' })).toBeInTheDocument();
  expect(screen.getByText('Review notes available')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'attention' } });
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
});
