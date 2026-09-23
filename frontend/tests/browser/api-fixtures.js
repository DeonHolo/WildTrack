import { expect } from '@playwright/test';

// Wire-format fixtures: browser journeys exercise the real clients and mappings.
export async function installApiFixtures(page, {
  role = 'student',
  connected = false,
  submitted = false,
  checkedPdf = false,
  documentCheckPolicy = 'AUTO',
  program = 'IT',
  formStatus = 'PUBLISHED',
  templates = []
} = {}) {
  const workspace = {
    id: program === 'IT' ? '11111111-1111-1111-1111-111111111111' : '22222222-2222-2222-2222-222222222222',
    publicKey: program === 'IT' ? 'it-it332-2025-26-semester-2' : 'cs-cs-capstone-2025-26-semester-2',
    name: `${program} Capstone`, program, courseCode: program === 'IT' ? 'IT332' : 'CS Capstone',
    academicYear: '2025-26', semester: 'Semester 2', active: true
  };
  const student = { id: 'student-1', studentNumber: '22-1001-001', studentName: 'DELA CRUZ, JUAN CARLOS M.', teamCode: '2526-sem2-it332-11', memberNumber: '1', sectionName: 'A', adviserName: 'Dr. Elena Mercado', institutionalEmail: '' };
  const identity = { authenticated: role !== 'anonymous', email: 'student.browser-test@gmail.com', name: 'Browser Test Student', googleSubject: 'browser-test-google-subject', roles: role === 'admin' ? ['ADMIN'] : role === 'adviser' ? ['ADVISER'] : [] };
  const deliverable = {
    id: 'deliverable-srs',
    slug: 'week-9-srs',
    title: 'Software Requirements Specification',
    trackerColumnKey: 'SRS',
    dueAt: '2026-04-18T23:59:00',
    pdfRequired: true,
    status: formStatus,
    instructions: 'Submit your SRS PDF Drive link.',
    createdAt: '2026-04-01T08:00:00',
    updatedAt: '2026-04-01T08:00:00',
    fields: [{
      id: 'field-document-pdf', fieldKey: 'documentPdf', label: 'PDF Drive Link', helpText: '', fieldType: 'DRIVE_PDF',
      required: true, displayOrder: 0, documentCheckPolicy, aiReviewEnabled: true, active: true, options: []
    }]
  };
  const deliverables = [deliverable, { ...deliverable, id: 'deliverable-sdd', slug: 'week-10-sdd', title: 'Software Design Document', trackerColumnKey: 'SDD' }];
  const columns = [{ id: 'column-srs', columnKey: 'SRS', label: 'SRS', sourceColumn: 'SRS', sourceColumnIndex: 0, displayOrder: 0, active: true, pdfRequired: true }];
  const projects = [{ id: 'project-1', groupCode: student.teamCode, projectTitle: 'Accessible Learning Hub', softwareName: 'AccessHub', adviserName: student.adviserName }];
  const rows = [{ ...student, id: 'row-1', cells: [{ columnKey: 'SRS', rawValue: '0' }] }];
  const timestamp = '2026-04-17T09:00:00Z';
  let association = connected ? { ...student, assuranceLevel: 'SELF_DECLARED' } : null;
  let response = submitted ? makeResponse({ documentPdf: 'https://drive.google.com/file/d/browser-pdf/view' }) : null;
  const checkedReport = {
    id: 'check-browser-1', responseId: 'response-1', fieldId: 'field-document-pdf',
    sourceUrl: 'https://drive.google.com/file/d/browser-pdf/view',
    sourceResponseUpdatedAt: timestamp, checkedAt: timestamp, status: 'COMPLETED',
    attentionRequired: false, summary: 'Submitted PDF is accessible and readable.', flags: [],
    metadata: { name: 'Browser SRS.pdf', canDownload: true, mimeType: 'application/pdf' },
    document: { readable: true, pageCount: 5 }
  };
  let draft = null;
  let deliverableRevision = 0;
  const dismissedTaskKeys = new Set();
  let fileMonitorSettings = {
    enabled: false,
    configured: true,
    deliverableSelectionConfigured: false,
    deliverables: deliverables.map((item) => ({
      id: item.id,
      title: item.title,
      dueAt: item.dueAt,
      enabled: true
    }))
  };
  const unexpected = [];
  const calls = [];

  function makeResponse(values) {
    return { id: 'response-1', deliverableId: deliverable.id, studentNumber: student.studentNumber, studentName: student.studentName, teamCode: student.teamCode, googleSubject: identity.googleSubject, googleEmail: identity.email, owned: true, submittedAt: timestamp, updatedAt: timestamp, revision: 0, valuesJson: JSON.stringify(values) };
  }

  // Preview role is only a development UI preference; identity comes from /auth/session.
  await page.addInitScript((value) => localStorage.setItem('wildtrack.v2.preview-role', value), role);
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method();
    calls.push({ method, path, workspaceId: url.searchParams.get('workspaceId'), body: request.postDataJSON() });
    const reply = (json, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
    if (method === 'GET' && path === '/auth/session') return reply(identity);
    if (method === 'GET' && path === '/drive-history/auth/status') {
      return reply({ configured: false, connected: false, message: 'Mock browser fixture has no live Google consent.' });
    }
    if (method === 'GET' && path === '/drive-history') {
      return reply({ sourceLabel: 'Google Drive revision metadata', status: 'NOT_CONNECTED',
        revisions: [], nextPageToken: null, historyMayBeIncomplete: true,
        coverageMessage: 'No Google Drive grant is connected in the browser fixture.' });
    }
    if (method === 'GET' && path.startsWith('/public/forms/')) {
      expect(path).toBe(`/public/forms/${workspace.publicKey}/${deliverable.slug}`);
      return reply({ workspace, deliverable });
    }
    if (method === 'GET' && path === '/workspaces') return reply([workspace]);
    if (path === `/workspaces/${workspace.id}/file-monitor` && method === 'GET') {
      expect(role).toBe('admin');
      return reply(fileMonitorSettings);
    }
    if (path === `/workspaces/${workspace.id}/file-monitor` && method === 'PUT') {
      expect(role).toBe('admin');
      const body = request.postDataJSON();
      expect(typeof body.enabled).toBe('boolean');
      expect(body.deliverableIds === undefined || Array.isArray(body.deliverableIds)).toBe(true);
      if (body.deliverableIds) {
        expect(body.deliverableIds.every((id) => fileMonitorSettings.deliverables.some((item) => item.id === id))).toBe(true);
      }
      fileMonitorSettings = {
        ...fileMonitorSettings,
        enabled: body.enabled,
        deliverableSelectionConfigured: body.deliverableIds ? true : fileMonitorSettings.deliverableSelectionConfigured,
        deliverables: fileMonitorSettings.deliverables.map((item) => ({
          ...item,
          enabled: body.deliverableIds ? body.deliverableIds.includes(item.id) : item.enabled
        }))
      };
      return reply(fileMonitorSettings);
    }
    if (path === '/file-monitor/events' && method === 'GET') {
      expect(['admin', 'adviser']).toContain(role);
      expect(url.searchParams.get('workspaceId')).toBe(workspace.id);
      return reply([]);
    }
    if (path === '/work-task-dismissals' && method === 'GET') {
      expect(['admin', 'adviser']).toContain(role);
      expect(url.searchParams.get('workspaceId')).toBe(workspace.id);
      return reply([...dismissedTaskKeys]);
    }
    if (path === '/work-task-dismissals' && method === 'POST') {
      expect(['admin', 'adviser']).toContain(role);
      const body = request.postDataJSON();
      expect(body.workspaceId).toBe(workspace.id);
      expect(typeof body.taskKey).toBe('string');
      expect(body.taskKey.trim()).not.toBe('');
      dismissedTaskKeys.add(body.taskKey);
      return route.fulfill({ status: 204 });
    }
    if (path === '/work-task-dismissals' && method === 'DELETE') {
      expect(['admin', 'adviser']).toContain(role);
      expect(url.searchParams.get('workspaceId')).toBe(workspace.id);
      const taskKey = url.searchParams.get('taskKey');
      expect(taskKey).toBeTruthy();
      dismissedTaskKeys.delete(taskKey);
      return route.fulfill({ status: 204 });
    }
    if (method === 'GET' && path === '/workspace/staff/me') return reply(role === 'adviser'
      ? {
          adviserName: student.adviserName,
          assignments: [{ workspaceId: workspace.id, teamCode: student.teamCode }],
          workspaces: [workspace]
        }
      : { adviserName: '', assignments: [], workspaces: [] });
    if (method === 'GET' && path === '/workspace/staff/directory') return reply({
      workspaceIds: [workspace.id],
      profiles: [
        {
          profile: {
            id: 'staff-admin', googleSubject: 'sub-admin', googleEmail: 'admin.browser-test@gmail.com',
            roles: ['ADMIN'], enabled: true, assignedTeams: [], adviserName: '', revision: 'admin-r1'
          },
          assignments: []
        },
        {
          profile: {
            id: 'staff-adviser', googleSubject: 'sub-adviser', googleEmail: 'adviser.browser-test@gmail.com',
            roles: ['ADVISER'], enabled: true, assignedTeams: [student.teamCode], adviserName: 'Browser Adviser', revision: 'adviser-r1'
          },
          assignments: [{ workspaceId: workspace.id, teamCode: student.teamCode }]
        },
        {
          profile: {
            id: 'staff-revoked', googleSubject: 'sub-revoked', googleEmail: 'revoked.browser-test@gmail.com',
            roles: ['ADVISER'], enabled: false, assignedTeams: [], adviserName: 'Former Browser Adviser', revision: 'revoked-r1'
          },
          assignments: []
        }
      ],
      teams: [{ workspaceId: workspace.id, workspaceName: workspace.name, teamCode: student.teamCode, adviserNames: ['Browser Adviser'] }]
    });
    if (path === '/workspace/students/me' && method === 'GET') return reply(association);
    if (path === '/workspace/students/options' && method === 'GET') return reply([student]);
    if (path === '/workspace/students/associate' && method === 'POST') {
      expect(request.postDataJSON().studentNumber).toBe(student.studentNumber);
      association = { ...student, assuranceLevel: 'SELF_DECLARED' };
      return reply(association);
    }
    if (path === '/workspace/drafts' && method === 'GET') return reply(draft || { present: false });
    if (path === '/workspace/drafts' && method === 'DELETE') { draft = null; return route.fulfill({ status: 204 }); }
    if (path === '/workspace/drafts/save' && method === 'POST') {
      draft = { ...request.postDataJSON(), present: true, revision: (draft?.revision ?? -1) + 1 };
      return reply(draft);
    }
    if (path === '/workspace/responses/mine' && method === 'GET') return reply(response);
    if (path === '/workspace/responses/submit' && method === 'POST') {
      const body = request.postDataJSON();
      expect(body.studentNumber).toBe(student.studentNumber);
      association ??= { ...student, assuranceLevel: 'SELF_DECLARED' };
      response = makeResponse(JSON.parse(body.valuesJson));
      return reply({ changed: true, responseId: response.id, revision: response.revision, valuesJson: response.valuesJson });
    }
    if (path === '/deliverables/unpublish-all' && method === 'POST') {
      deliverables.forEach((item) => { item.status = 'UNPUBLISHED'; });
      return reply(deliverables);
    }
    if (method === 'POST' && path.startsWith('/sheets/preview/')) {
      const sourceType = path.split('/').pop();
      return reply({
        previewId: `browser-preview-${sourceType}`,
        sourceType,
        stateVersion: 'browser-state-v1',
        sourceVersion: 'browser-source-v1',
        addedRows: 0,
        changedRows: 1,
        missingRows: 0,
        changes: [{
          key: 'student:student-1',
          entityType: 'student',
          rowKey: 'student-1',
          rowLabel: student.studentName,
          kind: 'CHANGED',
          fields: [{
            key: 'student:student-1:teamCode',
            field: 'teamCode',
            label: 'Team code',
            sourceValue: '2627-sem1-it411-11',
            localValue: student.teamCode,
            conflict: true
          }]
        }],
        warnings: [],
        deadlineSuggestions: [],
        details: { detectedFields: ['Student name', 'Team code'], missingFields: [], metrics: { studentRows: 1 }, deadlineRows: 0 }
      });
    }
    if (method === 'POST' && path.startsWith('/sheets/apply/')) {
      const sourceType = path.split('/').pop();
      expect(request.postDataJSON()).toEqual({
        previewId: `browser-preview-${sourceType}`,
        resolutions: { 'student:student-1:teamCode': 'SOURCE' }
      });
      return reply({
        importRunId: 'browser-import-run',
        sourceType,
        status: 'IMPORTED',
        rowsFound: 1,
        columnsFound: 1,
        studentsFound: 1,
        officialIdsFound: 1,
        groupsFound: 0,
        warnings: [],
        deadlineSuggestions: [],
        details: { detectedFields: ['Student name', 'Team code'], missingFields: [], metrics: { studentRows: 1 }, deadlineRows: 0 },
        importedAt: timestamp
      });
    }
    if (path === `/deliverables/${deliverable.id}` && method === 'PUT') {
      const body = request.postDataJSON();
      deliverableRevision += 1;
      Object.assign(deliverable, {
        trackerColumnKey: body.trackerColumnKey,
        title: body.title,
        slug: deliverable.slug,
        instructions: body.instructions || '',
        dueAt: body.dueAt,
        pdfRequired: Boolean(body.pdfRequired),
        status: body.status,
        updatedAt: `2026-04-01T08:${String(deliverableRevision).padStart(2, '0')}:00`,
        fields: (body.fields || []).map((field, index) => ({
          id: field.id || `browser-${field.fieldKey}`,
          fieldKey: field.fieldKey,
          label: field.label,
          helpText: field.helpText || '',
          fieldType: field.fieldType,
          required: field.required,
          displayOrder: index,
          documentCheckPolicy: field.documentCheckPolicy,
          aiReviewEnabled: field.aiReviewEnabled,
          active: field.active !== false,
          options: (field.options || []).map((option, optionIndex) => ({
            id: option.id || `browser-${field.fieldKey}-option-${optionIndex + 1}`,
            label: option.label
          }))
        }))
      });
      return reply(deliverable);
    }
    const responses = response ? [response] : [];
    if (path === '/workspace/students/dashboard' && method === 'GET') return reply({
      association, rosterOptions: [student], students: association ? [student] : [],
      projects: association ? projects : [], trackerColumns: columns, trackerRows: association ? rows : [],
      deliverables, responses, reviewStates: {}, fileChecks: {},
      fileChecksByField: checkedPdf && response ? { [response.id]: { 'field-document-pdf': checkedReport } } : {}
    });
    if (path === '/monitoring' && method === 'GET') return reply({ students: [student], projects, trackerColumns: columns, trackerRows: rows, deliverables, responses, reviewStates: Object.fromEntries(responses.map(item => [item.id, { feedback: [], acceptance: null }])), fileChecks: {}, teamCodes: [student.teamCode], allTeams: role === 'admin' });
    const collections = { '/students': [student], '/projects': projects, '/tracker/columns': columns, '/tracker/rows': rows, '/deliverables': deliverables, '/templates': templates, '/workspace/responses/my-team': responses,
      '/workspace/students/identity-conflicts': [], '/workspace/staff': [],
      '/workspace/sources': ['TEAM_FORMATION', 'TRACKER', 'PROJECT_MONITOR'].map((sourceType) => ({ sourceType, status: 'IMPORTED', displayName: sourceType, sheetUrl: 'https://docs.google.com/spreadsheets/d/browser-sheet/edit' })) };
    if (method === 'GET' && Object.hasOwn(collections, path)) return reply(collections[path]);
    if (method === 'GET' && path === '/workspace/responses/response-1/review-state') return reply({ feedback: [], acceptance: null });
    if (method === 'GET' && path === '/file-checks/response-1') return reply({ id: 'check-1', responseId: 'response-1', sourceResponseUpdatedAt: timestamp, checkedAt: timestamp, status: 'COMPLETED', attentionRequired: false, summary: 'The submitted PDF is accessible and readable.', flags: [], metadata: { canDownload: true, mimeType: 'application/pdf' }, document: { readable: true, pageCount: 5 } });
    if (method === 'GET' && path === '/file-checks/status') return reply({ configured: true, message: 'Google Drive connected.' });
    unexpected.push(`${method} ${path}`);
    return reply({ error: `Unexpected fixture request: ${method} ${path}` }, 501);
  });
  return { calls, assertRequestsHandled: () => expect(unexpected).toEqual([]) };
}
