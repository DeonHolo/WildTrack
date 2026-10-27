import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AiReviewCoverage } from './AiReviewCoverage.jsx';

const criterion = (assessment, extra = {}) => ({ id: extra.id || 'C1', title: 'Describe recovery behavior',
  requirement: 'Describe recovery behavior.', source: 'OFFICIAL_TEMPLATE', assessment,
  explanation: 'The saved document describes the retry path.', documentEvidence: 'Users can retry an interrupted upload.',
  location: { page: 8, section: 'Recovery' }, ...extra });
function show(report) { render(<MantineProvider><AiReviewCoverage report={report} /></MantineProvider>); }

it('keeps all 113 fixed instructions and distinguishes inapplicable items without warnings', () => {
  const criteria = Array.from({ length: 113 }, (_, index) => criterion('APPEARS_ADDRESSED', {
    id: `T${index + 1}`, title: `Instruction ${index + 1}`
  }));
  criteria[112] = { ...criteria[112], assessment: 'NOT_APPLICABLE', documentEvidence: '', location: null,
    explanation: 'External procurement is optional and the project uses existing equipment.' };
  show({ coverage: { criteria, omittedCriteria: 0 } });
  expect(screen.getByText('Appears addressed (112)')).toBeVisible();
  expect(screen.getByText('Not applicable (1)')).toBeVisible();
  expect(document.querySelectorAll('.wt-ai-review-assessment-row')).toHaveLength(113);
  fireEvent.click(screen.getByText('Not applicable (1)'));
  expect(screen.getByText('Instruction 113')).toBeVisible();
  expect(screen.getByText('Instruction 112')).not.toBeVisible();
  expect(screen.queryByText(/outside the saved checklist/)).not.toBeInTheDocument();
});

it('renders explicit concern and manual assessments as compact labeled rows with evidence disclosure', () => {
  show({ coverage: { criteria: [criterion('NEEDS_ATTENTION'), criterion('CHECK_MANUALLY', { id: 'C2', title: 'Confirm diagram semantics' })] } });
  const region = screen.getByRole('region', { name: 'Template and instruction assessment' });
  expect(region).toHaveTextContent('Needs attention');
  expect(region).toHaveTextContent('Check in PDF');
  expect(region).toHaveTextContent('Official template');
  expect(region).toHaveTextContent('p. 8');
  expect(region).not.toHaveTextContent('Appears addressed');
  expect(screen.getAllByRole('blockquote', { name: 'Evidence excerpt', hidden: true })).toHaveLength(2);
  expect(screen.getAllByRole('blockquote', { name: 'Evidence excerpt', hidden: true })[0]).not.toBeVisible();
  fireEvent.click(screen.getAllByText('Describe recovery behavior.')[0]);
  expect(screen.getAllByRole('blockquote', { name: 'Evidence excerpt', hidden: true })[0]).toHaveTextContent('Users can retry');
});

it('keeps positive assessments collapsed and never exposes historical evidence as a pass', () => {
  show({ coverage: { criteria: [criterion('APPEARS_ADDRESSED')] } });
  expect(screen.getByText('Appears addressed (1)')).toBeInTheDocument();
  expect(screen.queryByText('The saved document describes the retry path.')).not.toBeVisible();
  cleanup();
  show({ coverage: { criteria: [{ ...criterion('APPEARS_ADDRESSED'), assessment: null, status: 'EVIDENCE_RECORDED' }] } });
  expect(screen.queryByRole('region', { name: 'Template and instruction assessment' })).not.toBeInTheDocument();
});

it('omits the replacement list for older reports and preserves only the explicit omitted count', () => {
  show({ verifiedChecks: [{ aspect: 'Old check' }], coverage: { criteria: [{ id: 'C1', requirement: 'Old requirement', status: 'EVIDENCE_RECORDED' }] } });
  expect(screen.queryByRole('region', { name: 'Template and instruction assessment' })).not.toBeInTheDocument();
  cleanup();
  show({ coverage: { criteria: [], omittedCriteria: 2 } });
  expect(screen.getByRole('region', { name: 'Template and instruction assessment' })).toHaveTextContent('2 additional template or instruction items');
});
