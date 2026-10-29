import { describe, expect, it } from 'vitest';
import { aiBatchSelection, failedAiBatchTargets } from './aiReviewBatch.js';

describe('batch selection', () => {
  const restricted = 'The submitted Drive PDF could not be opened. Google Drive reported a file-access or download restriction.';
  const row = (id, category, extra = {}) => ({ target: { responseId: id, fieldId: 'pdf' }, selected: true, phase: 'DONE', preview: { key: id, category }, ...extra });
  it('separates attention, failed, manual, and all review categories', () => {
    const plan = { entries: [row('new', 'NEW'), row('issue', 'ISSUES'), row('failed', 'FAILED'), row('uncertain', 'UNCERTAIN'), row('manual', 'INCONCLUSIVE'), row('clean', 'CLEAN')] };
    expect(aiBatchSelection(plan, 'ATTENTION', true).unique).toBe(4);
    expect(aiBatchSelection(plan, 'FAILED', true).unique).toBe(2);
    expect(aiBatchSelection(plan, 'MANUAL', true).unique).toBe(1);
    expect(aiBatchSelection(plan, 'ALL', true).unique).toBe(6);
  });
  it('retries only selected completed technical failures, excluding access blocks and manual reviews', () => {
    const entries = [row('failed', 'FAILED', { resultStatus: 'FAILED', error: 'Provider failed' }), row('uncertain', 'UNCERTAIN', { resultStatus: 'UNCERTAIN' }), row('access', 'FAILED', { resultStatus: 'FAILED', noAiStarted: true, error: restricted }), row('manual', 'INCONCLUSIVE', { resultStatus: 'COMPLETED', error: 'Manual verification' }), row('pending', 'FAILED', { phase: 'PENDING', resultStatus: 'FAILED' }), row('unselected', 'FAILED', { selected: false, resultStatus: 'FAILED' })];
    expect(failedAiBatchTargets({ entries })).toEqual([{ responseId: 'failed', fieldId: 'pdf' }, { responseId: 'uncertain', fieldId: 'pdf' }]);
  });
  it('offers another precheck for a server retrieval failure without retrying sharing restrictions', () => {
    const entries = [row('server', 'FAILED', { phase: 'UNVERIFIED', selected: false,
      error: 'WildTrack could not retrieve the submitted PDF from Google Drive. No AI review was started.', noAiStarted: true }),
      row('access', 'FAILED', { phase: 'UNVERIFIED', selected: false, error: restricted, noAiStarted: true })];
    expect(failedAiBatchTargets({ entries })).toEqual([{ responseId: 'server', fieldId: 'pdf' }]);
  });
});
