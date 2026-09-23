import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications, notifications } from '@mantine/notifications';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { CommandCenterPage } from './CommandCenterPage.jsx';

const workflow = vi.hoisted(() => ({
  state: null,
  loadFromServer: false,
  activeWorkspaceId: null,
  session: { authenticated: true, email: 'admin@example.com' },
  runDocumentCheck: vi.fn(),
  runDocumentChecks: vi.fn(),
  archiveAttempt: vi.fn(),
  acceptResponse: vi.fn(),
  revokeAcceptance: vi.fn(),
  runAiReview: vi.fn()
}));

const api = vi.hoisted(() => ({
  getIdentityConflicts: vi.fn(),
  getFileMonitorEvents: vi.fn(),
  getWorkTaskDismissals: vi.fn(),
  dismissWorkTask: vi.fn(),
  restoreWorkTask: vi.fn(),
  getAiReviewStatus: vi.fn(),
  getSubmittedFileHistory: vi.fn(),
  getStudentAccountBindings: vi.fn(),
  disconnectStudentAccountBinding: vi.fn(),
  recoverStudentAccountBinding: vi.fn()
}));

vi.mock('../app/WorkspaceSession.jsx', () => ({
  useWorkspaceSession: () => ({ activeWorkspaceId: workflow.activeWorkspaceId, session: workflow.session })
}));

vi.mock('../hooks/useWorkspaceResource.js', async () => {
  const { useEffect, useReducer } = await import('react');
  return { useWorkspaceResource: (_id, _load, _empty, key) => {
    const [, renderAgain] = useReducer(value => value + 1, 0);
    useEffect(() => {
      if (!workflow.loadFromServer || !_id || key !== 'work-queue') return;
      let active = true;
      _load(_id).then(data => {
        if (active) { workflow.state = data; renderAgain(); }
      });
      return () => { active = false; };
    }, [_id, _load, key]);
    return {
      data: key === 'identity-history' ? workflow.state.openConflicts || [] : workflow.state,
      setData: next => { workflow.state = typeof next === 'function' ? next(workflow.state) : next; renderAgain(); },
      status: workflow.error ? 'error' : 'ready', error: workflow.error || '', reload: vi.fn()
    };
  } };
});
vi.mock('../lib/monitoringClient.js', () => ({
  emptyMonitoringState: () => ({ attempts: [], students: [], deliverables: [], archives: [] }),
  loadMonitoringState: async () => workflow.state
}));
beforeEach(() => { workflow.error = ''; notifications.clean(); });

vi.mock('../lib/reviewDeskClient.js', () => ({
  applyDocumentCheck: (response, report) => ({ ...response, documentCheck: report }),
  applyReviewMutation: (response, reviewState) => ({ ...response, ...reviewState }),
  applyArtifactAiReview: (response, review) => ({ ...response, aiReviewState: review }),
  acceptResponse: (...args) => workflow.acceptResponse(...args),
  revokeAcceptance: (...args) => workflow.revokeAcceptance(...args),
  runAiReview: (...args) => workflow.runAiReview(...args),
  runDocumentCheck: (_workspaceId, response) => workflow.runDocumentCheck(response.id),
  runDocumentChecks: (...args) => workflow.runDocumentChecks(...args)
}));

vi.mock('../lib/archiveClient.js', () => ({
  archiveAttempts: (_workspaceId, responseIds) => workflow.archiveAttempt(responseIds[0])
}));

vi.mock('../lib/api.js', () => api);

const submittedAt = '2026-04-19T11:04:00+08:00';

function response(id, overrides = {}) {
  return {
    id,
    deliverableId: 'deliv-srs',
    studentNumber: `23-${id.slice(-3)}0-001`,
    studentName: `Student ${id}`,
    teamCode: '2526-sem2-it332-07',
    submittedAt,
    updatedAt: submittedAt,
    values: { documentPdf: `https://drive.google.com/file/d/${id}/view` },
    flags: ['Received'],
    reviewStatus: 'Received',
    archiveStatus: 'Not Archived',
    documentCheck: null,
    ...overrides
  };
}

function checkedResponse(id, overrides = {}) {
  return response(id, {
    reviewStatus: 'Needs Review',
    documentCheck: {
      status: 'Current',
      checkedAt: '2026-04-20T09:00:00+08:00',
      sourceResponseUpdatedAt: submittedAt,
      summary: 'Readable PDF with sections requiring a staff decision.'
    },
    ...overrides
  });
}

function makeState(attempts = []) {
  return {
    students: attempts.map((item, index) => ({
      studentNumber: item.studentNumber,
      name: item.studentName,
      teamCode: item.teamCode,
      memberNumber: index + 1
    })),
    deliverables: [{
      id: 'deliv-srs',
      shortTitle: 'SRS',
      title: 'Week 9: Software Requirements Specification',
      trackerColumn: 'SRS',
      status: 'Published',
      fields: [{ id: 'documentPdf', label: 'PDF Drive link', pdfRequired: true }]
    }],
    attempts,
    archives: [],
    classRecord: { importSummary: null, importWarnings: [], sources: {} }
  };
}

function pageTree() {
  return (
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ModalsProvider>
        <Notifications />
        <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <CommandCenterPage />
        </MemoryRouter>
      </ModalsProvider>
    </MantineProvider>
  );
}

function renderPage() { return render(pageTree()); }

describe("today's work queues", () => {
  beforeEach(() => {
    notifications.clean();
    workflow.session = { authenticated: true, email: 'admin@example.com' };
    workflow.state = makeState([
      response('unchecked-001'),
      checkedResponse('review-002'),
      response('identity-003', { identityConflict: true }),
      response('accepted-004', { reviewStatus: 'Accepted' }),
      response('archived-005', { reviewStatus: 'Accepted', archiveStatus: 'Archived' })
    ]);
    workflow.state.classRecord.importSummary = {
      sourceType: 'Tracker',
      resultStatus: 'Imported with warnings',
      warnings: ['No deadline row was detected.']
    };
    workflow.runDocumentCheck.mockReset().mockResolvedValue({ ok: true });
    workflow.runDocumentChecks.mockReset().mockResolvedValue({ completed: 1, total: 1, failed: 0, results: [] });
    workflow.archiveAttempt.mockReset().mockResolvedValue({ ok: true, archived: 1 });
    workflow.activeWorkspaceId = null;
    workflow.loadFromServer = false;
    api.getIdentityConflicts.mockReset().mockResolvedValue([]);
    api.getFileMonitorEvents.mockReset().mockResolvedValue([]);
    api.getWorkTaskDismissals.mockReset().mockResolvedValue([]);
    api.dismissWorkTask.mockReset().mockResolvedValue(undefined);
    api.restoreWorkTask.mockReset().mockResolvedValue(undefined);
    api.getAiReviewStatus.mockReset().mockResolvedValue({ configured: true });
    api.getSubmittedFileHistory.mockReset().mockResolvedValue({ revisions: [], limitations: [] });
    workflow.acceptResponse.mockReset().mockResolvedValue({ reviewStatus: 'Accepted', acceptance: { acceptedAt: submittedAt } });
    workflow.revokeAcceptance.mockReset().mockResolvedValue({ reviewStatus: 'Pending', acceptance: null });
    workflow.runAiReview.mockReset().mockResolvedValue({ ok: true, review: { status: 'COMPLETED' } });
    api.getStudentAccountBindings.mockReset().mockResolvedValue({ firstClaimLimitation: 'First successful submission is self-declared.', accounts: [] });
    api.disconnectStudentAccountBinding.mockReset().mockResolvedValue({ status: 'UNBOUND' });
    api.recoverStudentAccountBinding.mockReset().mockResolvedValue({ status: 'BOUND' });
  });

  it('opens account management and exposes explicit Admin disconnect and recovery actions', async () => {
    workflow.activeWorkspaceId = 'ws-account';
    api.getStudentAccountBindings.mockResolvedValue({
      firstClaimLimitation: 'Account ownership is self-declared by the first successful submission.',
      accounts: [
        {
          studentRecordId: 'record-bound', studentNumber: '22-1001-001', studentName: 'Bound Student', teamCode: 'TEAM-1',
          status: 'BOUND', googleSubject: 'sub-bound', googleEmail: 'bound@example.test', candidates: []
        },
        {
          studentRecordId: 'record-conflict', studentNumber: '22-1002-002', studentName: 'Review Student', teamCode: 'TEAM-2',
          status: 'CONFLICT', googleSubject: null, googleEmail: null, candidates: [
            { googleSubject: 'sub-first', googleEmail: 'first@example.test', active: true },
            { googleSubject: 'sub-second', googleEmail: 'second@example.test', active: true }
          ]
        }
      ]
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Account management' }));
    const dialog = await screen.findByRole('dialog', { name: 'Student account management' });
    expect(dialog).toHaveTextContent('self-declared by the first successful submission');
    expect(dialog).toHaveTextContent('Needs review');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect account' }));
    await waitFor(() => expect(api.disconnectStudentAccountBinding).toHaveBeenCalledWith('ws-account', 'record-bound'));

    fireEvent.click(within(dialog).getByRole('radio', { name: /second@example\.test/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Recover selected account' }));
    await waitFor(() => expect(api.recoverStudentAccountBinding).toHaveBeenCalledWith('ws-account', 'record-conflict', 'sub-second'));
  });

  it.each(['workspace', 'account'])('discards old command results after a %s change', async (change) => {
    let finish;
    workflow.activeWorkspaceId = 'ws-old';
    workflow.runDocumentCheck.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const view = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Check Student unchecked-001 reviewable PDF artifacts' }));
    if (change === 'workspace') workflow.activeWorkspaceId = 'ws-new';
    else workflow.session = { authenticated: true, email: 'other@example.com' };
    view.rerender(pageTree());
    await act(async () => { finish({ ok: false, error: 'Private old document failure' }); });
    expect(screen.queryByText('Private old document failure')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check Student unchecked-001 reviewable PDF artifacts' })).toBeEnabled();
  });

  it('shows only unresolved operational work without metric cards or recent activity', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: "Today's work" })).toBeInTheDocument();
    expect(screen.queryByText('Open forms')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent activity')).not.toBeInTheDocument();

    const queue = screen.getByRole('table', { name: "Today's work queue" });
    expect(within(queue).getByText('Document Check')).toBeInTheDocument();
    expect(within(queue).getByText('Review decision')).toBeInTheDocument();
    expect(within(queue).getByText('Identity conflict')).toBeInTheDocument();
    expect(within(queue).getByText('Import warning')).toBeInTheDocument();
    expect(within(queue).getAllByText('Archive final')).toHaveLength(2);
    expect(within(queue).queryByText('archived-005')).not.toBeInTheDocument();
  });

  it('removes checked and archived tasks immediately after their in-place actions', async () => {
    workflow.runDocumentCheck.mockImplementation(async (id) => {
      workflow.state = makeState(workflow.state.attempts.map((item) => item.id === id ? checkedResponse(id) : item));
      return { ok: true };
    });
    workflow.archiveAttempt.mockImplementation(async (id) => {
      workflow.state = makeState(workflow.state.attempts.map((item) => item.id === id ? { ...item, archiveStatus: 'Archived' } : item));
      return { ok: true, archived: 1 };
    });
    const view = renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Check Student unchecked-001 reviewable PDF artifacts' }));
    await waitFor(() => expect(workflow.runDocumentCheck).toHaveBeenCalledWith('unchecked-001'));
    view.rerender(
      <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
        <ModalsProvider><Notifications /><MemoryRouter><CommandCenterPage /></MemoryRouter></ModalsProvider>
      </MantineProvider>
    );
    expect(screen.queryByRole('button', { name: 'Check Student unchecked-001 reviewable PDF artifacts' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archive Student accepted-004 final' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Archive this accepted response?' });
    expect(confirmation).toHaveTextContent('one archive metadata record');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Archive response' }));
    await waitFor(() => expect(workflow.archiveAttempt).toHaveBeenCalledWith('accepted-004'));
  });

  it('opens response review in Today’s work while preserving import and archive destination links', async () => {
    workflow.state.archives = [{
      id: 'archive-failed-1',
      attemptId: 'archived-005',
      storageStatus: 'Failed',
      integrityStatus: 'Unavailable',
      teamCode: '2526-sem2-it332-07',
      deliverableTitle: 'Software Requirements Specification',
      archivedAt: submittedAt
    }];
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Review Student review-002 response' }));
    const drawer = await screen.findByRole('dialog', { name: 'Review Student review-002' });
    expect(within(drawer).getByText('SRS response')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "Today's work" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Tracker import warning' }))
      .toHaveAttribute('href', '/workspace?source=tracker');
    expect(screen.getByRole('link', { name: 'Open failed archive record' }))
      .toHaveAttribute('href', '/archive?record=archive-failed-1');
  });

  it('keeps two pending PDF artifacts in one response task and checks both explicit fields', async () => {
    const attempt = response('mvp-001', {
      values: {
        validationInstrument: 'https://docs.google.com/forms/d/e/form-id/viewform',
        frameworkModel: 'https://drive.google.com/file/d/framework-pdf/view',
        responseSheet: 'https://docs.google.com/spreadsheets/d/sheet-id/edit',
        validationHighlights: 'https://drive.google.com/file/d/highlights-pdf/view',
        validationEvidence: 'https://drive.google.com/drive/folders/evidence-folder'
      }
    });
    workflow.state = makeState([attempt]);
    workflow.state.deliverables[0] = {
      ...workflow.state.deliverables[0],
      title: 'MVP Validation',
      shortTitle: 'MVP Validation',
      fields: [
        { id: 'validationInstrument', definitionId: 'field-form', label: 'Validation Instrument', type: 'googleForm', pdfRequired: false, documentCheckPolicy: 'OFF' },
        { id: 'frameworkModel', definitionId: 'field-framework', label: 'Framework / Model', type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO' },
        { id: 'responseSheet', definitionId: 'field-sheet', label: 'Validation Response Sheet', type: 'googleSheet', pdfRequired: false, documentCheckPolicy: 'OFF' },
        { id: 'validationHighlights', definitionId: 'field-highlights', label: 'MVP Validation Highlights', type: 'drive', pdfRequired: true, documentCheckPolicy: 'MANUAL' },
        { id: 'validationEvidence', definitionId: 'field-folder', label: 'Validation Evidence', type: 'driveFolder', pdfRequired: false, documentCheckPolicy: 'OFF' }
      ]
    };
    workflow.runDocumentChecks.mockResolvedValue({ ok: true, completed: 2, total: 2, failed: 0, results: [] });
    renderPage();

    const queue = screen.getByRole('table', { name: "Today's work queue" });
    expect(within(queue).getAllByText('Document Check')).toHaveLength(1);
    expect(within(queue).getByText('2 PDF artifacts · 0 checked · 2 need checking')).toBeInTheDocument();
    expect(within(queue).getByRole('button', { name: 'Check Student mvp-001 reviewable PDF artifacts' })).toHaveTextContent('Check 2 PDFs');

    fireEvent.click(within(queue).getByRole('button', { name: 'Check Student mvp-001 reviewable PDF artifacts' }));
    await waitFor(() => expect(workflow.runDocumentChecks).toHaveBeenCalled());
    const targets = workflow.runDocumentChecks.mock.calls[0][1];
    expect(targets).toHaveLength(2);
    expect(targets.map(target => [target.field.definitionId, target.response.values[target.field.id]])).toEqual([
      ['field-framework', 'https://drive.google.com/file/d/framework-pdf/view'],
      ['field-highlights', 'https://drive.google.com/file/d/highlights-pdf/view']
    ]);
  });

  it('stays compact at realistic workload volume and filters by work type', () => {
    workflow.state = makeState(Array.from({ length: 318 }, (_, index) => response(`unchecked-${String(index + 1).padStart(3, '0')}`)));
    renderPage();

    const queue = screen.getByRole('table', { name: "Today's work queue" });
    expect(within(queue).getAllByRole('row')).toHaveLength(51);
    expect(screen.getByText('Showing 1-50 of 318')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 7')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByText('No review work')).toBeInTheDocument();
  });

  it('shows a concise all-clear state when no actionable work exists', () => {
    workflow.state = makeState([
      checkedResponse('accepted-001', { reviewStatus: 'Accepted', archiveStatus: 'Archived' })
    ]);
    renderPage();

    expect(screen.getByText('All clear for this workspace')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: "Today's work queue" })).not.toBeInTheDocument();
  });

  it('groups file-monitor events by file, shows affected responses, and keeps bulk checks limited to unchecked PDFs', async () => {
    workflow.activeWorkspaceId = 'ws-monitor';
    const first = checkedResponse('shared-001');
    const second = checkedResponse('shared-002');
    workflow.state = makeState([first, second]);
    workflow.state.fileEvents = [{ id: 'old-event', fileId: 'same-pdf', kind: 'METADATA_CHANGED',
      detail: 'Old metadata observation.', observedAt: '2026-09-20T09:00:00Z',
      responseIds: [first.id, second.id], teamCodes: [first.teamCode] },
    { id: 'latest-event', fileId: 'same-pdf', kind: 'CONTENT_CHANGED',
      detail: 'The PDF content changed.', observedAt: '2026-09-22T09:00:00Z',
      responseIds: [first.id, second.id, second.id], teamCodes: [first.teamCode] }];
    renderPage();

    const queue = screen.getByRole('table', { name: "Today's work queue" });
    expect(within(queue).getAllByText('PDF content changed')).toHaveLength(1);
    expect(within(queue).getByText(/2 affected responses across 1 team/)).toBeInTheDocument();
    expect(within(queue).getByText(/Linked submissions: Student shared-001, Student shared-002/)).toBeInTheDocument();
    expect(within(queue).queryByText('Drive metadata changed')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Check all unchecked/ })).not.toBeInTheDocument();
    fireEvent.click(within(queue).getByRole('button', { name: 'Review affected response for PDF content changed' }));
    expect(await screen.findByRole('dialog', { name: 'Review Student shared-001' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "Today's work" })).toBeInTheDocument();
  });

  it('keeps an unresolved content alert prominent through later metadata and access updates, retains its dismissal, and surfaces a new content change', async () => {
    workflow.activeWorkspaceId = 'ws-file-alerts';
    const first = checkedResponse('shared-001');
    workflow.state = makeState([first]);
    const base = { fileId: 'shared-pdf', responseIds: [first.id], teamCodes: [first.teamCode] };
    const originalContent = { ...base, id: 'content-1', kind: 'CONTENT_CHANGED', detail: 'First verified content change.',
      observedAt: '2026-09-20T08:00:00Z' };
    const metadata = { ...base, id: 'metadata-1', kind: 'METADATA_CHANGED', detail: 'Drive metadata updated.',
      observedAt: '2026-09-21T08:00:00Z' };
    const restored = { ...base, id: 'restored-1', kind: 'ACCESS_RESTORED', detail: 'Drive access restored.',
      observedAt: '2026-09-22T08:00:00Z' };
    workflow.state.fileEvents = [restored, metadata, originalContent];
    const page = renderPage();

    const open = () => screen.getByRole('tabpanel', { name: 'Open notifications' });
    expect(within(open()).getByText('First verified content change.', { exact: false })).toBeInTheDocument();
    expect(within(open()).getAllByText('PDF content changed')).toHaveLength(1);
    expect(within(open()).queryByText('Drive metadata changed')).not.toBeInTheDocument();
    expect(within(open()).queryByText('PDF access restored')).not.toBeInTheDocument();

    fireEvent.click(within(open()).getByRole('button', { name: 'Dismiss PDF content changed: SRS | PDF content changed' }));
    await waitFor(() => expect(api.dismissWorkTask).toHaveBeenCalledWith('ws-file-alerts', 'file:shared-pdf:content-1'));
    expect(within(open()).queryByText('PDF content changed')).not.toBeInTheDocument();
    expect(within(open()).queryByText('Drive metadata changed')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('tab', { name: 'Dismissed (1)' }));
    expect(screen.getByRole('tabpanel', { name: 'Dismissed notifications' }))
      .toHaveTextContent('First verified content change.');

    const newerContent = { ...base, id: 'content-2', kind: 'CONTENT_CHANGED', detail: 'Second verified content change.',
      observedAt: '2026-09-22T09:00:00Z' };
    workflow.state = { ...workflow.state, fileEvents: [newerContent, restored, metadata, originalContent] };
    page.rerender(pageTree());
    fireEvent.click(screen.getByRole('tab', { name: /Open \(/ }));
    expect(within(open()).getByText('Second verified content change.', { exact: false })).toBeInTheDocument();
    expect(within(open()).queryByText('First verified content change.', { exact: false })).not.toBeInTheDocument();
    expect(within(open()).getAllByText('PDF content changed')).toHaveLength(1);
    fireEvent.click(screen.getByRole('tab', { name: 'Dismissed (1)' }));
    expect(screen.getByRole('tabpanel', { name: 'Dismissed notifications' }))
      .toHaveTextContent('First verified content change.');
    expect(screen.getByRole('tabpanel', { name: 'Dismissed notifications' }))
      .not.toHaveTextContent('Second verified content change.');
  });

  it('keeps an undismissed access failure visible when the file subsequently becomes accessible', () => {
    const attempt = checkedResponse('shared-001');
    workflow.state = makeState([attempt]);
    workflow.state.fileEvents = [
      { id: 'restored', fileId: 'access-file', kind: 'ACCESS_RESTORED',
        observedAt: '2026-09-22T10:00:00Z', responseIds: [attempt.id], teamCodes: [attempt.teamCode] },
      { id: 'unavailable', fileId: 'access-file', kind: 'ACCESS_UNAVAILABLE',
        observedAt: '2026-09-22T09:00:00Z', responseIds: [attempt.id], teamCodes: [attempt.teamCode] }
    ];
    renderPage();

    const open = screen.getByRole('tabpanel', { name: 'Open notifications' });
    expect(within(open).getByText('PDF access unavailable')).toBeInTheDocument();
    expect(within(open).getByText(/Linked submission: Student shared-001/)).toBeInTheDocument();
    expect(within(open).queryByText('PDF access restored')).not.toBeInTheDocument();
    expect(within(open).getAllByRole('button', { name: 'Review affected response for PDF access unavailable' })).toHaveLength(1);
  });

  it('keeps an older unresolved significant alert when a later significant event is dismissed', () => {
    const attempt = checkedResponse('shared-001');
    workflow.state = makeState([attempt]);
    workflow.state.dismissedKeys = ['file:same-file:latest-change'];
    workflow.state.fileEvents = [
      { id: 'latest-change', fileId: 'same-file', kind: 'CONTENT_CHANGED',
        detail: 'Latest change was acknowledged.', observedAt: '2026-09-22T10:00:00Z',
        responseIds: [attempt.id], teamCodes: [attempt.teamCode] },
      { id: 'unresolved-access', fileId: 'same-file', kind: 'ACCESS_UNAVAILABLE',
        detail: 'Earlier access failure still requires attention.', observedAt: '2026-09-22T09:00:00Z',
        responseIds: [attempt.id], teamCodes: [attempt.teamCode] }
    ];
    renderPage();
    const open = screen.getByRole('tabpanel', { name: 'Open notifications' });
    expect(within(open).getByText(/Earlier access failure still requires attention/)).toBeInTheDocument();
    expect(within(open).queryByText(/Latest change was acknowledged/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Dismissed (1)' }));
    expect(screen.getByRole('tabpanel', { name: 'Dismissed notifications' }))
      .toHaveTextContent('Latest change was acknowledged.');
  });

  it('persists dismiss and restore through server-backed tasks with an accessible Dismissed tab', async () => {
    workflow.activeWorkspaceId = 'ws-dismiss';
    workflow.state = makeState([checkedResponse('review-001')]);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Review decision: Student review-001 | SRS' }));
    await waitFor(() => expect(api.dismissWorkTask).toHaveBeenCalledWith('ws-dismiss', 'review:review-001'));
    expect(screen.queryByRole('button', { name: 'Review Student review-001 response' })).not.toBeInTheDocument();
    expect(workflow.state.dismissedKeys).toEqual(['review:review-001']);

    fireEvent.click(screen.getByRole('tab', { name: 'Dismissed (1)' }));
    expect(screen.getByRole('button', { name: 'Review Student review-001 response' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore Review decision: Student review-001 | SRS' }));
    await waitFor(() => expect(api.restoreWorkTask).toHaveBeenCalledWith('ws-dismiss', 'review:review-001'));
    expect(screen.getByText('No dismissed notifications')).toBeInTheDocument();
    expect(workflow.state.dismissedKeys).toEqual([]);
    fireEvent.click(screen.getByRole('tab', { name: 'Open (1)' }));
    expect(screen.getByRole('button', { name: 'Review Student review-001 response' })).toBeInTheDocument();
  });

  it('does not flash a dismissed task when returning before the fresh queue request completes', async () => {
    workflow.activeWorkspaceId = 'ws-return';
    workflow.state = makeState([checkedResponse('review-001'), checkedResponse('review-002')]);
    const firstVisit = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Review decision: Student review-001 | SRS' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Open (1)' })).toBeInTheDocument());
    expect(workflow.state.dismissedKeys).toContain('review:review-001');
    firstVisit.unmount();

    // The real resource hook reads its previous workspace/account snapshot on
    // remount. Keep the server response unresolved to catch a one-frame flash.
    let finishRefresh;
    api.getWorkTaskDismissals.mockReturnValueOnce(new Promise(resolve => { finishRefresh = resolve; }));
    workflow.loadFromServer = true;
    renderPage();
    expect(screen.getByRole('tab', { name: 'Open (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review Student review-001 response' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review Student review-002 response' })).toBeInTheDocument();

    await waitFor(() => expect(api.getWorkTaskDismissals).toHaveBeenCalledWith('ws-return'));
    await act(async () => { finishRefresh(['review:review-001']); });
    expect(screen.getByRole('tab', { name: 'Open (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review Student review-001 response' })).not.toBeInTheDocument();
  });

  it('dismisses and restores only the selected work section across search and pagination', async () => {
    workflow.activeWorkspaceId = 'ws-bulk-dismiss';
    workflow.state = makeState([
      checkedResponse('review-001'), checkedResponse('review-002'), response('unchecked-003')
    ]);
    renderPage();
    const filters = screen.getByRole('group', { name: 'Work queue filter' });
    fireEvent.click(within(filters).getByRole('button', { name: 'Review' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search work queue' }),
      { target: { value: 'review-001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss all Review notifications' }));
    await waitFor(() => expect(api.dismissWorkTask).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(workflow.state.dismissedKeys).toEqual(['review:review-001', 'review:review-002']));
    expect(api.dismissWorkTask).toHaveBeenCalledWith('ws-bulk-dismiss', 'review:review-001');
    expect(api.dismissWorkTask).toHaveBeenCalledWith('ws-bulk-dismiss', 'review:review-002');
    expect(api.dismissWorkTask).not.toHaveBeenCalledWith('ws-bulk-dismiss', 'document:unchecked-003');

    fireEvent.click(screen.getByRole('tab', { name: 'Dismissed (2)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore all Review notifications' }));
    await waitFor(() => expect(api.restoreWorkTask).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(workflow.state.dismissedKeys).toEqual([]));
    expect(api.restoreWorkTask).toHaveBeenCalledWith('ws-bulk-dismiss', 'review:review-001');
    expect(api.restoreWorkTask).toHaveBeenCalledWith('ws-bulk-dismiss', 'review:review-002');
    expect(screen.getByRole('tab', { name: 'Dismissed (0)' })).toBeInTheDocument();
  });

  it('keeps failed bulk dismissal items open and gives an accurate partial-failure notice', async () => {
    workflow.activeWorkspaceId = 'ws-bulk-partial';
    workflow.state = makeState([checkedResponse('review-001'), checkedResponse('review-002')]);
    api.dismissWorkTask.mockImplementation((_workspace, taskId) => taskId === 'review:review-002'
      ? Promise.reject(new Error('Temporary server error')) : Promise.resolve());
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss all work notifications' }));
    await waitFor(() => expect(api.dismissWorkTask).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('tab', { name: 'Open (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review Student review-002 response' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review Student review-001 response' })).not.toBeInTheDocument();
  });

  it('loads server-dismissed keys for the current staff member and hides only matching notifications', () => {
    workflow.state = makeState([checkedResponse('review-001'), checkedResponse('review-002')]);
    workflow.state.dismissedKeys = ['review:review-001'];
    renderPage();
    expect(screen.queryByRole('button', { name: 'Review Student review-001 response' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review Student review-002 response' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Dismissed (1)' }));
    expect(screen.getByRole('button', { name: 'Review Student review-001 response' })).toBeInTheDocument();
  });

  it('loads monitor events and dismissed keys from workspace-scoped backend endpoints', async () => {
    workflow.activeWorkspaceId = 'ws-reload';
    workflow.loadFromServer = true;
    workflow.state = makeState([checkedResponse('review-001')]);
    api.getWorkTaskDismissals.mockResolvedValue(['review:review-001']);
    api.getFileMonitorEvents.mockResolvedValue([{ id: 'monitor-1', fileId: 'shared-file', kind: 'ACCESS_UNAVAILABLE',
      observedAt: '2026-09-22T09:00:00Z', responseIds: ['review-001'], teamCodes: ['TEAM-1'] }]);
    renderPage();

    await waitFor(() => expect(api.getFileMonitorEvents).toHaveBeenCalledWith('ws-reload'));
    await waitFor(() => expect(api.getWorkTaskDismissals).toHaveBeenCalledWith('ws-reload'));
    expect(await screen.findByText('PDF access unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review Student review-001 response' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Dismissed (1)' }));
    expect(screen.getByRole('button', { name: 'Review Student review-001 response' })).toBeInTheDocument();
  });

  it('accepts the real selected response in its local drawer and immediately offers archiving', async () => {
    workflow.activeWorkspaceId = 'ws-review';
    workflow.state = makeState([checkedResponse('review-001')]);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review Student review-001 response' }));
    const drawer = await screen.findByRole('dialog', { name: 'Review Student review-001' });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Accept response' }));
    await waitFor(() => expect(workflow.acceptResponse).toHaveBeenCalledWith('review-001'));
    expect(within(drawer).getByRole('button', { name: 'Revoke acceptance' })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Archive response' })).toBeEnabled();
  });

  it('revokes an accepted response through the review drawer and keeps the work page open', async () => {
    workflow.activeWorkspaceId = 'ws-revoke';
    workflow.state = makeState([checkedResponse('accepted-001', { reviewStatus: 'Accepted',
      acceptance: { acceptedAt: submittedAt, acceptedBy: 'Staff', acceptedByRole: 'ADMIN' } })]);
    workflow.state.fileEvents = [{ id: 'rev-event', fileId: 'rev-file', kind: 'CONTENT_CHANGED',
      observedAt: submittedAt, responseIds: ['accepted-001'], teamCodes: ['TEAM-1'] }];
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review affected response for PDF content changed' }));
    const drawer = await screen.findByRole('dialog', { name: 'Review Student accepted-001' });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Revoke acceptance' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Revoke this acceptance?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Revoke acceptance' }));
    await waitFor(() => expect(workflow.revokeAcceptance).toHaveBeenCalledWith('accepted-001'));
    expect(within(drawer).getByRole('button', { name: 'Accept response' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "Today's work" })).toBeInTheDocument();
  });

  it('archives an accepted response from the drawer using the existing server archive flow', async () => {
    workflow.activeWorkspaceId = 'ws-archive';
    workflow.state = makeState([checkedResponse('accepted-001', { reviewStatus: 'Accepted' })]);
    workflow.state.fileEvents = [{ id: 'archive-event', fileId: 'archive-file', kind: 'CONTENT_CHANGED',
      observedAt: submittedAt, responseIds: ['accepted-001'], teamCodes: ['TEAM-1'] }];
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review affected response for PDF content changed' }));
    const drawer = await screen.findByRole('dialog', { name: 'Review Student accepted-001' });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Archive response' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Archive this accepted response?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Archive response' }));
    await waitFor(() => expect(workflow.archiveAttempt).toHaveBeenCalledWith('accepted-001'));
    expect(within(drawer).getByRole('button', { name: 'Archived' })).toBeDisabled();
  });

  it('opens the saved Document Check and scoped file history from the response drawer', async () => {
    workflow.activeWorkspaceId = 'ws-files';
    workflow.state = makeState([checkedResponse('review-001')]);
    workflow.state.deliverables[0].fields[0].type = 'drive';
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review Student review-001 response' }));
    const drawer = await screen.findByRole('dialog', { name: 'Review Student review-001' });
    fireEvent.click(within(drawer).getByRole('button', { name: 'View Document Check' }));
    const check = await screen.findByRole('dialog', { name: /Document Check/ });
    expect(check).toHaveTextContent('Readable PDF with sections requiring a staff decision.');
    await waitFor(() => expect(api.getSubmittedFileHistory).toHaveBeenCalledWith('ws-files', 'review-001', 'documentPdf'));
  });

  it('opens File history when Document Check has not been run', async () => {
    workflow.activeWorkspaceId = 'ws-history';
    workflow.state = makeState([response('unchecked-001')]);
    workflow.state.deliverables[0].fields[0].type = 'drive';
    workflow.state.fileEvents = [{ id: 'history-event', fileId: 'history-file', kind: 'METADATA_CHANGED',
      observedAt: submittedAt, responseIds: ['unchecked-001'], teamCodes: ['TEAM-1'] }];
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review affected response for Drive metadata changed' }));
    const drawer = await screen.findByRole('dialog', { name: 'Review Student unchecked-001' });
    fireEvent.click(within(drawer).getByRole('button', { name: 'File history' }));
    const history = await screen.findByRole('dialog', { name: /File history/ });
    expect(history).toBeInTheDocument();
    await waitFor(() => expect(api.getSubmittedFileHistory).toHaveBeenCalledWith('ws-history', 'unchecked-001', 'documentPdf'));
  });

  it('starts an authorized AI Review from the drawer and shows running state', async () => {
    workflow.activeWorkspaceId = 'ws-ai';
    workflow.state = makeState([checkedResponse('review-001')]);
    workflow.state.deliverables[0].fields[0].aiReviewEnabled = true;
    let finish;
    workflow.runAiReview.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review Student review-001 response' }));
    const drawer = await screen.findByRole('dialog', { name: 'Review Student review-001' });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Run AI Review' }));
    await waitFor(() => expect(api.getAiReviewStatus).toHaveBeenCalled());
    const modal = await screen.findByRole('dialog', { name: 'AI review submission' });
    fireEvent.click(within(modal).getByRole('button', { name: 'Start review' }));
    await waitFor(() => expect(workflow.runAiReview).toHaveBeenCalledWith('ws-ai', 'review-001', null, false, null, expect.any(Function), false));
    expect(screen.getByText(/1 PDF review is running/)).toBeInTheDocument();
    await act(async () => { finish({ ok: true, review: { status: 'COMPLETED', report: { summary: 'Review complete.' } } }); });
    expect(screen.queryByText(/1 PDF review is running/)).not.toBeInTheDocument();
  });

  it('reruns a completed PDF through the API and replaces View AI Review with its newly saved output', async () => {
    workflow.activeWorkspaceId = 'ws-rerun';
    const old = { status: 'COMPLETED', sourceUrl: 'https://drive.google.com/file/d/review-001/view',
      generatedAt: '2026-09-21T08:00:00Z', report: { summary: 'Previously saved AI findings.' } };
    workflow.state = makeState([checkedResponse('review-001', { aiReviewState: old })]);
    workflow.state.deliverables[0].fields[0].aiReviewEnabled = true;
    let finish;
    workflow.runAiReview.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review Student review-001 response' }));
    const drawer = await screen.findByRole('dialog', { name: 'Review Student review-001' });
    expect(within(drawer).getByText('Previously saved AI findings.')).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Rerun AI Review' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Rerun AI Review?' });
    expect(confirmation).toHaveTextContent('sends a new request to Gemini');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Rerun review' }));
    await waitFor(() => expect(workflow.runAiReview).toHaveBeenCalledWith(
      'ws-rerun', 'review-001', null, false, null, expect.any(Function), true));
    expect(within(drawer).getByRole('button', { name: 'AI Review running' })).toBeDisabled();
    expect(within(drawer).getByText('Previously saved AI findings.')).toBeInTheDocument();
    const fresh = { status: 'COMPLETED', fieldId: 'documentPdf', sourceUrl: old.sourceUrl,
      generatedAt: '2026-09-22T09:00:00Z', report: { summary: 'Fresh rerun findings from Gemini.' } };
    await act(async () => { finish({ ok: true, review: fresh }); });
    expect(within(drawer).queryByText('Previously saved AI findings.')).not.toBeInTheDocument();
    expect(within(drawer).getByText('Fresh rerun findings from Gemini.')).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole('button', { name: 'View AI Review' }));
    expect(await screen.findByRole('dialog', { name: 'AI Review: PDF Drive link' }))
      .toHaveTextContent('Fresh rerun findings from Gemini.');
  });

  it('shows quota/rate-limit failures after rerun and never pretends a fresh report was saved', async () => {
    workflow.activeWorkspaceId = 'ws-rerun-error';
    const old = { status: 'COMPLETED', sourceUrl: 'https://drive.google.com/file/d/review-001/view',
      generatedAt: '2026-09-21T08:00:00Z', report: { summary: 'Previously saved findings.' } };
    workflow.state = makeState([checkedResponse('review-001', { aiReviewState: old })]);
    workflow.state.deliverables[0].fields[0].aiReviewEnabled = true;
    workflow.runAiReview.mockResolvedValueOnce({ ok: false, pauseBatch: true,
      error: "Gemini's quota or rate limit was reached.", review: {
        fieldId: 'documentPdf', sourceUrl: old.sourceUrl, status: 'UNCERTAIN',
        failureCode: 'RATE_LIMITED', retryToken: 'retry-1', message: "Gemini's quota or rate limit was reached."
      } });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review Student review-001 response' }));
    const drawer = await screen.findByRole('dialog', { name: 'Review Student review-001' });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Rerun AI Review' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Rerun AI Review?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Rerun review' }));
    await waitFor(() => expect(within(drawer).getByText("Gemini's quota or rate limit was reached.")).toBeInTheDocument());
    expect(within(drawer).queryByRole('button', { name: 'View AI Review' })).not.toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Retry AI review' })).toBeInTheDocument();
    expect(workflow.runAiReview).toHaveBeenCalledTimes(1);
  });

  it('shows persisted previous AI evidence in the work queue after an inconclusive rerun', async () => {
    workflow.activeWorkspaceId = 'ws-rerun-inconclusive';
    const url = 'https://drive.google.com/file/d/review-001/view';
    const previousReport = { summary: 'Substantive previous report.', findings: [{
      source: 'DOCUMENT', issue: 'The PDF identifies itself as an SPMP.',
      evidence: 'Title page: Software Project Management Plan', requirement: ''
    }], missingRequiredSections: [] };
    const old = { status: 'COMPLETED', sourceUrl: url,
      generatedAt: '2026-09-21T08:00:00Z', report: previousReport };
    workflow.state = makeState([checkedResponse('review-001', { aiReviewState: old })]);
    workflow.state.deliverables[0].fields[0].aiReviewEnabled = true;
    workflow.runAiReview.mockResolvedValueOnce({ ok: false, inconclusive: true, uncertain: true,
      error: 'The latest run produced no grounded findings.', review: {
        fieldId: 'documentPdf', status: 'UNCERTAIN', sourceUrl: url,
        failureCode: 'NO_GROUNDED_FINDINGS', retryToken: 'retry-inconclusive',
        previousReport, previousGeneratedAt: '2026-09-21T08:00:00Z',
        message: 'The latest run produced no grounded findings.'
      } });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review Student review-001 response' }));
    const drawer = await screen.findByRole('dialog', { name: 'Review Student review-001' });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Rerun AI Review' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Rerun AI Review?' }))
      .getByRole('button', { name: 'Rerun review' }));
    await waitFor(() => expect(within(drawer).getByText(/Latest AI Review inconclusive/)).toBeInTheDocument());
    fireEvent.click(within(drawer).getByRole('button', { name: 'View previous AI Review' }));
    const saved = await screen.findByRole('dialog', { name: 'AI Review: PDF Drive link' });
    expect(saved).toHaveTextContent('Previously saved AI Review');
    expect(saved).toHaveTextContent('Title page: Software Project Management Plan');
    expect(saved).not.toHaveTextContent('AI review completed.');
  });
});

describe('identity conflicts from the server', () => {
  const conflict = {
    id: 'conflict-1',
    studentRecordId: 'record-1',
    studentNumber: '20-0649-750',
    studentName: 'Deon Holo',
    teamCode: '2526-sem2-it332-07',
    status: 'OPEN',
    createdAt: '2026-04-21T08:30:00+08:00',
    existingIdentity: { googleSubject: 'sub-first', googleEmail: 'rontaghoy@gmail.com', active: true },
    conflictingIdentity: { googleSubject: 'sub-second', googleEmail: 'impostor@gmail.com', active: true }
  };

  beforeEach(() => {
    workflow.state = makeState([]);
    // The page must read the workspace from the workflow context root, as production does.
    workflow.activeWorkspaceId = 'workspace-1';
    workflow.state.openConflicts = [conflict];
    api.getStudentAccountBindings.mockResolvedValue({
      firstClaimLimitation: 'Account ownership is self-declared by the first successful submission.',
      accounts: [{
        studentRecordId: 'record-1',
        studentNumber: '20-0649-750',
        studentName: 'Deon Holo',
        teamCode: '2526-sem2-it332-07',
        status: 'CONFLICT',
        googleSubject: null,
        googleEmail: null,
        candidates: [
          { googleSubject: 'sub-first', googleEmail: 'rontaghoy@gmail.com', active: true },
          { googleSubject: 'sub-second', googleEmail: 'impostor@gmail.com', active: true }
        ]
      }]
    });
  });

  it('renders each open conflict with its Student Record and both competing identities', async () => {
    renderPage();

    const queue = await screen.findByRole('table', { name: "Today's work queue" });
    expect(within(queue).getByText('Identity conflict')).toBeInTheDocument();
    expect(within(queue).getByText(/Deon Holo/)).toBeInTheDocument();
    expect(within(queue).getByText(/20-0649-750/)).toBeInTheDocument();
    expect(within(queue).getByText(/rontaghoy@gmail.com/)).toBeInTheDocument();
    expect(within(queue).getByText(/impostor@gmail.com/)).toBeInTheDocument();
  });

  it('routes conflict review to account management without preselecting a winner', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Review identity conflict for 20-0649-750' }));
    const dialog = await screen.findByRole('dialog', { name: 'Student account management' });
    expect(dialog).toHaveTextContent('Needs review');
    expect(within(dialog).getByRole('radio', { name: /rontaghoy@gmail\.com/i })).not.toBeChecked();
    expect(within(dialog).getByRole('radio', { name: /impostor@gmail\.com/i })).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Recover selected account' })).toBeDisabled();
  });

  it('recovers only the explicitly selected account from an unresolved conflict', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Review identity conflict for 20-0649-750' }));
    const dialog = await screen.findByRole('dialog', { name: 'Student account management' });
    fireEvent.click(within(dialog).getByRole('radio', { name: /rontaghoy@gmail\.com/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Recover selected account' }));
    await waitFor(() => expect(api.recoverStudentAccountBinding)
      .toHaveBeenCalledWith('workspace-1', 'record-1', 'sub-first'));
  });

  it('keeps the conflict listed when account recovery fails', async () => {
    api.recoverStudentAccountBinding.mockRejectedValue(new Error('Admin authorization required.'));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Review identity conflict for 20-0649-750' }));
    const dialog = await screen.findByRole('dialog', { name: 'Student account management' });
    fireEvent.click(within(dialog).getByRole('radio', { name: /rontaghoy@gmail\.com/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Recover selected account' }));
    await waitFor(() => expect(api.recoverStudentAccountBinding).toHaveBeenCalled());
    expect(await screen.findByText('Admin authorization required.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review identity conflict for 20-0649-750' })).toBeInTheDocument();
  });

  it('says the queue is incomplete instead of all clear when conflicts cannot be loaded', async () => {
    workflow.error = 'Identity conflicts service is unavailable.';
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Identity conflicts service is unavailable.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText('All clear for this workspace')).not.toBeInTheDocument();
  });
});
