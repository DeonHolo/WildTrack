import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AiReviewCoverage } from './AiReviewCoverage.jsx';
import { AiReviewReport } from './AiReviewReport.jsx';

const checks = [
  { aspect: 'Named users and their tasks', source: 'DOCUMENT', documentEvidence: 'Students submit project work; advisers review assigned teams.' },
  { aspect: 'Recovery behavior', source: 'DOCUMENT', documentEvidence: 'An interrupted upload keeps the draft and offers a retry.' }
];
const row = (id, status, extra = {}) => ({ id, requirement: `Describe ${id}.`,
  source: 'OFFICIAL_TEMPLATE', status, verifiedCheckIndexes: [], findingIndexes: [], missingSectionIndexes: [], verificationNoteIndexes: [], ...extra });
const report = (criteria, extra = {}) => ({ verifiedChecks: checks, findings: [], missingRequiredSections: [], verificationNotes: [],
  coverage: { criteria, omittedCriteria: 0, completedPasses: 1 }, ...extra });
function show(value, Component = AiReviewCoverage) {
  render(<MantineProvider><Component report={value} /></MantineProvider>);
  return screen.getByRole('region', { name: 'Saved review scope' });
}

it('shows only unrecorded requirements in the limits, without a second evidence table', () => {
  const region = show(report([row('C1', 'EVIDENCE_RECORDED', { verifiedCheckIndexes: [0] }), row('C2', 'NOT_CHECKED')]));
  expect(region).toHaveTextContent('not a check of every PDF section or an approval');
  expect(region).toHaveTextContent('No supporting record was saved');
  expect(region).toHaveTextContent('Describe C2.');
  expect(region).not.toHaveTextContent('Describe C1.');
  expect(region).not.toHaveTextContent(checks[0].aspect);
  expect(within(region).queryByRole('button')).not.toBeInTheDocument();
  expect(within(region).queryByRole('blockquote')).not.toBeInTheDocument();
});

it.each([
  { verifiedCheckIndexes: [9] }, { verifiedCheckIndexes: [0.5] }, { verifiedCheckIndexes: ['0'] },
  { verifiedCheckIndexes: [0, 0] }, { source: 'STUDENT_REQUIREMENTS', verifiedCheckIndexes: [0] },
  { verifiedCheckIndexes: [] }, { status: 'PASS', verifiedCheckIndexes: [0] }, { verifiedCheckIndexes: '0' }
])('does not hide an unrecorded requirement behind invalid evidence references: %j', change => {
  const region = show(report([row('C1', 'EVIDENCE_RECORDED', change)]));
  expect(region).toHaveTextContent('Describe C1.');
  expect(region).toHaveTextContent('references could not be matched');
});

it('keeps duplicate criterion IDs and reused evidence from implying broader checks', () => {
  const region = show(report([
    row('C1', 'EVIDENCE_RECORDED', { verifiedCheckIndexes: [0] }),
    row('C1', 'EVIDENCE_RECORDED', { verifiedCheckIndexes: [1] }),
    row('C3', 'EVIDENCE_RECORDED', { verifiedCheckIndexes: [0] }),
    row('C4', 'EVIDENCE_RECORDED', { verifiedCheckIndexes: [0] })
  ]));
  expect(within(region).getAllByText('Describe C1.')).toHaveLength(2);
  expect(region).toHaveTextContent('Describe C4.');
  expect(region).not.toHaveTextContent('Describe C3.');
});

it('keeps a duplicate observation from covering a second requirement', () => {
  const region = show(report([row('C1', 'EVIDENCE_RECORDED', { verifiedCheckIndexes: [1] })], {
    verifiedChecks: [checks[0], { ...checks[0], aspect: 'Same quote under another heading' }]
  }));
  expect(region).toHaveTextContent('Describe C1.');
});

it('preserves omitted items and follow-up notices without displaying every covered heading', () => {
  const value = report([row('C1', 'EVIDENCE_RECORDED', { verifiedCheckIndexes: [0] })]);
  value.coverage = { ...value.coverage, omittedCriteria: 3, completedPasses: 2,
    followupNotice: 'The additional attempt could not be completed.' };
  const region = show(value);
  expect(region).toHaveTextContent('3 additional template or instruction items were outside the saved checklist.');
  expect(region).toHaveTextContent(value.coverage.followupNotice);
  expect(region).not.toHaveTextContent('Describe C1.');
});

it('does not invent a checklist for older reports', () => {
  expect(show({ verifiedChecks: checks })).toHaveTextContent('A requirement checklist was not recorded');
});

it('distinguishes an unavailable checklist from an older report', () => {
  const region = show(report([]));
  expect(region).toHaveTextContent('No applicable requirement checklist was available');
  expect(region).not.toHaveTextContent('not recorded for this saved review');
});

it('keeps review limits optional while showing each saved excerpt in only one place', () => {
  const value = report([row('C1', 'EVIDENCE_RECORDED', { verifiedCheckIndexes: [0] }), row('C2', 'NOT_CHECKED')],
    { outcome: 'NO_ISSUES_IN_CHECKED_AREAS' });
  const region = show(value, AiReviewReport);
  expect(region).not.toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('not approval or a guarantee of full compliance');
  expect(screen.queryByText('Review coverage')).not.toBeInTheDocument();
  expect(screen.queryByText(/See review areas/)).not.toBeInTheDocument();
  expect(screen.getAllByText(checks[0].documentEvidence)).toHaveLength(1);
  fireEvent.click(screen.getByText('Review limits'));
  expect(region).toBeVisible();
  expect(region).toHaveTextContent('Describe C2.');
});
