import { describe, expect, it } from 'vitest';
import { buildValidationStudyCsv } from './ValidationStudyCsv.js';

describe('Validation Study CSV export', () => {
  it('exports current and historical evidence without Google subject or email fields', () => {
    const csv = buildValidationStudyCsv({
      trackerColumnKey: 'Refactored SRS',
      responses: [{
        responseId: 'response-1',
        studentNumber: '26-0001',
        studentName: 'Student, One',
        teamCode: 'TEAM-01',
        currentRevision: 2,
        submittedAt: '2026-09-19T01:00:00Z',
        updatedAt: '2026-09-19T01:05:00Z',
        validationStepValue: 'Revised submission',
        artifactValue: 'https://drive.google.com/file/d/stable/view',
        googleSubject: 'must-not-export',
        googleEmail: 'secret@example.test',
        checks: {
          initialSubmissionSeen: true,
          initialArtifactPresent: true,
          revisedSubmissionCurrent: true,
          currentArtifactPresent: true,
          sameResponse: true,
          revisionIncreased: true,
          materialEditHistoryPresent: true,
          pdfUnchanged: true,
          nonDesignatedValuesPreserved: true,
          overallPass: true
        },
        history: [{
          revision: 1,
          createdAt: '2026-09-19T01:02:00Z',
          validationStepValue: 'Initial submission',
          artifactValue: 'https://drive.google.com/file/d/stable/view'
        }]
      }]
    });

    expect(csv).toContain('recordType,responseId,studentNumber');
    expect(csv).toContain('CURRENT,response-1,26-0001,"Student, One"');
    expect(csv).toContain('HISTORY,response-1,26-0001,"Student, One"');
    expect(csv).toContain('Initial submission');
    expect(csv).toContain('Revised submission');
    expect(csv).toContain('PASS');
    expect(csv).toContain('HISTORICAL_T1_T2_ONLY_NOT_CURRENT_GOAL_3');
    expect(csv).not.toContain('must-not-export');
    expect(csv).not.toContain('secret@example.test');
    expect(csv).not.toContain('googleSubject');
    expect(csv).not.toContain('googleEmail');
  });
});
