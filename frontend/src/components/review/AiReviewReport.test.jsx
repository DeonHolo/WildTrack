import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AiReviewReport } from './AiReviewReport.jsx';

function show(report) {
  render(<MantineProvider><AiReviewReport report={report} /></MantineProvider>);
}

it('shows structured evidence instead of a second narrative rephrasing of the same issue', () => {
  show({
    summary: 'Document evidence: The submitted document identifies itself as an SPMP. A separate reviewer observation.',
    findings: [{
      source: 'DOCUMENT',
      issue: 'The submitted document identifies itself as an SPMP.',
      evidence: 'Page 1 heading: Software Project Management Plan',
      requirement: ''
    }],
    missingRequiredSections: [],
    limitations: ['No official template was supplied, so compliance was not assessed.']
  });

  expect(screen.getAllByText(/The submitted document identifies itself as an SPMP/)).toHaveLength(1);
  expect(screen.queryByText(/A separate reviewer observation/)).not.toBeInTheDocument();
  expect(screen.getByText(/Page 1 heading: Software Project Management Plan/)).toBeInTheDocument();
  expect(screen.getByText(/No official template was supplied/)).toBeInTheDocument();
});

it('suppresses the exact repeated evidence line but preserves a different source passage', () => {
  show({
    summary: 'There is a problem in section 2.4.',
    findings: [{
      source: 'OFFICIAL_TEMPLATE',
      issue: 'Section 2.4 has an incomplete description.',
      evidence: 'Section 2.4 has an incomplete description.',
      requirement: '2.4 Constraints'
    }],
    missingRequiredSections: []
  });

  expect(screen.queryByText('There is a problem in section 2.4.')).not.toBeInTheDocument();
  expect(screen.getByText(/Section 2.4 has an incomplete description/)).toBeInTheDocument();
  expect(screen.queryByText(/Evidence: Section 2.4 has an incomplete description/)).not.toBeInTheDocument();
  expect(screen.getByText(/Authority: 2.4 Constraints/)).toBeInTheDocument();
});

it('does not repeat a combined two-finding overview above its distinct source-backed findings', () => {
  const issueA = 'Section 3.3 Communications Interfaces is in a different hierarchy.';
  const issueB = 'Section 4 Functional Requirements differs from the template hierarchy.';
  show({
    summary: `Grounded requirement finding: ${issueA} Grounded requirement finding: ${issueB}`,
    findings: [
      { source: 'OFFICIAL_TEMPLATE', issue: issueA, evidence: 'Page 3, Table of Contents', requirement: '3.1 External interface requirements' },
      { source: 'OFFICIAL_TEMPLATE', issue: issueB, evidence: 'Page 3, Table of Contents', requirement: '3.2 Functional requirements' }
    ]
  });
  expect(screen.getAllByText(/Section 3\.3 Communications Interfaces/)).toHaveLength(1);
  expect(screen.getAllByText(/Section 4 Functional Requirements/)).toHaveLength(1);
  expect(screen.queryByText(/Grounded requirement finding/)).not.toBeInTheDocument();
});

it('labels a zero-grounding result inconclusive rather than treating it as a clean or verified PDF', () => {
  show({ summary: 'No source-grounded findings could be established.', findings: [], missingRequiredSections: [] });
  expect(screen.getByText('No source-grounded findings could be established.')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Inconclusive AI Review');
  expect(screen.getByRole('status')).toHaveTextContent('does not mean the PDF was verified or has no issues');
});

it('labels the actual postprocessor fallback as inconclusive even when it includes review limitations', () => {
  show({
    summary: 'The AI review returned no grounded findings from the submitted PDF or supplied requirement sources. No official template was supplied.',
    findings: [], missingRequiredSections: [],
    limitations: ['The official template could not be used in this review.']
  });
  expect(screen.getByRole('status')).toHaveTextContent('Inconclusive AI Review');
  expect(screen.getByText(/The official template could not be used/)).toBeInTheDocument();
});

it('does not label a substantive, evidence-backed report inconclusive even if its overview mentions no grounded findings', () => {
  show({
    summary: 'No grounded findings about formatting. The PDF explicitly identifies itself as an SPMP.',
    findings: [{ source: 'DOCUMENT', issue: 'The document identifies itself as an SPMP.',
      evidence: 'Title page: Software Project Management Plan', requirement: '' }],
    missingRequiredSections: []
  });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText(/Title page: Software Project Management Plan/)).toBeInTheDocument();
});

it('renders repeated identical findings once while keeping distinct evidence for the same issue', () => {
  const repeated = {
    source: 'DOCUMENT',
    issue: 'The submitted PDF identifies itself as an SPMP.',
    evidence: 'Title page: Software Project Management Plan',
    requirement: ''
  };
  show({
    summary: 'Document evidence: The submitted PDF identifies itself as an SPMP.',
    findings: [repeated, { ...repeated }, {
      ...repeated, evidence: 'Page 2: Project milestones and schedule'
    }],
    missingRequiredSections: []
  });

  expect(screen.getAllByText(/The submitted PDF identifies itself as an SPMP/)).toHaveLength(2);
  expect(screen.getByText(/Title page: Software Project Management Plan/)).toBeInTheDocument();
  expect(screen.getByText(/Page 2: Project milestones and schedule/)).toBeInTheDocument();
});

const groundedChecks = [
  { aspect: 'The system scope identifies the intended users', source: 'DELIVERABLE_REQUIREMENTS',
    documentEvidence: 'Section 1.3: The system serves capstone students and advisers.',
    requirement: 'Describe the scope and intended users of the proposed system.' },
  { aspect: 'Functional requirements describe submission behavior', source: 'OFFICIAL_TEMPLATE',
    documentEvidence: 'Section 3.2: The student submits a PDF link for adviser review.',
    requirement: '3.2 Functional requirements' }
];

it('shows a positive SRS result only for at least two distinct grounded observations, with their passages and limits', () => {
  show({ summary: 'The whole PDF is compliant.', findings: [], missingRequiredSections: [],
    verifiedChecks: groundedChecks });

  const status = screen.getByRole('status');
  expect(status).toHaveTextContent('No actionable issues identified in the checked areas');
  expect(screen.getByText('Verified checks')).toBeInTheDocument();
  expect(screen.getByText(/Section 1\.3: The system serves capstone students and advisers/)).toBeInTheDocument();
  expect(screen.getByText(/Describe the scope and intended users/)).toBeInTheDocument();
  expect(screen.getByText(/Section 3\.2: The student submits a PDF link/)).toBeInTheDocument();
  expect(screen.getByText(/Authority: 3\.2 Functional requirements/)).toBeInTheDocument();
  expect(screen.getByText(/not a guarantee of full compliance or approval/)).toBeInTheDocument();
  expect(screen.queryByText('The whole PDF is compliant.')).not.toBeInTheDocument();
  expect(screen.queryByText('Inconclusive AI Review')).not.toBeInTheDocument();
});

it('shows grounded positive checks separately from actionable findings without duplicate observations', () => {
  const duplicate = { ...groundedChecks[0], aspect: ` ${groundedChecks[0].aspect.toUpperCase()} ` };
  show({ summary: 'The document meets all requirements.', findings: [{
    source: 'OFFICIAL_TEMPLATE', issue: 'The constraints section does not explain the offline requirement.',
    evidence: 'Section 2.4: The app requires network access.', requirement: '2.4 Constraints'
  }], missingRequiredSections: [], verifiedChecks: [...groundedChecks, duplicate] });

  expect(screen.getByText('Issues to review')).toBeInTheDocument();
  expect(screen.getByText(/constraints section does not explain/)).toBeInTheDocument();
  expect(screen.getByText('Verified checks')).toBeInTheDocument();
  expect(screen.getAllByText(/Section 1\.3: The system serves capstone students and advisers/)).toHaveLength(1);
  expect(screen.getByText(/Section 3\.2: The student submits a PDF link/)).toBeInTheDocument();
  expect(screen.queryByText('No actionable issues identified in the checked areas')).not.toBeInTheDocument();
  expect(screen.queryByText('The document meets all requirements.')).not.toBeInTheDocument();
  expect(screen.getByText(/not a guarantee of full compliance or approval/)).toBeInTheDocument();
});

it('shows one verified check as observed evidence while marking a zero-issue result inconclusive', () => {
  show({ summary: 'All criteria passed.', findings: [], missingRequiredSections: [],
    verifiedChecks: [groundedChecks[0]] });

  expect(screen.getByRole('status')).toHaveTextContent('Inconclusive AI Review');
  expect(screen.getByRole('status')).toHaveTextContent('not establish enough distinct verified checks');
  expect(screen.getByText(/Section 1\.3: The system serves capstone students and advisers/)).toBeInTheDocument();
  expect(screen.queryByText('All criteria passed.')).not.toBeInTheDocument();
  expect(screen.queryByText('No actionable issues identified in the checked areas')).not.toBeInTheDocument();
});

it('does not count duplicated or unsupported observations toward a positive result', () => {
  show({ summary: 'All checks passed.', findings: [], missingRequiredSections: [],
    verifiedChecks: [groundedChecks[0], { ...groundedChecks[0] }, {
      ...groundedChecks[0], aspect: 'Students appear as the intended users', source: 'OFFICIAL_TEMPLATE',
      requirement: '3.2 Functional requirements' },
      { aspect: 'The system has a constraints section', source: 'OFFICIAL_TEMPLATE',
        documentEvidence: '', requirement: '2.4 Constraints' }] });

  expect(screen.getByRole('status')).toHaveTextContent('Inconclusive AI Review');
  expect(screen.getAllByText(/Section 1\.3: The system serves capstone students and advisers/)).toHaveLength(1);
  expect(screen.queryByText('The system has a constraints section')).not.toBeInTheDocument();
  expect(screen.queryByText('No actionable issues identified in the checked areas')).not.toBeInTheDocument();
});

it('does not promote a generic fallback or an empty prose claim into a clean result', () => {
  show({ summary: 'The PDF satisfies the SRS requirements.', findings: [], missingRequiredSections: [],
    verifiedChecks: [] });
  expect(screen.getByRole('status')).toHaveTextContent('Inconclusive AI Review');
  expect(screen.queryByText('No actionable issues identified in the checked areas')).not.toBeInTheDocument();
});
