import { describe, expect, it } from 'vitest';
import { applySubmissionProgress, mapResponse, mapStudents } from './backendDomain.js';

describe('mapStudents', () => {
  it('uses the shared Student Record values after a local academic edit while retaining imported tracker progress', () => {
    const result = mapStudents([{
      id: 'student-1',
      studentNumber: '26-0001',
      studentName: 'Locally Edited Name',
      teamCode: 'LOCAL-TEAM',
      teamFormationCode: 'SOURCE-TEAM',
      memberNumber: '2',
      sectionName: 'G8',
      adviserName: 'Local Adviser',
      institutionalEmail: 'student@cit.edu'
    }], [{
      id: 'tracker-row-1',
      studentNumber: '26-0001',
      studentName: 'Old Imported Name',
      teamCode: 'SOURCE-TEAM',
      memberNumber: '1',
      sectionName: 'G7',
      adviserName: 'Old Adviser',
      cells: [{ columnKey: 'SRS', rawValue: '0' }]
    }]);

    expect(result[0]).toMatchObject({
      studentNumber: '26-0001',
      name: 'Locally Edited Name',
      teamCode: 'LOCAL-TEAM',
      teamFormationCode: 'SOURCE-TEAM',
      memberNumber: '2',
      section: 'G8',
      adviser: 'Local Adviser',
      milestones: { SRS: '0' }
    });
  });
});

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

  it('uses backend effective lateness instead of recomputing from initial submittedAt', () => {
    const result = applySubmissionProgress(
      [{ rowKey: 'row-1', studentNumber: '2026-001', milestones: { SRS: '' } }],
      [{ id: 'deliverable-1', trackerColumn: 'SRS', dueAt: '2026-09-19T23:59:00+08:00' }],
      [{
        deliverableId: 'deliverable-1', studentNumber: '2026-001', submittedAt: '2026-09-19T20:00:00+08:00',
        timing: { daysLate: 2, effectiveSubmittedAt: '2026-09-21T00:01:00+08:00', effectiveReason: 'Material artifact save' }
      }]
    );
    expect(result[0].milestones.SRS).toBe(2);
  });
});

describe('mapResponse', () => {
  it('preserves the shared backend timing evidence on the mapped response', () => {
    const timing = { effectiveSubmittedAt: '2026-09-20T00:01:00Z', effectiveReason: 'Material artifact save', daysLate: 1 };
    expect(mapResponse({ id: 'r1', valuesJson: '{}', submittedAt: '2026-09-19T00:00:00Z' }, timing).timing).toEqual(timing);
  });
});
