import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AiReviewCoverage } from './AiReviewCoverage.jsx';
import { AiReviewReport } from './AiReviewReport.jsx';

const checks = [
  { aspect: 'Named users and their tasks', source: 'DOCUMENT', documentEvidence: 'Students submit project work; advisers review assigned teams.', location: { page: 3, section: 'Intended users' } },
  { aspect: 'Recovery behavior is described', source: 'DOCUMENT', documentEvidence: 'An interrupted upload keeps the draft and offers a retry.' }
];
const row = (id, status, extra = {}) => ({ id, requirement: `Describe ${id === 'C1' ? 'the intended users' : 'recovery behavior'}.`,
  source: 'OFFICIAL_TEMPLATE', status, verifiedCheckIndexes: [], findingIndexes: [], missingSectionIndexes: [], verificationNoteIndexes: [], ...extra });
const report = (criteria, extra = {}) => ({ verifiedChecks: checks, findings: [], missingRequiredSections: [], verificationNotes: [],
  coverage: { criteria, omittedCriteria: 0, completedPasses: 1 }, ...extra });
function show(value, Component = AiReviewCoverage) {
  render(<MantineProvider><Component report={value} /></MantineProvider>);
  return screen.getByRole('region', { name: 'Review coverage' });
}
function openAreas() { fireEvent.click(screen.getByText(/See review areas/)); }

describe('saved AI Review coverage', () => {
  it('shows source-specific areas and accepted evidence without calling them passed', () => {
    const region = show(report([
      row('C1', 'EVIDENCE_RECORDED', { verifiedCheckIndexes: [0] }),
      row('C2', 'NOT_CHECKED', { source: 'DELIVERABLE_REQUIREMENTS' })
    ]));
    expect(region).toHaveTextContent('1 of 2 supplied review areas have supporting records.');
    expect(region).toHaveTextContent('0 need manual verification · 1 not checked');
    expect(region).toHaveTextContent('It does not confirm that a requirement is satisfied');
    expect(region).not.toHaveTextContent(/\bpass(?:ed)?\b/i);
    expect(within(region).getByText('Describe the intended users.')).not.toBeVisible();
    openAreas();
    expect(within(region).getByText('Describe the intended users.')).toBeVisible();
    expect(region).toHaveTextContent('Source: Official template');
    expect(region).toHaveTextContent('Source: Deliverable requirements');
    expect(region).toHaveTextContent(`Supporting observation: ${checks[0].aspect}`);
    expect(within(region).queryByRole('blockquote')).not.toBeInTheDocument();
    expect(region).toHaveTextContent('PDF page 3 · Intended users');
  });

  it('keeps concrete issues and unresolved questions distinct from recorded evidence', () => {
    const finding = { title: 'Recovery loses a saved draft', issue: 'The two recovery descriptions conflict.', source: 'DOCUMENT', evidence: 'A failed upload deletes the draft.' };
    const note = { title: 'Check the sequence diagram', issue: 'The image is not readable enough to verify.', source: 'OFFICIAL_TEMPLATE', requirement: 'Show the recovery sequence.', evidence: 'Figure 6. Recovery sequence', location: { page: 8 } };
    const region = show(report([
      row('C1', 'ISSUE_RECORDED', { findingIndexes: [0] }),
      row('C2', 'NEEDS_VERIFICATION', { verificationNoteIndexes: [0] })
    ], { findings: [finding], verificationNotes: [note] }));
    expect(region).toHaveTextContent('1 of 2 supplied review areas have supporting records.');
    expect(region).toHaveTextContent('1 need manual verification · 0 not checked');
    openAreas();
    expect(region).toHaveTextContent('Issue identified');
    expect(region).toHaveTextContent('Needs manual verification');
    expect(region).toHaveTextContent(finding.title);
    expect(region).toHaveTextContent(note.title);
  });

  it('shows a missing section as a concern requiring confirmation in the original PDF', () => {
    const section = { section: '4. Recovery plan', source: 'OFFICIAL_TEMPLATE', requirement: '4. Recovery plan' };
    const region = show(report([row('C1', 'ISSUE_RECORDED', { missingSectionIndexes: [0] })], { missingRequiredSections: [section] }));
    openAreas();
    expect(region).toHaveTextContent('Not located in the saved review: 4. Recovery plan.');
    expect(region).toHaveTextContent('Confirm its presence or an equivalent section');
  });

  it.each([
    { name: 'out-of-range reference', change: { verifiedCheckIndexes: [9] } },
    { name: 'fractional reference', change: { verifiedCheckIndexes: [0.5] } },
    { name: 'coerced string reference', change: { verifiedCheckIndexes: ['0'] } },
    { name: 'duplicate reference', change: { verifiedCheckIndexes: [0, 0] } },
    { name: 'unknown authority', change: { source: 'STUDENT_REQUIREMENTS', verifiedCheckIndexes: [0] } },
    { name: 'state without evidence', change: { verifiedCheckIndexes: [] } },
    { name: 'unknown state', change: { status: 'PASS', verifiedCheckIndexes: [0] } },
    { name: 'malformed array', change: { verifiedCheckIndexes: '0' } }
  ])('does not show successful coverage for a $name', ({ change }) => {
    const region = show(report([row('C1', 'EVIDENCE_RECORDED', change)]));
    expect(region).toHaveTextContent('0 of 1 supplied review areas have supporting records.');
    openAreas();
    expect(within(region).getByText('Not checked')).toBeVisible();
    expect(region).toHaveTextContent('references could not be matched');
    expect(within(region).queryByRole('blockquote')).not.toBeInTheDocument();
  });

  it('does not use a duplicate observation as a supporting record', () => {
    const region = show(report([row('C1', 'EVIDENCE_RECORDED', { verifiedCheckIndexes: [1] })], {
      verifiedChecks: [checks[0], { ...checks[0], aspect: 'Same text under another heading' }]
    }));
    expect(region).toHaveTextContent('0 of 1 supplied review areas have supporting records.');
    openAreas();
    expect(within(region).getByText('Not checked')).toBeVisible();
  });

  it('keeps duplicate criterion IDs unchecked rather than multiplying coverage', () => {
    const region = show(report([
      row('C1', 'EVIDENCE_RECORDED', { verifiedCheckIndexes: [0] }),
      row('C1', 'EVIDENCE_RECORDED', { verifiedCheckIndexes: [1] })
    ]));
    expect(region).toHaveTextContent('0 of 2 supplied review areas have supporting records.');
    openAreas();
    expect(within(region).getAllByText('Not checked')).toHaveLength(2);
  });

  it('does not multiply a retained observation across several areas', () => {
    const region = show(report([
      row('C1', 'EVIDENCE_RECORDED', { verifiedCheckIndexes: [0] }),
      row('C2', 'EVIDENCE_RECORDED', { verifiedCheckIndexes: [0] })
    ]));
    expect(region).toHaveTextContent('1 of 2 supplied review areas have supporting records.');
    expect(region).toHaveTextContent('1 not checked');
  });

  it('shows an authoritative unresolved section check without inventing a PDF quotation', () => {
    const note = { issue: 'Confirm whether an equivalent recovery section is present.', source: 'OFFICIAL_TEMPLATE',
      requirement: 'Describe recovery behavior.', evidence: '' };
    const region = show(report([row('C1', 'NEEDS_VERIFICATION', { verificationNoteIndexes: [0] })],
      { verificationNotes: [note] }));
    expect(region).toHaveTextContent('0 of 1 supplied review areas have supporting records.');
    expect(region).toHaveTextContent('1 need manual verification · 0 not checked');
    openAreas();
    expect(region).toHaveTextContent(note.issue);
  });

  it('counts omitted areas as unchecked and preserves the stated scope', () => {
    const value = report([row('C1', 'EVIDENCE_RECORDED', { verifiedCheckIndexes: [0] })]);
    value.coverage = { ...value.coverage, omittedCriteria: 3, scopeNote: 'Ambiguous prose may contain other requirements.',
      completedPasses: 2, followupNotice: 'An additional look recorded another supported observation.' };
    const region = show(value);
    expect(region).toHaveTextContent('1 of 4 supplied review areas have supporting records.');
    expect(region).toHaveTextContent('0 need manual verification · 3 not checked');
    expect(region).toHaveTextContent('3 additional supplied review areas were outside this checklist and remain unchecked.');
    expect(region).toHaveTextContent(value.coverage.scopeNote);
    expect(region).toHaveTextContent(value.coverage.followupNotice);
  });

  it('does not invent a checklist for legacy saved reviews with two observations', () => {
    const region = show({ verifiedChecks: checks });
    expect(region).toHaveTextContent('A requirement checklist was not recorded for this saved review.');
    expect(within(region).queryByText(/of .* supplied review areas/)).not.toBeInTheDocument();
    expect(within(region).queryByText(/See review areas/)).not.toBeInTheDocument();
  });

  it('distinguishes an unavailable checklist from a legacy report', () => {
    const value = report([]);
    value.coverage.scopeNote = 'No applicable content requirements were supplied.';
    const region = show(value);
    expect(region).toHaveTextContent('No applicable requirement checklist was available for this review.');
    expect(region).toHaveTextContent(value.coverage.scopeNote);
    expect(region).not.toHaveTextContent('not recorded for this saved review');
  });

  it('keeps a no-issues result scoped when other supplied areas have no record', () => {
    const value = report([
      row('C1', 'EVIDENCE_RECORDED', { verifiedCheckIndexes: [0] }), row('C2', 'NOT_CHECKED')
    ], { outcome: 'NO_ISSUES_IN_CHECKED_AREAS' });
    const region = show(value, AiReviewReport);
    expect(screen.getByRole('status')).toHaveTextContent('No actionable issues identified in the checked areas');
    expect(screen.getByRole('status')).toHaveTextContent('not approval or a guarantee of full compliance');
    expect(region).toHaveTextContent('1 not checked');
    openAreas();
    fireEvent.click(within(region).getByRole('button', { name: 'Open supporting observations' }));
    const originalExcerpt = screen.getByText(checks[0].documentEvidence);
    expect(originalExcerpt.tagName).toBe('BLOCKQUOTE');
    expect(originalExcerpt).toHaveTextContent(checks[0].documentEvidence);
    expect(originalExcerpt).toBeVisible();
    expect(screen.getAllByText(checks[0].documentEvidence)).toHaveLength(1);
    expect(screen.getByText('Checks with supporting excerpts (2)')).toHaveFocus();
  });
});
