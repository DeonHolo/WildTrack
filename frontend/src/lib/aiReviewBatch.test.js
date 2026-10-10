import { describe, expect, it } from 'vitest';
import { aiBatchGroups, aiBatchSelection } from './aiReviewBatch.js';

const entry = (key, category = 'MISSING', extra = {}) => ({ preview: { key, category, outdated: false, ...extra } });
describe('verified AI batch selection', () => {
  it('counts shared contents once while preserving every selected PDF submission', () => {
    const entries = [entry('team-a:srs:pdf:hash'), entry('team-a:srs:pdf:hash'), entry('team-b:srs:pdf:hash'), entry('team-a:sdd:pdf:hash')];
    expect(aiBatchSelection({ entries }, 'ATTENTION', true)).toMatchObject({ unique: 3, artifacts: 4 });
  });
  it('excludes successful no-issues results by default and keeps issues, failed and inconclusive reviews', () => {
    const entries = ['CLEAN', 'ISSUES', 'FAILED', 'INCONCLUSIVE', 'MISSING'].map(category => entry(category, category));
    expect(aiBatchGroups(entries).map(g => g[0].preview.category)).toEqual(['ISSUES', 'FAILED', 'INCONCLUSIVE', 'MISSING']);
    expect(aiBatchSelection({ entries }, 'ALL', true).unique).toBe(5);
  });
  it('does not count an unverifiable PDF as a verified unique document', () => {
    expect(aiBatchSelection({ entries: [entry('known'), { preview: null, error: 'Drive failed' }] }, 'ALL', true))
      .toMatchObject({ unique: 1, artifacts: 1 });
  });
  it('counts one uncertain retry for shared PDFs and lets staff exclude updated files', () => {
    const entries = [entry('shared', 'FAILED', { retryToken: 'token', outdated: true }), entry('shared', 'FAILED', { retryToken: 'token', outdated: true }), entry('new')];
    expect(aiBatchSelection({ entries }, 'ATTENTION', true)).toMatchObject({ unique: 2, retries: 1, updated: 1 });
    expect(aiBatchSelection({ entries }, 'ATTENTION', false)).toMatchObject({ unique: 1, retries: 0, updated: 0 });
  });
});
