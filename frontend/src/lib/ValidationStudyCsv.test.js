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

  it('keeps every row aligned with headers and uses persisted record aliases', () => {
    const csv = buildInitialSavedRecordCsv({
      initialSavedRecords: {
        scope: 'INITIAL_SAVED_RECORD_SYSTEM_AUDIT_V1', workspaceId: 'workspace-1', deliverableId: 'deliverable-1',
        evaluatedAt: '2026-09-20T01:00:00Z', selectionRule: 'selected', candidates: 2, selectedRecords: 2,
        passedRecords: 0, failedRecords: 1, unverifiedRecords: 1, outcome: 'INCONCLUSIVE', agreement: null,
        limitations: ['limits, include quoted text'], records: [
          {
            responseId: 'r-fail', studentNumber: '26-001', studentName: 'Persisted Name', teamCode: 'T-1',
            originalRevision: 1, originalSource: 'CURRENT_REVISION_1', originalArtifactValue: null,
            studentDetails: { status: 'FAIL', reason: 'identity mismatch, persisted' }, workspace: { status: 'PASS', reason: 'ok' },
            deliverable: { status: 'PASS', reason: 'ok' }, originalVersion: { status: 'PASS', reason: 'available' },
            storedValues: { status: 'FAIL', reason: 'missing field, legacy row' }, accountBinding: { status: 'FAIL', reason: 'binding conflict, authoritative' },
            requiredFieldsChecked: ['studentNumber'], missingRequiredFieldKeys: ['documentPdf'], overallStatus: 'FAIL'
          },
          {
            responseId: 'r-unknown', studentNumber: null, studentName: null, teamCode: null,
            originalRevision: null, originalSource: 'UNVERIFIED', originalArtifactValue: null,
            studentDetails: { status: 'UNVERIFIED', reason: 'no roster' }, workspace: { status: 'UNVERIFIED', reason: 'unknown' },
            deliverable: { status: 'PASS', reason: '' }, originalVersion: { status: 'UNVERIFIED', reason: 'no history' },
            storedValues: { status: 'UNVERIFIED', reason: 'no original, unresolved' }, accountBinding: { status: 'UNVERIFIED', reason: 'not captured' },
            requiredFieldsChecked: [], missingRequiredFieldKeys: [], overallStatus: 'UNVERIFIED'
          }
        ]
      }
    });
    const rows = csv.trimEnd().split('\r\n').map(parseCsvLine);
    const headers = rows[0];
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveLength(headers.length);
    expect(rows[2]).toHaveLength(headers.length);
    const first = Object.fromEntries(headers.map((header, index) => [header, rows[1][index]]));
    const second = Object.fromEntries(headers.map((header, index) => [header, rows[2][index]]));
    expect(first.originalVersion).toBe('1');
    expect(first.storedStudentNumber).toBe('26-001');
    expect(first.storedStudentName).toBe('Persisted Name');
    expect(first.storedTeamCode).toBe('T-1');
    expect(first.accountBindingStatus).toBe('FAIL');
    expect(first.overallStatus).toBe('FAIL');
    expect(first.LIMITS_PROOF_SCOPE).toContain('limits, include quoted text');
    expect(second.originalVersion).toBe('');
    expect(second.storedStudentNumber).toBe('');
    expect(second.accountBindingStatus).toBe('UNVERIFIED');
    expect(second.overallStatus).toBe('UNVERIFIED');
  });
});

function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else cell += character;
  }
  cells.push(cell);
  return cells;
}
