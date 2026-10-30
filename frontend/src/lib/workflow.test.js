import { describe, expect, it, vi } from 'vitest';
import {
  activeSubmissionValues,
  isArtifactAiReviewCurrent,
  isInconclusiveAiReviewReport,
  aiReviewReportStatus,
  aiReviewReportSummary,
  aiReviewEvidenceCount,
  aiReviewAssessment,
  verifiedAiChecks,
  artifactAiReview,
  artifactAiReviewStatus,
  isArtifactDocumentCheckCurrent,
  artifactDocumentCheckStatus,
  submissionSubstanceStatus,
  documentCheckFlags,
  documentCheckSummary,
  statusTone,
  dedupeDeliverables,
  findOwnedResponse,
  getResponseOwnerKey,
  hasResponseConflict,
  mergeDeliverables,
  sortDeliverables,
  upsertDeliverable,
  validateSubmission,
  validateSubmissionIdentity
} from './workflow.js';
import { importPublicSheetSource } from './devPublicSheetImport.js';

describe('saved positive quotation failures', () => {
  const row = { id: 'T1', assessment: 'CHECK_MANUALLY', explanation: "Check Change history in the PDF (AI-cited page 2). The cited page contains visual content, but the quotation could not be matched to readable text. Gemini's unconfirmed observation: Versions, dates and descriptions are present." };
  it('reclassifies only the known backend wrapper without an AI rerun', () => {
    const report = { outcome: 'INCONCLUSIVE', coverage: { criteria: [row] } };
    expect(aiReviewAssessment(row).assessment).toBe('UNVERIFIED');
    expect(aiReviewAssessment(row).explanation).not.toContain('visual content');
    expect(aiReviewAssessment(row).explanation).toContain('Versions, dates and descriptions');
    expect(aiReviewReportStatus(report)).toBe('No issues');
    expect(aiReviewEvidenceCount(report)).toBe(0);
    expect(row.assessment).toBe('CHECK_MANUALLY');
  });
  it('retains model manual questions and any linked concern', () => {
    const manual = { ...row, explanation: 'Confirm whether version 3.2 has a date.' };
    expect(aiReviewAssessment(manual)).toBe(manual);
    const linked = { ...row, verificationNoteIndexes: [0] };
    expect(aiReviewAssessment(linked)).toBe(linked);
    const negative = { ...row, explanation: "Check Change history in the PDF. The proposed concern could not be confirmed from its cited evidence; it is not an established defect. Gemini's unconfirmed observation: A date is missing." };
    expect(aiReviewAssessment(negative)).toBe(negative);
  });
});

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

describe('instruction assessment evidence', () => {
  const positive = (id, quote) => ({ id, requirement: 'Describe project responsibilities.',
    source: 'OFFICIAL_TEMPLATE', assessment: 'APPEARS_ADDRESSED',
    explanation: 'Responsibilities are described.', documentEvidence: quote, location: { page: 4 } });
  it('uses the complete fixed checklist instead of requiring two arbitrary observations', () => {
    const report = { outcome: 'NO_ISSUES_IN_CHECKED_AREAS', verifiedChecks: [],
      coverage: { omittedCriteria: 0, criteria: [positive('T1', 'The manager assigns project responsibilities.')] } };
    expect(aiReviewEvidenceCount(report)).toBe(1);
    expect(isInconclusiveAiReviewReport(report)).toBe(false);
    report.coverage.criteria.push({ ...positive('T2', ''), assessment: 'NOT_APPLICABLE',
      explanation: 'External staffing does not apply to this student team.', location: null });
    expect(isInconclusiveAiReviewReport(report)).toBe(false);
    report.coverage.criteria[1].assessment = 'CHECK_MANUALLY';
    expect(isInconclusiveAiReviewReport(report)).toBe(true);
  });
  it('keeps incomplete fixed and single-observation historical reports inconclusive', () => {
    const report = { outcome: 'NO_ISSUES_IN_CHECKED_AREAS', verifiedChecks: [],
      coverage: { omittedCriteria: 0, criteria: [positive('T2', 'The manager assigns project responsibilities.')] } };
    expect(isInconclusiveAiReviewReport(report)).toBe(true);
    report.coverage.criteria[0].id = 'C1';
    expect(isInconclusiveAiReviewReport(report)).toBe(true);
  });
  it('counts independent new citations beyond the old global observation list', () => {
    const report = { outcome: 'NO_ISSUES_IN_CHECKED_AREAS', verifiedChecks: [],
      coverage: { criteria: Array.from({ length: 6 }, (_, index) => positive(`C${index + 1}`, `Distinct supported body passage ${index}.`)) } };
    expect(aiReviewEvidenceCount(report)).toBe(6);
    expect(isInconclusiveAiReviewReport(report)).toBe(false);
    report.coverage.criteria[5].documentEvidence = report.coverage.criteria[0].documentEvidence;
    expect(aiReviewEvidenceCount(report)).toBe(5);
  });
  it('keeps unresolved new assessments manual even with two positive observations', () => {
    const report = { outcome: 'NO_ISSUES_IN_CHECKED_AREAS',
      coverage: { criteria: [positive('C1', 'The project manager assigns documented responsibilities.'),
        positive('C2', 'The lead monitors the approved project schedule.'),
        { id: 'C3', requirement: 'Explain budget controls.', source: 'OFFICIAL_TEMPLATE', assessment: 'CHECK_MANUALLY' }] } };
    expect(aiReviewEvidenceCount(report)).toBe(2);
    expect(aiReviewReportStatus(report)).toBe('Needs attention');
  });
});

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

describe('artifact-scoped review currentness', () => {
  it('shows newly rerun legacy single-PDF feedback after the field-review map becomes nonempty', () => {
    const url = 'https://drive.google.com/file/d/legacy-shared-pdf/view';
    const legacy = { status: 'COMPLETED', sourceUrl: url,
      generatedAt: '2026-09-22T06:00:00Z', report: { summary: 'Updated AI Review.',
        verifiedChecks: [
          { aspect: 'Scope lists student users', source: 'DELIVERABLE_REQUIREMENTS',
            documentEvidence: 'Scope: Students submit project documentation.', requirement: 'Describe intended system users.' },
          { aspect: 'Functional requirement describes submission', source: 'OFFICIAL_TEMPLATE',
            documentEvidence: 'FR-01: Students submit their PDF link.', requirement: '3.2 Functional requirements' }
        ] } };
    const response = { deliverableId: 'deliverable-srs', values: { documentPdf: url },
      artifactAiReviews: { 'deliverable-srs:legacy': legacy }, aiReviewState: legacy };
    const field = { id: 'documentPdf', pdfRequired: true, aiReviewEnabled: true };
    expect(artifactAiReview(response, field)).toBe(legacy);
    expect(isArtifactAiReviewCurrent(response, field)).toBe(true);
    expect(artifactAiReviewStatus(response, field)).toBe('No issues');
  });
  it('keeps unchanged artifact reviews current when another artifact changes', () => {
    const first = { id: 'frameworkPdf', definitionId: 'field-framework', aiReviewEnabled: true };
    const second = { id: 'highlightsPdf', definitionId: 'field-highlights', aiReviewEnabled: true };
    const response = {
      values: {
        frameworkPdf: 'https://drive.google.com/file/d/framework-new/view',
        highlightsPdf: 'https://drive.google.com/file/d/highlights-stable/view'
      },
      artifactChecks: {
        'field-framework': { status: 'Completed', checkedAt: '2026-09-19T10:00:00Z', sourceUrl: 'https://drive.google.com/file/d/framework-old/view' },
        'field-highlights': { status: 'Completed', checkedAt: '2026-09-19T10:00:00Z', sourceUrl: 'https://drive.google.com/file/d/highlights-stable/view' }
      },
      artifactAiReviews: {
        'field-framework': { status: 'COMPLETED', generatedAt: '2026-09-19T10:00:00Z', sourceUrl: 'https://drive.google.com/file/d/framework-old/view', report: {} },
        'field-highlights': { status: 'COMPLETED', generatedAt: '2026-09-19T10:00:00Z', sourceUrl: 'https://drive.google.com/file/d/highlights-stable/view', report: {} }
      }
    };

    expect(isArtifactDocumentCheckCurrent(response, first)).toBe(false);
    expect(isArtifactDocumentCheckCurrent(response, second)).toBe(true);
    expect(isArtifactAiReviewCurrent(response, first)).toBe(false);
    expect(isArtifactAiReviewCurrent(response, second)).toBe(true);
  });
});

describe('Document Check submission-substance status tones', () => {
  it('renders the positive and inconclusive conclusions with meaningful tones', () => {
    expect(statusTone('Looks substantially filled')).toBe('success');
    expect(statusTone('Could not determine')).toBe('warning');
    expect(statusTone('Needs attention — Sparse Content')).toBe('warning');
    expect(statusTone('Inconclusive')).toBe('warning');
    expect(statusTone('Limited review coverage')).toBe('warning');
    expect(statusTone('Needs manual verification')).toBe('warning');
  });
});

describe('Sparse Content presentation of saved Document Checks', () => {
  it('groups a legacy extraction warning without mutating its saved flags or review readiness', () => {
    const sourceUrl = 'https://drive.google.com/file/d/saved-pdf/view';
    const report = { status: 'Current', sourceUrl, checkedAt: '2026-10-26T01:00:00Z', redFlags: ['Substance Inconclusive', 'Sparse Content'], summary: 'Original extraction warning.' };
    const response = { values: { pdf: sourceUrl }, artifactChecks: { pdf: report } };
    expect(submissionSubstanceStatus(report)).toBe('Needs attention — Sparse Content');
    expect(documentCheckFlags(report)).toEqual(['Sparse Content']);
    expect(artifactDocumentCheckStatus(response, { id: 'pdf', definitionId: 'pdf' })).toBe('Needs attention');
    expect(report.redFlags).toEqual(['Substance Inconclusive', 'Sparse Content']);
  });

  it('does not group template-like or provider-failure reports into Sparse Content', () => {
    const template = { submissionSubstance: { state: 'NEEDS_ATTENTION', reasonCode: 'TEMPLATE_LIKE' }, redFlags: ['Template-like'], summary: 'Template remains unfilled.' };
    const blocked = { resultStatus: 'BLOCKED', submissionSubstance: { state: 'COULD_NOT_DETERMINE' }, summary: 'Drive access failed.' };
    expect(submissionSubstanceStatus(template)).toBe('Needs attention');
    expect(documentCheckFlags(template)).toEqual(['Template-like']);
    expect(documentCheckSummary(template)).toBe(template.summary);
    expect(documentCheckSummary(blocked)).toBe(blocked.summary);
  });
});

describe('grounded positive AI review evidence', () => {
  const first = { aspect: 'Scope identifies the students', source: 'DELIVERABLE_REQUIREMENTS',
    documentEvidence: 'Scope: Capstone students submit their requirements.',
    requirement: 'Define the project scope and its intended users.' };
  const second = { aspect: 'Requirements have unique identifiers', source: 'DOCUMENT',
    documentEvidence: 'FR-01: Students submit a PDF link.', requirement: '' };

  it('accepts two distinct grounded observations as supporting a zero-issue result', () => {
    const report = { findings: [], missingRequiredSections: [], verifiedChecks: [first, second] };
    expect(verifiedAiChecks(report)).toHaveLength(2);
    expect(isInconclusiveAiReviewReport(report)).toBe(false);
  });

  it('keeps an empty or one-observation legacy completed result inconclusive', () => {
    expect(isInconclusiveAiReviewReport({ summary: 'All checks passed.' })).toBe(true);
    expect(isInconclusiveAiReviewReport({ findings: [], verifiedChecks: [first] })).toBe(true);
    expect(isInconclusiveAiReviewReport({ verifiedChecks: [first, { ...first, aspect: '  SCOPE IDENTIFIES THE STUDENTS  ' }] })).toBe(true);
    expect(isInconclusiveAiReviewReport({ verifiedChecks: [first, {
      ...first, aspect: 'Requirements document lists student users', source: 'OFFICIAL_TEMPLATE',
      requirement: '3.2 Functional requirements',
      documentEvidence: ' SCOPE: capstone students submit their REQUIREMENTS!'
    }] })).toBe(true);
    expect(isInconclusiveAiReviewReport({ verifiedChecks: [first, { ...second, documentEvidence: '' }] })).toBe(true);
  });

  it('keeps actionable findings actionable while exposing grounded positive observations', () => {
    const report = { findings: [{ source: 'DOCUMENT', issue: 'Missing citation', evidence: 'Page 4: No citation' }],
      verifiedChecks: [first] };
    expect(isInconclusiveAiReviewReport(report)).toBe(false);
    expect(verifiedAiChecks(report)).toEqual([first]);
  });

  it('separates limited recorded coverage from specific unresolved questions without changing the evidence gate', () => {
    const limited = { outcome: 'INCONCLUSIVE', findings: [], verifiedChecks: [first] };
    const manual = { outcome: 'INCONCLUSIVE', findings: [], verifiedChecks: [first, second],
      verificationNotes: [{ issue: 'Verify the original diagram.', evidence: 'Page 8' }] };
    expect(aiReviewReportStatus(limited)).toBe('Needs attention');
    expect(aiReviewReportStatus(manual)).toBe('Needs attention');
    expect(aiReviewReportSummary(limited)).toContain('left items to check');
    expect(aiReviewReportSummary(manual)).toContain('left items to check');
    expect(isInconclusiveAiReviewReport(limited)).toBe(true);
    expect(isInconclusiveAiReviewReport(manual)).toBe(true);
    expect(aiReviewReportStatus({ outcome: 'NO_ISSUES_IN_CHECKED_AREAS', verifiedChecks: [first, second] })).toBe('No issues');
    expect(aiReviewReportStatus({ outcome: 'ISSUES_IDENTIFIED', findings: [{ issue: 'A supported concern.' }],
      verificationNotes: manual.verificationNotes })).toBe('Needs attention');
    expect(aiReviewReportSummary({ outcome: 'ISSUES_IDENTIFIED', findings: [{ issue: 'A supported concern.' }],
      summary: 'A supported concern was found.' })).toBe('A supported concern was found.');
  });

  it.each([
    [{ outcome: 'INCONCLUSIVE', verifiedChecks: [first] }, 'Needs attention'],
    [{ outcome: 'INCONCLUSIVE', verificationNotes: [{ issue: 'Check the diagram.' }] }, 'Needs attention']
  ])('uses the completed assessment label for current artifact reports', (report, expected) => {
    const url = 'https://drive.google.com/file/d/current/view';
    const field = { id: 'pdf', definitionId: 'pdf', aiReviewEnabled: true };
    const response = { values: { pdf: url }, artifactAiReviews: { pdf: { status: 'COMPLETED', sourceUrl: url, report } } };
    expect(artifactAiReviewStatus(response, field)).toBe(expected);
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

describe('configurable form response validation', () => {
  const deliverable = {
    fields: [
      { id: 'identity', label: 'Student Number', type: 'academicStudentNumber', required: true, active: true },
      { id: 'summary', label: 'Summary', type: 'shortText', required: true, active: true },
      { id: 'scope', label: 'Scope', type: 'dropdown', required: true, active: true, options: [{ id: 'campus' }, { id: 'community' }] },
      { id: 'evidence', label: 'Evidence', type: 'checkboxes', required: true, active: true, options: [{ id: 'shot' }, { id: 'sheet' }] },
      { id: 'section', label: 'Section', type: 'academicSection', required: false, active: true },
      { id: 'retired', label: 'Old question', type: 'shortText', required: false, active: false }
    ]
  };

  it('accepts valid text and choice values while academic presentation stays outside response values', () => {
    expect(validateSubmission({ deliverable, values: {
      summary: 'Ready', scope: 'campus', evidence: ['shot', 'sheet']
    } })).toMatchObject({ ok: true, errors: {} });
  });

  it('rejects unknown single-choice IDs and malformed checkbox arrays', () => {
    expect(validateSubmission({ deliverable, values: {
      summary: 'Ready', scope: 'not-an-option', evidence: ['shot', 'shot']
    } })).toMatchObject({
      ok: false,
      errors: { scope: expect.any(String), evidence: expect.any(String) }
    });
  });

  it('keeps editable Section while filtering record-derived academic, retired, and unknown keys', () => {
    expect(activeSubmissionValues(deliverable, {
      identity: '22-1001', summary: 'Ready', scope: 'campus', evidence: ['shot'], section: 'G7', retired: 'old', injected: 'bad'
    })).toEqual({ summary: 'Ready', scope: 'campus', evidence: ['shot'], section: 'G7' });
  });

  it('requires Student Number but does not invent requirements for absent or optional academic presentation fields', () => {
    const identityDeliverable = {
      fields: [
        { id: 'number', type: 'academicStudentNumber', required: false, active: true },
        { id: 'section', type: 'academicSection', required: false, active: true }
      ]
    };
    expect(validateSubmissionIdentity({
      deliverable: identityDeliverable,
      identity: { studentNumber: '', studentName: '', teamCode: '' },
      student: null
    })).toEqual({ studentNumber: 'Choose a Student Number.' });
    expect(validateSubmissionIdentity({
      deliverable: identityDeliverable,
      identity: { studentNumber: '22-1001', studentName: '', teamCode: '' },
      student: { studentNumber: '22-1001', name: '', teamCode: '', section: '' }
    })).toEqual({});
  });

  it('checks record-derived academic fields against the roster and required Section against the submitted value', () => {
    const identityDeliverable = {
      fields: [
        { id: 'number', type: 'academicStudentNumber', required: true, active: true },
        { id: 'name', type: 'academicStudentName', required: true, active: true },
        { id: 'team', type: 'academicTeamCode', required: true, active: true },
        { id: 'section', type: 'academicSection', required: true, active: true },
        { id: 'retired-section', type: 'academicSection', required: true, active: false }
      ]
    };
    expect(validateSubmissionIdentity({
      deliverable: identityDeliverable,
      identity: { studentNumber: '22-1001', studentName: 'stale name', teamCode: 'stale team' },
      student: { studentNumber: '22-1001', name: 'Official Name', teamCode: '', section: '' },
      values: { section: 'G7' }
    })).toEqual({
      teamCode: 'Team Code is required for this form.'
    });
    expect(validateSubmissionIdentity({
      deliverable: identityDeliverable,
      identity: { studentNumber: '22-1001', studentName: 'Official Name', teamCode: '2526-it332-41' },
      student: { studentNumber: '22-1001', name: 'Official Name', teamCode: '2526-it332-41', section: '' },
      values: {}
    })).toEqual({ section: 'Section is required for this form.' });
  });

  it('rejects a legacy Team Code that disagrees with the selected Student Number', () => {
    expect(validateSubmissionIdentity({
      deliverable: { fields: [{ id: 'link', type: 'url', required: true, active: true }] },
      identity: { studentNumber: '22-1001', studentName: 'Official Name', teamCode: 'OTHER-TEAM' },
      student: { studentNumber: '22-1001', name: 'Official Name', teamCode: 'IT-01' }
    })).toEqual({ teamCode: 'Team Code must match the selected Student Number.' });
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

  it('reads the real Team Formation member column instead of the MEMBER #1 note in the team-code header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => [
        '"For students enrolled in IT332 G1 - G7 ONLY NOTE: MEMBER #1 should be assigned as Team Lead TEAM CODE",TEAM DETAILS MEMBER #,STUDENT ID,LASTNAME,FIRSTNAME,EMAIL @cit.edu,PROPOSED PROJECT,ADVISER',
        '2526-sem2-it332-01,1,25-0001-001,Doe,Alex,alex.doe@cit.edu,,',
        '2526-sem2-it332-01,2,25-0001-002,Rivera,Sam,sam.rivera@cit.edu,,'
      ].join('\n')
    }));

    const result = await importPublicSheetSource('teamFormation', { sheetUrl }, current);

    expect(result.ok).toBe(true);
    expect(result.students).toHaveLength(2);
    expect(result.students.map((student) => student.studentNumber)).toEqual(['25-0001-001', '25-0001-002']);
    expect(result.students.map((student) => student.memberNumber)).toEqual([1, 2]);
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

  it('treats current IT411 metadata as metadata and reconciles old Team Formation codes by Student Number', async () => {
    const state = {
      ...current,
      students: [{
        rowKey: 'old-alex',
        studentNumber: '25-0001-001',
        name: 'DOE, ALEX Q.',
        teamCode: '2526-sem2-it332-41',
        memberNumber: '4',
        section: 'IT332',
        adviser: 'Ralph Laviste',
        email: 'alex.doe@cit.edu'
      }],
      projectMetadata: [{
        groupCode: '2526-sem2-it332-41',
        projectTitle: 'CapVault',
        softwareName: 'CapVault',
        adviserName: 'Ralph Laviste'
      }]
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => [
        'No.,NAME OF STUDENT,STUDENT NO.,SECTION,NEW TEAM CODE,MID,ADVISER,SOFTWARE TITLE,MVP Validation,Refactored SPMP,Refactored SRS,Refactored SDD,STD',
        '1,"DOE, ALEX Q.",25-0001-001,G2,2627-sem1-it411-41,4,Ralph Laviste,WildTrack,,,,,',
        ',,,,,,SUBMISSION DEADLINE,,9/12/2026,9/19/2026,9/19/2026,9/19/2026,9/26/2026'
      ].join('\n')
    }));

    const result = await importPublicSheetSource('tracker', { sheetUrl }, state);

    expect(result.ok).toBe(true);
    expect(result.trackerColumns.map((column) => column.key)).toEqual([
      'MVP Validation', 'Refactored SPMP', 'Refactored SRS', 'Refactored SDD', 'STD'
    ]);
    expect(result.trackerColumns.map((column) => column.key)).not.toEqual(expect.arrayContaining(['No.', 'MID', 'SOFTWARE TITLE']));
    expect(result.students).toHaveLength(1);
    expect(result.students[0]).toMatchObject({
      studentNumber: '25-0001-001',
      teamCode: '2627-sem1-it411-41',
      teamFormationCode: '2526-sem2-it332-41',
      memberNumber: 4,
      softwareTitle: 'WildTrack',
      email: 'alex.doe@cit.edu'
    });
    expect(result.projectMetadata[0]).toMatchObject({
      sourceGroupCode: '2526-sem2-it332-41',
      groupCode: '2627-sem1-it411-41',
      projectTitle: 'CapVault',
      softwareName: 'WildTrack'
    });
    expect(result.suggestedForms.map((item) => item.trackerColumn)).toEqual([
      'MVP Validation', 'Refactored SPMP', 'Refactored SRS', 'Refactored SDD', 'STD'
    ]);
  });

  it('requires deadline evidence before treating a new unknown Tracker header as a deliverable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => [
        'NAME OF STUDENT,TEAM FORMATION,MEMBER#,SRS,Coordinator Note,Future Deliverable',
        ',,,4/18/2026,,10/1/2026',
        'DOE JANE,IT-01,1,0,Needs verification,0'
      ].join('\n')
    }));

    const result = await importPublicSheetSource('tracker', { sheetUrl }, current);

    expect(result.ok).toBe(true);
    expect(result.trackerColumns.filter((column) => column.active).map((column) => column.key)).toEqual([
      'SRS', 'Future Deliverable'
    ]);
    expect(result.importSummary.unrecognizedFields).toEqual(['Coordinator Note']);
    expect(result.warnings.join(' ')).toContain('Coordinator Note');
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

  it('collapses duplicate columns to the backend record', () => {
    const deduped = dedupeDeliverables([
      clientProb,
      backendProb,
      { ...clientProb, id: 'deliv-generated-1780000000001' }
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'probexploration',
      title: 'Problem Exploration',
      trackerColumn: 'ProbExploration'
    });
    expect(deduped[0].instructions).toBe('Submit the problem exploration as a PDF Drive file.');
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
