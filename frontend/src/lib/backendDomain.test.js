import { describe, expect, it } from 'vitest';
import { applySubmissionProgress } from './backendDomain.js';

describe('applySubmissionProgress', () => {
  it('overlays submitted forms onto imported tracker values without Google writeback', () => {
    const students = [
      { rowKey: 'row-1', studentNumber: '2026-001', milestones: { MVP: '' } },
      { rowKey: 'row-2', studentNumber: '2026-002', milestones: { MVP: '' } }
    ];
    const deliverables = [{ id: 'deliverable-1', trackerColumn: 'MVP', dueAt: '2026-09-12T23:59:00+08:00' }];
    const responses = [{
      deliverableId: 'deliverable-1',
      studentNumber: '2026-001',
      submittedAt: '2026-09-13T00:01:00+08:00'
    }];

    const result = applySubmissionProgress(students, deliverables, responses);

    expect(result[0].milestones.MVP).toBe(1);
    expect(result[1].milestones.MVP).toBe('');
  });

  it('shows zero for an on-time submission even when the imported cell is blank', () => {
    const result = applySubmissionProgress(
      [{ rowKey: 'row-1', studentNumber: '2026-001', milestones: { SRS: '' } }],
      [{ id: 'deliverable-1', trackerColumn: 'SRS', dueAt: '2026-09-19T23:59:00+08:00' }],
      [{ deliverableId: 'deliverable-1', studentNumber: '2026-001', submittedAt: '2026-09-18T10:00:00+08:00' }]
    );

    expect(result[0].milestones.SRS).toBe(0);
  });
});
