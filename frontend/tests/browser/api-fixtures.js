import { expect } from '@playwright/test';

// Wire-format fixtures: browser journeys exercise the real clients and mappings.
export async function installApiFixtures(page, { role = 'student', connected = false, submitted = false, program = 'IT' } = {}) {
  const workspace = {
    id: program === 'IT' ? '11111111-1111-1111-1111-111111111111' : '22222222-2222-2222-2222-222222222222',
    publicKey: program === 'IT' ? 'it-it332-2025-26-semester-2' : 'cs-cs-capstone-2025-26-semester-2',
    name: `${program} Capstone`, program, courseCode: program === 'IT' ? 'IT332' : 'CS Capstone',
    academicYear: '2025-26', semester: 'Semester 2', active: true
  };
  const student = { id: 'student-1', studentNumber: '22-1001-001', studentName: 'DELA CRUZ, JUAN CARLOS M.', teamCode: '2526-sem2-it332-11', memberNumber: '1', sectionName: 'A', adviserName: 'Dr. Elena Mercado', institutionalEmail: '' };
  const identity = { authenticated: role !== 'anonymous', email: 'student.browser-test@gmail.com', name: 'Browser Test Student', googleSubject: 'browser-test-google-subject', roles: role === 'admin' ? ['ADMIN'] : role === 'adviser' ? ['ADVISER'] : [] };
  const deliverable = { id: 'deliverable-srs', slug: 'week-9-srs', title: 'Software Requirements Specification', trackerColumnKey: 'SRS', dueAt: '2026-04-18T23:59:00', pdfRequired: true, status: 'PUBLISHED', instructions: 'Submit your SRS PDF Drive link.' };
  const deliverables = [deliverable, { ...deliverable, id: 'deliverable-sdd', slug: 'week-10-sdd', title: 'Software Design Document', trackerColumnKey: 'SDD' }];
  const columns = [{ id: 'column-srs', columnKey: 'SRS', label: 'SRS', sourceColumn: 'SRS', sourceColumnIndex: 0, displayOrder: 0, active: true, pdfRequired: true }];
  const projects = [{ id: 'project-1', groupCode: student.teamCode, projectTitle: 'Accessible Learning Hub', softwareName: 'AccessHub', adviserName: student.adviserName }];
  const rows = [{ ...student, id: 'row-1', cells: [{ columnKey: 'SRS', rawValue: '0' }] }];
  const timestamp = '2026-04-17T09:00:00Z';
  let association = connected ? { ...student, assuranceLevel: 'SELF_DECLARED' } : null;
  let response = submitted ? makeResponse({ documentPdf: 'https://drive.google.com/file/d/browser-pdf/view' }) : null;
  let draft = null;
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
    if (method === 'GET' && path.startsWith('/public/forms/')) {
      expect(path).toBe(`/public/forms/${workspace.publicKey}/${deliverable.slug}`);
      return reply({ workspace, deliverable });
    }
    if (method === 'GET' && path === '/workspaces') return reply([workspace]);
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
      expect(association).not.toBeNull();
      response = makeResponse(JSON.parse(request.postDataJSON().valuesJson));
      return reply({ changed: true, responseId: response.id, revision: response.revision, valuesJson: response.valuesJson });
    }
    const responses = response ? [response] : [];
    if (path === '/workspace/students/dashboard' && method === 'GET') return reply({
      association, rosterOptions: [student], students: association ? [student] : [],
      projects: association ? projects : [], trackerColumns: columns, trackerRows: association ? rows : [],
      deliverables, responses, reviewStates: {}, fileChecks: {}
    });
    if (path === '/monitoring' && method === 'GET') return reply({ students: [student], projects, trackerColumns: columns, trackerRows: rows, deliverables, responses, teamCodes: [student.teamCode], allTeams: role === 'admin' });
    const collections = { '/students': [student], '/projects': projects, '/tracker/columns': columns, '/tracker/rows': rows, '/deliverables': deliverables, '/templates': [], '/workspace/responses/my-team': responses,
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
