import { describe, expect, it, vi } from 'vitest';
import {
  findOwnedResponse,
  getResponseOwnerKey,
  hasResponseConflict,
  importPublicSheetSource,
  loadWorkflowState,
  resetWorkflowState,
  saveWorkflowState,
  upsertDeliverable
} from './workflow.js';

const responses = [
  {
    id: 'response-1',
    deliverableId: 'deliverable-srs',
    studentNumber: '22-1001-001',
    googleEmailSnapshot: 'owner@gmail.com'
  },
  {
    id: 'response-legacy',
    deliverableId: 'deliverable-srs',
    studentNumber: '22-1001-001'
  }
];

describe('Google-attributed response ownership', () => {
  it('matches an owned response by normalized Google email', () => {
    expect(getResponseOwnerKey(responses[0])).toBe('email:owner@gmail.com');
    expect(findOwnedResponse(responses, {
      deliverableId: 'deliverable-srs',
      studentNumber: '22-1001-001',
      googleEmail: 'OWNER@GMAIL.COM'
    })?.id).toBe('response-1');
  });

  it('does not expose another account or an unowned legacy response', () => {
    expect(findOwnedResponse(responses, {
      deliverableId: 'deliverable-srs',
      studentNumber: '22-1001-001',
      googleEmail: 'different@gmail.com'
    })).toBeNull();
    expect(findOwnedResponse(responses, {
      deliverableId: 'deliverable-srs',
      studentNumber: '22-1001-001'
    })).toBeNull();
  });

  it('recognizes when the same student and deliverable belong to another response owner', () => {
    expect(hasResponseConflict(responses, {
      deliverableId: 'deliverable-srs',
      studentNumber: '22-1001-001',
      googleEmail: 'different@gmail.com'
    })).toBe(true);
    expect(hasResponseConflict(responses, {
      deliverableId: 'deliverable-srs',
      studentNumber: '22-1001-001',
      googleEmail: 'owner@gmail.com'
    })).toBe(false);
  });
});

describe('published form identity', () => {
  it('updates the existing deliverable without changing its id or public slug', () => {
    const current = [{
      id: 'deliverable-srs',
      slug: 'week-9-srs',
      trackerColumn: 'SRS',
      title: 'SRS Submission',
      status: 'Published'
    }];

    const next = upsertDeliverable(current, {
      trackerColumn: 'SRS',
      title: 'Software Requirements Specification',
      status: 'Published'
    });

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: 'deliverable-srs',
      slug: 'week-9-srs',
      title: 'Software Requirements Specification'
    });
  });

  it('prevents duplicate deliverables even when a conflicting id is supplied', () => {
    const current = [
      { id: 'deliverable-srs', trackerColumn: 'SRS', slug: 'week-9-srs', title: 'SRS' },
      { id: 'deliverable-sdd', trackerColumn: 'SDD', slug: 'week-10-sdd', title: 'SDD' }
    ];

    const next = upsertDeliverable(current, {
      id: 'deliverable-sdd',
      trackerColumn: 'SRS',
      title: 'Updated SRS'
    });

    expect(next).toHaveLength(2);
    expect(next.filter((item) => item.trackerColumn === 'SRS')).toHaveLength(1);
    expect(next.find((item) => item.trackerColumn === 'SRS')).toMatchObject({
      id: 'deliverable-srs',
      slug: 'week-9-srs',
      title: 'Updated SRS'
    });
  });
});

describe('workspace Sheet imports', () => {
  const current = { students: [], projectMetadata: [], groups: [] };
  const sheetUrl = 'https://docs.google.com/spreadsheets/d/sheet-id/edit';

  it('uses editable field mappings instead of fixed column positions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => [
        'Identifier,Person,Squad,Order,Email Address',
        '23-1000-001,DOE JANE,IT-01,1,jane@cit.edu'
      ].join('\n')
    }));

    const result = await importPublicSheetSource('teamFormation', {
      sheetUrl,
      mappingOverrides: {
        studentNumber: 'Identifier',
        studentName: 'Person',
        teamCode: 'Squad',
        memberNumber: 'Order',
        email: 'Email Address'
      }
    }, current);

    expect(result.ok).toBe(true);
    expect(result.students[0]).toMatchObject({
      studentNumber: '23-1000-001',
      name: 'DOE JANE',
      teamCode: 'IT-01',
      memberNumber: 1
    });
    expect(result.importSummary.mappings.find((item) => item.key === 'teamCode')?.sourceColumn).toBe('Squad');
  });

  it('blocks a source when required fields are still unmapped', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => [
        'Unrelated,Columns',
        'Value,Another'
      ].join('\n')
    }));

    const result = await importPublicSheetSource('teamFormation', { sheetUrl }, current);

    expect(result.ok).toBe(false);
    expect(result.importSummary.resultStatus).toBe('Import blocked');
    expect(result.importSummary.missingFields).toEqual(expect.arrayContaining([
      'Student Number',
      'Student Name',
      'Team Code'
    ]));
  });
  it('reports skipped tracker deadline rows and chronological form suggestions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => [
        'NAME OF STUDENT,TEAM FORMATION,MEMBER#,SRS,SDD',
        'DOE JANE,IT-01,1,0,2',
        ',,,4/18/2026 23:59:59,4/25/2026 23:59:59'
      ].join('\n')
    }));

    const result = await importPublicSheetSource('tracker', { sheetUrl }, current);

    expect(result.ok).toBe(true);
    expect(result.importSummary.deadlineRows).toHaveLength(1);
    expect(result.importSummary.skippedRows[0].reason).toMatch(/Deadline row/);
    expect(result.suggestedForms.map((item) => item.trackerColumn)).toEqual(['SRS', 'SDD']);
    expect(Date.parse(result.suggestedForms[0].dueAt)).toBeLessThan(Date.parse(result.suggestedForms[1].dueAt));
  });
});

describe('workspace data isolation', () => {
  it('migrates workspace data from the retired browser-storage namespace', () => {
    localStorage.clear();
    const workspaceId = 'workspace-it-test';
    const previousBrand = ['cap', 'vault'].join('');
    const previousKey = `${previousBrand}.v2.workspace.${workspaceId}`;
    localStorage.setItem(previousKey, JSON.stringify({ workspaceId, marker: 'Imported records' }));

    const loaded = loadWorkflowState(workspaceId, {
      id: workspaceId,
      name: 'IT Test',
      program: 'IT',
      courseCode: 'IT332'
    });

    expect(loaded.marker).toBe('Imported records');
    expect(localStorage.getItem(`wildtrack.v2.workspace.${workspaceId}`)).toContain('Imported records');
    expect(localStorage.getItem(previousKey)).toBeNull();
  });

  it('resets only the selected workspace and preserves another workspace state', () => {
    localStorage.clear();
    saveWorkflowState({ workspaceId: 'workspace-it-test', marker: 'IT imported data' }, 'workspace-it-test');
    saveWorkflowState({ workspaceId: 'workspace-cs-test', marker: 'CS imported data' }, 'workspace-cs-test');

    resetWorkflowState('workspace-it-test', {
      id: 'workspace-it-test',
      name: 'IT Test',
      program: 'IT',
      courseCode: 'IT332'
    });

    expect(loadWorkflowState('workspace-cs-test', {
      id: 'workspace-cs-test',
      name: 'CS Test',
      program: 'CS',
      courseCode: 'CS342'
    }).marker).toBe('CS imported data');
    expect(loadWorkflowState('workspace-it-test', {
      id: 'workspace-it-test',
      name: 'IT Test',
      program: 'IT',
      courseCode: 'IT332'
    }).marker).toBeUndefined();
  });
});
