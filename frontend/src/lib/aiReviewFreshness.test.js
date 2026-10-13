import { describe, expect, it } from 'vitest';
import { artifactAiReportForDisplay, artifactAiReviewChange, artifactAiReviewStatus, isArtifactAiReviewCurrent } from './workflow.js';

const field = { id: 'pdf', definitionId: 'pdf-field', aiReviewEnabled: true };
const url = 'https://drive.google.com/file/d/pdf/view';
const report = { outcome: 'ISSUES_IDENTIFIED', findings: [{ issue: 'An observed issue' }] };
const change = { changeType: 'CONTENT_CHANGED', firstObservedAt: '2026-10-13T16:20:29.869589',
  driveModifiedTime: '2026-10-13T16:07:03.930Z' };
function response(observations = [change]) {
  return { values: { pdf: url }, artifactAiReviews: { 'pdf-field': {
    status: 'COMPLETED', report, generatedAt: '2026-10-13T14:55:20Z', sourceUrl: url
  } }, observedFileHistoryByField: { 'pdf-field': { observations } } };
}
describe('AI Review freshness from recorded Document Check evidence', () => {
  it('marks a same-link change outdated while retaining its saved report for viewing', () => {
    const saved = response();
    expect(isArtifactAiReviewCurrent(saved, field)).toBe(false);
    expect(artifactAiReviewStatus(saved, field)).toBe('Outdated');
    expect(artifactAiReportForDisplay(saved, field)).toBe(report);
    expect(artifactAiReviewChange(saved, field)?.changeType).toBe('CONTENT_CHANGED');
  });
  it('does not invalidate a review when the same bytes are merely rechecked later', () => {
    const saved = response([{ ...change, driveModifiedTime: '2026-10-10T16:00:00Z',
      firstObservedAt: '2026-10-10T16:20:00', lastObservedAt: '2026-10-14T02:00:00' }]);
    expect(isArtifactAiReviewCurrent(saved, field)).toBe(true);
  });
  it('does not invalidate a review made after the edit but before the scheduled check detects it', () => {
    const saved = response();
    saved.artifactAiReviews['pdf-field'].generatedAt = '2026-10-13T16:10:00Z';
    expect(isArtifactAiReviewCurrent(saved, field)).toBe(true);
  });
  it('uses the UTC detection time when Drive does not supply an edit time', () => {
    expect(artifactAiReviewChange(response([{ ...change, driveModifiedTime: null }]), field)).not.toBeNull();
  });
  it('clears the warning after explicit verification reuses an identical restored PDF', () => {
    const saved = response();
    saved.artifactAiReviews['pdf-field'].sourceVerifiedAt = '2026-10-13T16:30:00Z';
    expect(isArtifactAiReviewCurrent(saved, field)).toBe(true);
    expect(saved.artifactAiReviews['pdf-field'].generatedAt).toBe('2026-10-13T14:55:20Z');
  });
  it('warns if content changes while AI is running, even when the report is saved after the edit', () => {
    const saved = response();
    saved.artifactAiReviews['pdf-field'].sourceVerifiedAt = '2026-10-13T16:00:00Z';
    saved.artifactAiReviews['pdf-field'].generatedAt = '2026-10-13T16:10:00Z';
    expect(isArtifactAiReviewCurrent(saved, field)).toBe(false);
  });
  it('ignores metadata-only changes and changes to a different artifact', () => {
    expect(isArtifactAiReviewCurrent(response([{ ...change, changeType: 'METADATA_CHANGED' }]), field)).toBe(true);
    const saved = response();
    saved.observedFileHistoryByField = { 'other-field': { observations: [change] } };
    expect(isArtifactAiReviewCurrent(saved, field)).toBe(true);
  });
  it('does not display an unrelated old report after the submitted source URL changes', () => {
    const saved = response();
    saved.values.pdf = 'https://drive.google.com/file/d/another-pdf/view';
    expect(artifactAiReportForDisplay(saved, field)).toBeNull();
  });
});
