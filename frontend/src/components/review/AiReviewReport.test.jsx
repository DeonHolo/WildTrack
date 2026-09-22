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
