import { describe, expect, it, vi } from 'vitest';
import {
  dedupeDeliverables,
  findOwnedResponse,
  getResponseOwnerKey,
  hasResponseConflict,
  importPublicSheetSource,
  loadWorkflowState,
  mergeDeliverables,
  resetWorkflowState,
  saveWorkflowState,
  sortDeliverables,
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

describe('deliverable identity dedupe', () => {
  const trackerColumns = [
    { id: 'column-prob', key: 'ProbExploration', label: 'Problem Exploration', sourceColumn: 'ProbExploration', active: true },
    { id: 'column-srs', key: 'SRS', label: 'SRS', sourceColumn: 'SRS', active: true },
    { id: 'column-sdd', key: 'SDD', label: 'SDD', sourceColumn: 'SDD', active: true }
  ];

  const clientProb = {
    id: 'deliv-generated-1780000000000',
    slug: 'probexploration-submission',
    trackerColumn: 'ProbExploration',
    title: 'ProbExploration Submission',
    shortTitle: 'ProbExploration',
    status: 'Published',
    instructions: 'Submit the problem exploration as a PDF Drive file.'
  };

  const backendProb = {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'probexploration',
    trackerColumn: 'ProbExploration',
    title: 'Problem Exploration',
    shortTitle: 'ProbExploration',
    status: 'Published',
    instructions: ''
  };

  it('collapses duplicate columns to the backend record when loading saved state', () => {
    localStorage.clear();
    const workspaceId = 'workspace-dedupe';
    const workspace = { id: workspaceId, name: 'IT Dedupe', program: 'IT', courseCode: 'IT332' };
    saveWorkflowState({
      workspaceId,
      trackerColumns,
      deliverables: [clientProb, backendProb, { ...clientProb, id: 'deliv-generated-1780000000001' }]
    }, workspaceId);

    const loaded = loadWorkflowState(workspaceId, workspace);

    expect(loaded.deliverables).toHaveLength(1);
    expect(loaded.deliverables[0]).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'probexploration',
      title: 'Problem Exploration',
      trackerColumn: 'ProbExploration'
    });
    expect(loaded.deliverables[0].instructions).toBe('Submit the problem exploration as a PDF Drive file.');
  });

  it('collapses pre-existing duplicates instead of appending when merging a backend snapshot', () => {
    const existing = [
      clientProb,
      { ...clientProb, id: 'deliv-generated-1780000000002' },
      { id: 'deliv-srs-001', slug: 'week-9-srs', trackerColumn: 'SRS', title: 'Week 9: Software Requirements Specification (Due Apr 18)' }
    ];
    const backend = [
      backendProb,
      { id: '22222222-2222-4222-8222-222222222222', slug: 'srs', trackerColumn: 'SRS', title: 'SRS Submission' }
    ];

    const merged = mergeDeliverables(existing, backend);

    expect(merged).toHaveLength(2);
    expect(merged.map((item) => item.trackerColumn)).toEqual(['ProbExploration', 'SRS']);
    expect(merged.find((item) => item.trackerColumn === 'SRS')).toMatchObject({
      id: '22222222-2222-4222-8222-222222222222',
      slug: 'srs',
      title: 'SRS Submission'
    });
  });

  it('dedupes by slug when a tracker column is missing and keeps unrelated entries', () => {
    const deduped = dedupeDeliverables([
      { id: 'local-1', slug: 'legacy-form', title: 'Legacy form' },
      { id: '33333333-3333-4333-8333-333333333333', slug: 'legacy-form', title: 'Legacy Form (server)' },
      { id: 'local-2', slug: 'other-form', title: 'Other form' }
    ]);

    expect(deduped).toHaveLength(2);
    expect(deduped[0]).toMatchObject({ id: '33333333-3333-4333-8333-333333333333', title: 'Legacy Form (server)' });
    expect(deduped[1]).toMatchObject({ id: 'local-2' });
  });

  it('sorts deduped deliverables in tracker-column order', () => {
    const sorted = sortDeliverables({ trackerColumns }, [
      { id: 'deliv-sdd', slug: 'sdd', trackerColumn: 'SDD', title: 'SDD' },
      backendProb,
      { id: 'deliv-srs', slug: 'srs', trackerColumn: 'SRS', title: 'SRS' },
      clientProb,
      { id: 'deliv-srs-dup', slug: 'srs-submission', trackerColumn: 'SRS', title: 'SRS duplicate' }
    ]);

    expect(sorted.map((item) => item.trackerColumn)).toEqual(['ProbExploration', 'SRS', 'SDD']);
    expect(sorted[0].id).toBe('11111111-1111-4111-8111-111111111111');
  });
});
