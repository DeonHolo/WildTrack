import { describe, expect, it } from 'vitest';
import { aiReviewReportStatus, artifactAiReviewStatus, hasAiReviewNotes } from './workflow.js';

describe('AI Review result labels', () => {
  const sourceUrl = 'https://drive.google.com/file/d/example/view';
  const field = { id: 'pdf', definitionId: 'pdf', aiReviewEnabled: true };
  const report = { outcome: 'ISSUES_IDENTIFIED', documentOverview: {
    wrongDocument: true, actualDocumentType: 'Blank document', text: 'The PDF contains only nothing.'
  }, findings: [{ issue: 'The submission contains only the word nothing.', evidence: 'nothing', location: { page: 1 } }] };

  it('shows the blank-document result instead of treating completion as a clean review', () => {
    const response = { values: { pdf: sourceUrl }, artifactAiReviews: { pdf: {
      status: 'COMPLETED', sourceUrl, report
    } } };
    expect(aiReviewReportStatus(report)).toBe('Needs attention');
    expect(artifactAiReviewStatus(response, field)).toBe('Needs attention');
  });

  it.each([
    { documentOverview: { wrongDocument: true } },
    { flags: [{ issue: 'The totals disagree.' }] },
    { missingRequiredSections: [{ section: 'Purpose' }] },
    { outcome: 'INCONCLUSIVE', coverage: { criteria: [{ assessment: 'NEEDS_ATTENTION' }] } }
  ])('retains an identified concern even when there is no ordinary findings array', finding => {
    expect(aiReviewReportStatus(finding)).toBe('Needs attention');
  });

  it('gives a concern priority over manual checks and evidence limitations', () => {
    expect(aiReviewReportStatus({ ...report, verificationNotes: [{ issue: 'Inspect the diagram.' }],
      coverage: { criteria: [{ assessment: 'UNVERIFIED' }] }
    })).toBe('Needs attention');
  });

  it('uses the same attention label for an AI question and a reported defect', () => {
    expect(aiReviewReportStatus({ coverage: { criteria: [{ assessment: 'CHECK_MANUALLY' }] } })).toBe('Needs attention');
    expect(aiReviewReportStatus({ verificationNotes: [{ issue: 'The table does not establish the review frequency.' }] })).toBe('Needs attention');
  });

  it('keeps quotation-matching notes separate from an actual concern', () => {
    const report = { outcome: 'INCONCLUSIVE', coverage: { criteria: [{ assessment: 'UNVERIFIED',
      explanation: 'The supporting quotation could not be verified. Unverified AI observation: The plan describes recovery.' }] } };
    expect(aiReviewReportStatus(report)).toBe('No issues');
    expect(hasAiReviewNotes(report)).toBe(true);
    expect(aiReviewReportStatus({ ...report, findings: [{ issue: 'The recovery time has two conflicting values.' }] })).toBe('Needs attention');
  });

  it('does not label an empty or incomplete saved result as clean', () => {
    for (const report of [null, {}, { outcome: 'NO_ISSUES_IN_CHECKED_AREAS' },
      { coverage: { criteria: [{ assessment: 'APPEARS_ADDRESSED' }, {}] } },
      { coverage: { omittedCriteria: 1, criteria: [{ assessment: 'APPEARS_ADDRESSED' }] } }]) {
      expect(aiReviewReportStatus(report)).toBe('Needs attention');
    }
  });

  it('does not let a historical problem hide a failure of the latest request', () => {
    const response = { values: { pdf: sourceUrl }, artifactAiReviews: { pdf: {
      status: 'UNCERTAIN', sourceUrl, previousReport: report
    } } };
    expect(artifactAiReviewStatus(response, field)).toBe('Retry required');
  });
});
