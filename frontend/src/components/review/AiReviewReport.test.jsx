import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AiReviewReport } from './AiReviewReport.jsx';

function show(report) { render(<MantineProvider><AiReviewReport report={report} /></MantineProvider>); }
const checks = [
  { aspect: 'Scope identifies users', source: 'DELIVERABLE_REQUIREMENTS', documentEvidence: 'Scope: students and advisers.', requirement: 'Identify intended users.' },
  { aspect: 'Submission workflow exists', source: 'OFFICIAL_TEMPLATE', documentEvidence: 'FR-01: submit PDF.', requirement: '3.2 Functional requirements' }
];

it('renders issues first with title, next action, and collapsed evidence', () => {
  show({ outcome: 'ISSUES_IDENTIFIED', findings: [{ title: 'Missing constraints detail', issue: 'The constraints section is incomplete.', nextAction: 'Add the offline requirement.', evidence: 'Section 2.4 passage', requirement: '2.4 Constraints', location: { page: 4, section: 'Constraints' } }] });
  expect(screen.getByText('Issues to review')).toBeInTheDocument();
  expect(screen.getByText('Missing constraints detail')).toBeInTheDocument();
  expect(screen.getByText('Add the offline requirement.')).toBeInTheDocument();
  expect(screen.queryByText('Section 2.4 passage')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('View evidence'));
  expect(screen.getByText('Submitted document')).toBeInTheDocument();
  expect(screen.getByText('Requirement')).toBeInTheDocument();
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
  expect(screen.queryByText('Scope: students and advisers.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Observed checks (2)'));
  fireEvent.click(screen.getAllByText('View evidence')[0]);
  expect(screen.getByText('Scope: students and advisers.')).toBeInTheDocument();
});

it('deduplicates repeated findings and preserves full evidence text once', () => {
  show({ findings: [
    { issue: 'Wrong section', source: 'DOCUMENT', evidence: 'A full submitted passage with exact wording.', requirement: '' },
    { issue: 'Wrong section', source: 'DOCUMENT', evidence: 'A full submitted passage with exact wording.', requirement: '' }
  ] });
  expect(screen.getAllByText('Wrong section')).toHaveLength(1);
  fireEvent.click(screen.getByText('View evidence'));
  expect(screen.getAllByText('A full submitted passage with exact wording.')).toHaveLength(1);
});

it('treats an empty legacy generic report as inconclusive', () => {
  show({ summary: 'The PDF satisfies all requirements.', findings: [], missingRequiredSections: [] });
  expect(screen.getByRole('status')).toHaveTextContent('Inconclusive AI Review');
  expect(screen.queryByText('No actionable issues identified in the checked areas')).not.toBeInTheDocument();
});
