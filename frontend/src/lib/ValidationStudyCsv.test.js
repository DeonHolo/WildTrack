import { describe, expect, it } from 'vitest';
import { buildInitialSavedRecordCsv } from './ValidationStudyCsv.js';

describe('Initial saved record CSV export', () => {
  it('exports scoped records with status reasons and spreadsheet-safe untrusted labels', () => {
    const csv = buildInitialSavedRecordCsv({
      initialSavedRecords: {
        scope: 'INITIAL_SAVED_RECORD_SYSTEM_AUDIT_V1', workspaceId: 'workspace-1', deliverableId: 'deliverable-1',
        evaluatedAt: '2026-09-20T01:00:00Z', selectionRule: 'selected', candidates: 0, selectedRecords: 0,
        passedRecords: 0, failedRecords: 0, unverifiedRecords: 0, outcome: 'INCONCLUSIVE', agreement: null,
        limitations: ['No consent proof'], records: [{
          responseId: 'r1', studentNumber: '=1+1', studentName: ' +Danger', teamCode: '@team',
          originalSource: 'UNVERIFIED', originalArtifactValue: '-link', rosterStudentName: 'Roster',
          studentDetails: { status: 'FAIL', reason: 'missing details' }, workspace: { status: 'UNVERIFIED', reason: 'unknown' },
          deliverable: { status: 'PASS', reason: '' }, originalVersion: { status: 'UNVERIFIED', reason: 'no history' },
          storedValues: { status: 'PASS', reason: '' }, accountBinding: { status: 'UNVERIFIED', reason: 'not captured' },
          requiredFieldsChecked: ['studentNumber'], missingRequiredFieldKeys: ['name'], overallStatus: 'UNVERIFIED'
        }]
      }
    });
    expect(csv).toContain('scope,workspaceId,deliverableId');
    expect(csv).toContain('INITIAL_SAVED_RECORD_SYSTEM_AUDIT_V1');
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("' +Danger");
    expect(csv).toContain("'@team");
    expect(csv).toContain("'-link");
    expect(csv).toContain('missing details');
    expect(csv).toContain('UNVERIFIED');
    expect(csv).not.toContain('googleSubject');
    expect(csv).not.toContain('email');
  });
});
