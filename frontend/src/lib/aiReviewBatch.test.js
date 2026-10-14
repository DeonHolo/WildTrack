import { describe, expect, it } from 'vitest';
import { aiBatchGroups, aiBatchSelection, aiBatchUpdatedDocuments } from './aiReviewBatch.js';


describe('latest affected PDF display', () => {
  const fileEntry = (key, sourceUrl, modifiedAt, overrides = {}) => ({
    target: { responseId: key, fieldId: 'pdf' }, checkedAt: modifiedAt,
    preview: { key, category: 'ISSUES', outdated: true, sourceUrl, modifiedAt,
      deliverableTitle: 'SRS', artifactLabel: 'Main PDF', studentName: 'Same student', ...overrides }
  });

  it('shows one latest file record for equivalent Drive links while preserving every review scope', () => {
    const entries = [
      fileEntry('old-context', 'https://drive.google.com/file/d/shared-pdf/view', '2026-10-10T10:00:00Z'),
      fileEntry('new-context', 'https://drive.google.com/open?id=shared-pdf', '2026-10-14T10:00:00Z', { artifactLabel: 'Appendix PDF' }),
      fileEntry('new-context', 'https://drive.google.com/uc?ID=shared-pdf', '2026-10-14T10:00:00Z')
    ];
    const documents = aiBatchUpdatedDocuments(entries);
    expect(documents).toHaveLength(1);
    expect(documents[0].latest.preview).toMatchObject({ artifactLabel: 'Appendix PDF', modifiedAt: '2026-10-14T10:00:00Z' });
    expect(documents[0].entries).toHaveLength(3);
    expect([...documents[0].reviewKeys]).toEqual(['old-context', 'new-context']);
    expect(aiBatchSelection({ entries }, 'ATTENTION', true)).toMatchObject({ unique: 2, artifacts: 3, updated: 2 });
  });

  it('does not merge separate files just because student and deliverable labels match', () => {
    expect(aiBatchUpdatedDocuments([
      fileEntry('one', 'https://drive.google.com/file/d/file-one/view', '2026-10-13T10:00:00Z'),
      fileEntry('two', 'https://drive.google.com/file/d/file-two/view', '2026-10-14T10:00:00Z')
    ]).map(document => document.key)).toEqual(['drive:file-two', 'drive:file-one']);
  });

  it('keeps unrecognized links separate and sorts valid latest records before missing dates', () => {
    const entries = [
      fileEntry('unknown-one', 'invalid', 'bad-date'),
      fileEntry('unknown-two', '', null),
      fileEntry('known', 'https://drive.google.com/file/d/current-pdf/view', '2026-10-14T10:00:00Z')
    ];
    const documents = aiBatchUpdatedDocuments(entries);
    expect(documents).toHaveLength(3);
    expect(documents[0].key).toBe('drive:current-pdf');
    expect(new Set(documents.map(document => document.key)).size).toBe(3);
  });

  it('does not mark a current copy outdated when it shares a review key with a changed file', () => {
    const entries = [
      fileEntry('shared-key', 'https://drive.google.com/file/d/changed-copy/view', '2026-10-14T10:00:00Z'),
      fileEntry('shared-key', 'https://drive.google.com/file/d/current-copy/view', '2026-10-14T10:00:00Z', { outdated: false })
    ];
    expect(aiBatchUpdatedDocuments(entries).map(document => document.key)).toEqual(['drive:changed-copy']);
    expect(aiBatchSelection({ entries }, 'ALL', true)).toMatchObject({ unique: 1, artifacts: 2 });
  });

  it('uses the latest check when Drive edit times tie and excludes unaffected files', () => {
    const older = fileEntry('older', 'https://drive.google.com/file/d/shared-pdf/view', '2026-10-10T10:00:00Z');
    const newer = { ...fileEntry('newer', 'https://drive.google.com/open?id=shared-pdf', older.preview.modifiedAt), checkedAt: '2026-10-14T11:00:00Z' };
    const unaffected = fileEntry('clean', 'https://drive.google.com/file/d/clean-pdf/view', '2026-10-14T12:00:00Z', { outdated: false });
    const documents = aiBatchUpdatedDocuments([older, newer, unaffected]);
    expect(documents).toHaveLength(1);
    expect(documents[0].latest).toBe(newer);
    expect(aiBatchSelection({ entries: [older, newer, unaffected] }, 'ALL', false).unique).toBe(1);
  });
});

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
