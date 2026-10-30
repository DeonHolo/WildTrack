import { describe, expect, it } from 'vitest';
import { aggregateAiStatus, aggregateDocumentStatus, resolveReviewDeliverable, sortReviewResponses } from './reviewTable.js';

const field = { id: 'pdf', definitionId: 'pdf', pdfRequired: true, aiReviewEnabled: true, documentCheckPolicy: 'MANUAL' };
const deliverable = { id: 'std', shortTitle: 'STD', fields: [field] };
const noCheckDeliverable = { id: 'proposal', shortTitle: 'Proposal', fields: [] };
const state = { students: [], deliverables: [deliverable, noCheckDeliverable] };
const url = 'https://example.test/submission.pdf';
const reviewed = { status: 'COMPLETED', sourceUrl: url, report: { outcome: 'ISSUES_IDENTIFIED', findings: [{ title: 'Missing test inputs' }] } };

function response(id, extra = {}) {
  return { id, deliverableId: deliverable.id, studentNumber: id, values: { pdf: url }, ...extra };
}

function sortIds(rows, column, direction = 'asc', rowState = state, fallback = deliverable) {
  return sortReviewResponses(rows, rowState, fallback, { column, direction }).map((row) => row.id);
}

describe('sortReviewResponses', () => {
  it('sorts the displayed roster name before submission fallbacks without changing the source rows', () => {
    const rows = Object.freeze([
      Object.freeze(response('z', { studentName: 'Zoe' })),
      Object.freeze(response('b', { studentName: 'Submission name' })),
      Object.freeze(response('c', { studentName: 'Cara' }))
    ]);
    const rowState = { ...state, students: [{ studentNumber: 'b', name: 'Amy' }] };
    expect(sortIds(rows, 'student', 'asc', rowState)).toEqual(['b', 'c', 'z']);
    expect(sortIds(rows, 'student', 'desc', rowState)).toEqual(['z', 'c', 'b']);
    expect(rows.map((row) => row.id)).toEqual(['z', 'b', 'c']);
  });

  it('sorts team numbers naturally, prefers roster teams, and leaves unassigned teams last both ways', () => {
    const rows = [response('10', { teamCode: 'Team 10' }), response('missing'), response('2', { teamCode: 'Team 2' }), response('1', { teamCode: 'Team 99' })];
    const rowState = { ...state, students: [{ studentNumber: '1', teamCode: 'Team 1' }] };
    expect(sortIds(rows, 'team', 'asc', rowState)).toEqual(['1', '2', '10', 'missing']);
    expect(sortIds(rows, 'team', 'desc', rowState)).toEqual(['10', '2', '1', 'missing']);
  });

  it('uses each row deliverable title and keeps unavailable deliverables last both ways', () => {
    const rows = [response('std'), response('unknown', { deliverableId: 'missing' }), response('proposal', { deliverableId: 'proposal' })];
    expect(sortIds(rows, 'deliverable', 'asc', state, null)).toEqual(['proposal', 'std', 'unknown']);
    expect(sortIds(rows, 'deliverable', 'desc', state, null)).toEqual(['std', 'proposal', 'unknown']);
    expect(resolveReviewDeliverable(rows[2], state, deliverable)).toBe(noCheckDeliverable);
    expect(resolveReviewDeliverable(rows[1], state, deliverable)).toBe(deliverable);
  });

  it('matches the visible activity timestamp and leaves invalid or missing dates last both ways', () => {
    const rows = [
      response('old', { submittedAt: '2026-01-01T00:00:00Z' }),
      response('missing'),
      response('updated', { submittedAt: '2025-01-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z' }),
      response('middle', { submittedAt: '2026-02-01T00:00:00Z' }),
      response('invalid', { submittedAt: '2026-04-01T00:00:00Z', updatedAt: 'invalid' })
    ];
    expect(sortIds(rows, 'submitted', 'asc')).toEqual(['old', 'middle', 'updated', 'invalid', 'missing']);
    expect(sortIds(rows, 'submitted', 'desc')).toEqual(['updated', 'middle', 'old', 'invalid', 'missing']);
  });

  it('breaks equal values by response id regardless of input order or selected direction', () => {
    const rows = [response('response-10', { teamCode: 'Team 1' }), response('response-2', { teamCode: 'Team 1' })];
    for (const direction of ['asc', 'desc']) {
      expect(sortIds(rows, 'team', direction)).toEqual(['response-2', 'response-10']);
      expect(sortIds([...rows].reverse(), 'team', direction)).toEqual(['response-2', 'response-10']);
    }
    const duplicateIds = [response('same', { studentName: 'First' }), response('same', { studentName: 'Second' })];
    expect(sortReviewResponses(duplicateIds, state, deliverable, { column: 'team', direction: 'asc' })).toEqual(duplicateIds);
  });

  it('leaves a missing displayed student last in either direction', () => {
    const rows = [response('missing', { studentNumber: '' }), response('named', { studentName: 'Example' })];
    expect(sortIds(rows, 'student')).toEqual(['named', 'missing']);
    expect(sortIds(rows, 'student', 'desc')).toEqual(['named', 'missing']);
  });

  it('sorts Document Check by the same aggregate status shown for each row deliverable', () => {
    const checked = { status: 'Current', checkedAt: '2026-01-01T00:00:00Z', sourceUrl: url };
    const rows = [
      response('unchecked'),
      response('attention', { artifactChecks: { pdf: { ...checked, submissionSubstance: { state: 'NEEDS_ATTENTION' } } } }),
      response('na', { deliverableId: noCheckDeliverable.id }),
      response('ready', { artifactChecks: { pdf: checked } }),
      response('outdated', { artifactChecks: { pdf: { ...checked, sourceUrl: 'https://example.test/old.pdf' } } })
    ];
    expect(sortIds(rows, 'documentCheck')).toEqual(['ready', 'attention', 'outdated', 'unchecked', 'na']);
    expect(sortIds(rows, 'documentCheck', 'desc')).toEqual(['na', 'unchecked', 'outdated', 'attention', 'ready']);
    expect(aggregateDocumentStatus(rows[2], resolveReviewDeliverable(rows[2], state, deliverable))).toBe('Not applicable');
  });

  it('preserves aggregate Document Check precedence across multiple PDF fields', () => {
    const otherField = { ...field, id: 'other', definitionId: 'other' };
    const row = response('multiple', {
      values: { pdf: url, other: url },
      artifactChecks: {
        pdf: { checkedAt: '2026-01-01T00:00:00Z', sourceUrl: 'https://example.test/old.pdf' },
        other: { checkedAt: '2026-01-01T00:00:00Z', sourceUrl: url, attentionRequired: true }
      }
    });
    expect(aggregateDocumentStatus(row, { ...deliverable, fields: [field, otherField] })).toBe('Needs attention');
  });

  it('sorts actual AI Review states while retaining limited coverage and manual-verification reports', () => {
    const rows = [
      response('unreviewed'),
      response('limited', { artifactAiReviews: { pdf: { ...reviewed, report: { outcome: 'INCONCLUSIVE' } } } }),
      response('retry', { artifactAiReviews: { pdf: { status: 'UNCERTAIN' } } }),
      response('reviewed', { artifactAiReviews: { pdf: reviewed } }),
      response('na', { deliverableId: noCheckDeliverable.id }),
      response('manual', { artifactAiReviews: { pdf: { ...reviewed, report: { outcome: 'INCONCLUSIVE', verificationNotes: [{ issue: 'Check the original diagram.' }] } } } }),
      response('running', { artifactAiReviews: { pdf: { status: 'RUNNING' } } }),
      response('outdated', {
        artifactAiReviews: { pdf: { ...reviewed, generatedAt: '2026-01-01T00:00:00Z' } },
        observedFileHistoryByField: { pdf: { observations: [{ changeType: 'CONTENT_CHANGED', driveModifiedTime: '2026-01-02T00:00:00Z' }] } }
      })
    ];
    const ascending = ['limited', 'manual', 'reviewed', 'retry', 'running', 'outdated', 'unreviewed', 'na'];
    expect(sortIds(rows, 'aiReview')).toEqual(ascending);
    expect(sortIds(rows, 'aiReview', 'desc')).toEqual(['na', 'unreviewed', 'outdated', 'running', 'retry', 'limited', 'manual', 'reviewed']);
    expect(aggregateAiStatus(rows[1], deliverable)).toBe('Needs attention');
    expect(aggregateAiStatus(rows[5], deliverable)).toBe('Needs attention');
  });

  it('sorts the actual decision labels and applies the Archived override before status', () => {
    const rows = [
      response('archived', { reviewStatus: 'Accepted', archiveStatus: 'Archived' }),
      response('accepted', { reviewStatus: 'Accepted' }),
      response('needs-review', { reviewStatus: 'Needs Review' }),
      response('received'),
      response('other', { primaryStatus: 'Late' })
    ];
    const ascending = ['received', 'needs-review', 'accepted', 'archived', 'other'];
    expect(sortIds(rows, 'decision')).toEqual(ascending);
    expect(sortIds(rows, 'decision', 'desc')).toEqual([...ascending].reverse());
  });
});
