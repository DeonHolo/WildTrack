import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AiReviewReport } from './AiReviewReport.jsx';

function show(report) { render(<MantineProvider><AiReviewReport report={report} /></MantineProvider>); }
const checks = [
  { aspect: 'Scope identifies users', source: 'DELIVERABLE_REQUIREMENTS', documentEvidence: 'Scope: students and advisers.', requirement: 'Identify intended users.' },
  { aspect: 'Submission workflow exists', source: 'OFFICIAL_TEMPLATE', documentEvidence: 'FR-01: submit PDF.', requirement: '3.2 Functional requirements' }
];

it('renders useful evidence and references inline with the specific action', () => {
  show({ outcome: 'ISSUES_IDENTIFIED', findings: [{ title: 'Missing constraints detail', issue: 'The constraints section is incomplete.', nextAction: 'Add the offline requirement.', evidence: 'Section 2.4 passage', requirement: '2.4 Constraints', location: { page: 4, section: 'Constraints' } }] });
  expect(screen.getByRole('region', { name: 'Issues to review' })).toBeInTheDocument();
  expect(screen.getByText('Missing constraints detail')).toBeInTheDocument();
  expect(screen.getByText('Add the offline requirement.')).toBeInTheDocument();
  expect(screen.getByText('Section 2.4 passage')).toBeInTheDocument();
  expect(screen.getByText('Submitted document')).toBeInTheDocument();
  expect(screen.getByText('Reference: 2.4 Constraints')).toBeInTheDocument();
  expect(screen.queryByText('View evidence')).not.toBeInTheDocument();
  expect(screen.getByText(/page 4/)).toBeInTheDocument();
});

it('keeps verification notes separate and prevents a green result with two checks', () => {
  show({ outcome: 'NO_ISSUES_IN_CHECKED_AREAS', verifiedChecks: checks, verificationNotes: [{ title: 'Diagram semantics require checking', issue: 'Image-only diagram cannot be verified.', evidence: 'Page 8 image', requirement: 'Diagram requirement' }] });
  expect(screen.getByText(/Verify in PDF/)).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Inconclusive AI Review');
  expect(screen.getByRole('status')).not.toHaveTextContent('No actionable issues');
});

it('shows positive outcome only for two distinct grounded checks and keeps observations collapsed', () => {
  show({ outcome: 'NO_ISSUES_IN_CHECKED_AREAS', verifiedChecks: checks });
  expect(screen.getByRole('status')).toHaveTextContent('No actionable issues identified in the checked areas');
  expect(screen.getByText('Observed checks (2)')).toBeInTheDocument();
  expect(screen.getByText('Scope: students and advisers.')).not.toBeVisible();
  fireEvent.click(screen.getByText('Observed checks (2)'));
  expect(screen.getByText('Scope: students and advisers.')).toBeInTheDocument();
});

it('deduplicates repeated findings and preserves full evidence text once', () => {
  show({ findings: [
    { issue: 'Wrong section', source: 'DOCUMENT', evidence: 'A full submitted passage with exact wording.', requirement: '' },
    { issue: 'Wrong section', source: 'DOCUMENT', evidence: 'A full submitted passage with exact wording.', requirement: '' }
  ] });
  expect(screen.getAllByText('Wrong section')).toHaveLength(1);
  expect(screen.getAllByText('A full submitted passage with exact wording.')).toHaveLength(1);
});

const glossaryFinding = (term, overrides = {}) => ({
  issue: `The acronym ${term} is used in the submitted PDF but is not defined in section 1.3 Definitions, Acronyms and Abbreviations.`,
  source: 'OFFICIAL_TEMPLATE', requirement: '1.3 Definitions, Acronyms and Abbreviations',
  evidence: `${term} submitted passage`, ...overrides
});

it('groups glossary corrections while retaining every original observation and evidence', () => {
  show({ findings: ['MVP', 'OCR', 'MAY'].map(term => glossaryFinding(term)) });
  expect(screen.getAllByRole('heading', { name: 'Small correction: review glossary definitions' })).toHaveLength(1);
  expect(screen.getByText(/MVP, OCR, MAY as undefined/)).toBeInTheDocument();
  expect(screen.getByText(/3 recorded issues in 1 review area/)).toBeInTheDocument();
  const originals = screen.getByText('Original glossary observations (3)').closest('details');
  expect(originals).not.toHaveAttribute('open');
  fireEvent.click(within(originals).getByText('Original glossary observations (3)'));
  for (const term of ['MVP', 'OCR', 'MAY']) expect(within(originals).getByText(`${term} submitted passage`)).toBeInTheDocument();
});

it('does not combine glossary findings from different authorities or sections', () => {
  show({ findings: [glossaryFinding('MVP'), glossaryFinding('OCR', { source: 'DELIVERABLE_REQUIREMENTS' }),
    glossaryFinding('MAY', { issue: 'The acronym MAY is not defined in section 2.1.', requirement: '2.1 Definitions' })] });
  expect(screen.getByText(/3 recorded issues in 3 review areas/)).toBeInTheDocument();
});

it('does not merge distinct requirement operators and keeps substantive observations ahead of glossary corrections', () => {
  show({ findings: [glossaryFinding('MVP', { requirement: 'Glossary <= 10 terms' }),
    glossaryFinding('OCR', { requirement: 'Glossary >= 10 terms' }),
    { title: 'Conflicting states', issue: 'The document uses two different acceptance states.', evidence: 'State: pending or accepted.' }] });
  expect(screen.getByText(/3 recorded issues in 3 review areas/)).toBeInTheDocument();
  expect(screen.getAllByRole('heading')[0]).toHaveTextContent('Conflicting states');
});

it('groups section checks without evidence buttons and preserves requirement references', () => {
  show({ missingRequiredSections: [
    { section: '1. Introduction', requirement: '1. Introduction', source: 'OFFICIAL_TEMPLATE' },
    { section: '2. Overall Description', requirement: 'Include the product context.', source: 'DELIVERABLE_REQUIREMENTS' }
  ] });
  expect(screen.getAllByRole('heading', { name: 'Check section coverage' })).toHaveLength(1);
  expect(screen.getByText('Reference: Include the product context.')).toBeInTheDocument();
  expect(screen.getByText(/2 recorded issues in 1 review area/)).toBeInTheDocument();
  expect(screen.queryByText('View evidence')).not.toBeInTheDocument();
});

it('groups uncertain section checks without counting them as supported issues or losing their evidence', () => {
  show({ outcome: 'NO_ISSUES_IN_CHECKED_AREAS', verifiedChecks: checks, verificationNotes: [
    { issue: 'The required section “1. Introduction” could not be located.', requirement: '1. Introduction', source: 'OFFICIAL_TEMPLATE', evidence: 'Original introduction observation' },
    { issue: 'The required section “2. Overall Description” could not be located.', requirement: '2. Overall Description', source: 'OFFICIAL_TEMPLATE', evidence: 'Original context observation' }
  ] });
  expect(screen.getByRole('status')).toHaveTextContent('Inconclusive AI Review');
  expect(screen.getAllByRole('heading', { name: 'Verify section coverage in the PDF', hidden: true })).toHaveLength(1);
  expect(screen.getByText(/0 recorded issues/)).toBeInTheDocument();
  expect(screen.getByText('Original introduction observation')).toBeInTheDocument();
  expect(screen.getByText('Original context observation')).toBeInTheDocument();
});

it('does not manufacture duplicated titles or generic next-step copy for legacy findings', () => {
  const issue = 'The required workflow has contradictory acceptance states and needs a precise decision rule.';
  show({ findings: [{ issue, requirement: 'Workflow rules', nextAction: 'Review the cited evidence and decide whether a revision is needed.' }] });
  expect(screen.getAllByText(issue)).toHaveLength(1);
  expect(screen.queryByText(/Review the cited evidence/)).not.toBeInTheDocument();
});

it('treats an empty legacy generic report as inconclusive', () => {
  show({ summary: 'The PDF satisfies all requirements.', findings: [], missingRequiredSections: [] });
  expect(screen.getByRole('status')).toHaveTextContent('Inconclusive AI Review');
  expect(screen.queryByText('No actionable issues identified in the checked areas')).not.toBeInTheDocument();
});
