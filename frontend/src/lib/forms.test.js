import { describe, expect, it } from 'vitest';
import { buildDeliverableFormPayload, makeDeliverableFormDraft } from './forms.js';

const state = {
  trackerColumns: [
    { key: 'SRS', label: 'SRS', pdfRequired: true },
    { key: 'SourceCode', label: 'Source Code', pdfRequired: false }
  ]
};

describe('deliverable form domain', () => {
  it('creates a mapped draft due at 11:59 PM without assigning an identity early', () => {
    expect(makeDeliverableFormDraft(state, 'SRS', new Date(2026, 7, 19, 10, 0))).toMatchObject({
      id: '',
      slug: '',
      trackerColumn: 'SRS',
      title: 'SRS Submission',
      dueAt: '2026-08-19T23:59',
      pdfRequired: true
    });
  });

  it('builds the persisted submission fields and preserves an existing form identity', () => {
    expect(buildDeliverableFormPayload(state, {
      id: 'deliverable-srs',
      slug: 'week-9-srs',
      trackerColumn: 'SRS',
      title: 'Revised SRS',
      dueAt: '2026-08-19T23:59',
      pdfRequired: true
    })).toMatchObject({
      id: 'deliverable-srs',
      slug: 'week-9-srs',
      audience: 'Students',
      status: 'Published',
      dueAt: '2026-08-19T23:59:00+08:00',
      fields: [{ id: 'documentPdf', pdfRequired: true }]
    });
  });
});
