import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AiReviewCoverage, AiReviewVerificationLimits } from './AiReviewCoverage.jsx';

const criterion = (assessment, extra = {}) => ({ id: extra.id || 'C1', title: 'Describe recovery behavior',
  requirement: 'Describe recovery behavior.', source: 'OFFICIAL_TEMPLATE', assessment,
  explanation: 'The saved document describes the retry path.', documentEvidence: 'Users can retry an interrupted upload.',
  location: { page: 8, section: 'Recovery' }, ...extra });
function show(report) { render(<MantineProvider><AiReviewCoverage report={report} /></MantineProvider>); }

it('shows an unverified positive observation only in Review limits, without a pass or manual concern', () => {
  const report = { coverage: { criteria: [criterion('UNVERIFIED', { location: null, documentEvidence: null,
    explanation: 'The supporting quotation could not be verified. Unverified AI observation: The recovery path is described.' })] } };
  render(<MantineProvider><AiReviewCoverage report={report} /><AiReviewVerificationLimits report={report} /></MantineProvider>);
  expect(screen.queryByRole('region', { name: 'Template and instruction assessment' })).not.toBeInTheDocument();
  const limits = screen.getByRole('region', { name: 'Unverified AI observations' });
  expect(limits).toHaveTextContent('do not establish a document problem or a confirmed pass');
  expect(limits).not.toHaveTextContent('Appears addressed');
  expect(limits).not.toHaveTextContent('Check in PDF');
  expect(limits).toHaveTextContent('The recovery path is described.');
});

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
  expect(region).toHaveTextContent('Submitted PDF · page 8 · Recovery');
  expect(region).toHaveTextContent('p. 8');
  expect(region).not.toHaveTextContent('Appears addressed');
  expect(screen.getAllByRole('blockquote', { name: 'Evidence excerpt', hidden: true })).toHaveLength(2);
  expect(screen.getAllByRole('blockquote', { name: 'Evidence excerpt', hidden: true })[0]).not.toBeVisible();
  fireEvent.click(screen.getAllByText('Describe recovery behavior.')[0]);
  expect(screen.getAllByRole('blockquote', { name: 'Evidence excerpt', hidden: true })[0]).toHaveTextContent('Users can retry');
});

it('keeps linked excerpt pages separate and does not attribute them to an unlocated criterion', () => {
  const requirement = '📌 Explain the process. • Include 2 steps.';
  const first = criterion('NEEDS_ATTENTION', { requirement, location: null, findingIndexes: [0], explanation: 'x'.repeat(1000) });
  const second = criterion('CHECK_MANUALLY', { id: 'C2', title: 'Unknown location', location: null });
  show({ coverage: { criteria: [first, second] }, findings: [{ source: first.source, requirement, issue: 'Missing detail', evidence: 'Excerpt', location: { page: 3, section: 'Process' } }] });
  const rows = document.querySelectorAll('.wt-ai-review-assessment-row');
  expect(rows[0].querySelector('summary')).not.toHaveTextContent('p. 3');
  fireEvent.click(rows[0].querySelector('summary'));
  const content = rows[0].querySelector('.wt-ai-review-assessment-details');
  expect(content).not.toHaveTextContent('📌');
  expect(content.textContent.indexOf('Instruction:')).toBeLessThan(content.textContent.indexOf('Linked concern:'));
  expect(content).not.toHaveTextContent(first.explanation);
  expect(rows[0].querySelector('summary')).toHaveTextContent(first.explanation);
  expect(content.querySelector('blockquote')).toHaveClass('wt-ai-review-passage', 'wt-ai-review-quote');
  expect(content).not.toHaveTextContent('Excerpt from submitted PDF');
  expect(content.querySelector('blockquote cite')).toHaveTextContent('Submitted PDF · page 3 · Process');
  expect(content.lastElementChild).toHaveTextContent('Source: Submitted PDF · quotation unverified');
  expect(rows[1].querySelector('.wt-ai-review-assessment-details').lastElementChild).toHaveTextContent('Submitted PDF · quotation unverified');
});

it('retains each excerpt page when the criterion and a linked concern cite different PDF pages', () => {
  const row = criterion('CHECK_MANUALLY', { findingIndexes: [0] });
  show({ coverage: { criteria: [row] }, findings: [{ source: row.source, requirement: row.requirement,
    issue: 'Confirm the second passage.', evidence: 'A different passage.', location: { page: 5 } }] });
  const item = document.querySelector('.wt-ai-review-assessment-row');
  expect(item.querySelector('summary')).toHaveTextContent('p. 8');
  expect(item.querySelector('blockquote cite')).toHaveTextContent('Submitted PDF · page 5');
  expect(item.querySelector('.wt-ai-review-assessment-details').lastElementChild).toHaveTextContent('Submitted PDF · page 8 · Recovery');
});

it('omits a linked concern identical to the summary while preserving its distinct evidence', () => {
  const row = criterion('NEEDS_ATTENTION', { findingIndexes: [0] });
  show({ coverage: { criteria: [row] }, findings: [{ source: row.source, requirement: row.requirement,
    issue: row.explanation, evidence: 'Another passage.', location: { page: 5 } }] });
  const item = document.querySelector('.wt-ai-review-assessment-row');
  fireEvent.click(item.querySelector('summary'));
  expect(item.querySelector('.wt-ai-review-assessment-details')).not.toHaveTextContent(row.explanation);
  expect(item.querySelector('.wt-ai-review-assessment-details')).toHaveTextContent('Another passage.');
});

it('keeps positive assessments collapsed and never exposes historical evidence as a pass', () => {
  show({ coverage: { criteria: [criterion('APPEARS_ADDRESSED')] } });
  expect(screen.getByText('Appears addressed (1)')).toBeInTheDocument();
  expect(document.querySelector('.wt-ai-review-assessment-summary')).not.toBeVisible();
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
