import { describe, expect, it } from 'vitest';
import { artifactAiReviewChange } from './workflow.js';

const field = { id: 'pdf', definitionId: 'pdf' };
const report = { summary: 'Saved before the change', findings: [] };
const observation = { changeType: 'CONTENT_CHANGED', firstObservedAt: '2026-10-13T18:20:51Z', driveModifiedTime: '2026-10-13T18:04:09Z' };
function response(review) { return { artifactAiReviews: { pdf: review }, observedFileHistoryByField: { pdf: { observations: [observation] } } }; }

describe('saved-report freshness during reruns', () => {
  it.each(['RUNNING', 'UNCERTAIN'])('retains the outdated warning for a %s attempt with the old receipt', status => {
    expect(artifactAiReviewChange(response({ status, previousReport: report,
      previousGeneratedAt: '2026-10-13T14:55:20Z', sourceVerifiedAt: '2026-10-13T14:55:20Z' }), field)).not.toBeNull();
  });
  it('restores the outdated warning for repaired legacy failed receipts', () => {
    expect(artifactAiReviewChange(response({ status: 'UNCERTAIN', previousReport: report,
      previousGeneratedAt: '2026-10-13T14:55:20Z', sourceVerifiedAt: null }), field)).not.toBeNull();
  });
  it('retains a legitimate successful cache reuse receipt even if a later rerun fails', () => {
    expect(artifactAiReviewChange(response({ status: 'UNCERTAIN', previousReport: report,
      previousGeneratedAt: '2026-10-13T14:55:20Z', sourceVerifiedAt: '2026-10-13T19:00:00Z' }), field)).toBeNull();
  });
  it('keeps a report outdated when the PDF changed after input capture but before completion', () => {
    expect(artifactAiReviewChange(response({ status: 'COMPLETED', report,
      generatedAt: '2026-10-13T19:00:00Z', sourceVerifiedAt: '2026-10-13T18:00:00Z' }), field)).not.toBeNull();
  });
});
