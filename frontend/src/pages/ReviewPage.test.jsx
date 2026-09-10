import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { ReviewPage } from './ReviewPage.jsx';
import { applyReviewState } from '../lib/backendDomain.js';
import { useReducer } from 'react';

const workflow = vi.hoisted(() => ({
  state: null,
  workspaceId: 'workspace-it',
  session: { authenticated: true, email: 'admin@school.edu' },
  runDocumentCheck: vi.fn(),
  runDocumentChecks: vi.fn(),
  getAiReviewStatus: vi.fn(),
  runAiReviews: vi.fn(),
  markAccepted: vi.fn(),
  revokeAcceptance: vi.fn(),
  archiveAttempt: vi.fn()
}));

vi.mock('../app/WorkspaceSession.jsx', () => ({
  useWorkspaceSession: () => ({ activeWorkspaceId: workflow.workspaceId, session: workflow.session })
}));

vi.mock('../hooks/useWorkspaceResource.js', () => ({
  useWorkspaceResource: () => {
    const [, rerender] = useReducer((value) => value + 1, 0);
    return {
    data: workflow.state,
    setData: (next) => {
      workflow.state = typeof next === 'function' ? next(workflow.state) : next;
      rerender();
    },
    status: 'ready',
    error: ''
    };
  }
}));

vi.mock('../lib/api.js', () => ({
  getIdentityConflicts: vi.fn().mockResolvedValue([]),
  getAiReviewStatus: (...args) => workflow.getAiReviewStatus(...args)
}));

vi.mock('../lib/reviewDeskClient.js', () => ({
  emptyReviewDesk: () => ({}),
  loadReviewDesk: vi.fn(),
  applyDocumentCheck: (response, report) => ({ ...response, documentCheck: report }),
  applyReviewMutation: (response, mutation) => applyReviewState(response, mutation),
  runDocumentCheck: (_workspaceId, response) => workflow.runDocumentCheck(response.id),
  runDocumentChecks: (_workspaceId, responses, _deliverables, options) => (
    workflow.runDocumentChecks(responses.map((response) => response.id), options)
  ),
  runAiReviews: (...args) => workflow.runAiReviews(...args),
  acceptResponse: (...args) => workflow.markAccepted(...args),
  revokeAcceptance: (...args) => workflow.revokeAcceptance(...args)
}));

vi.mock('../lib/archiveClient.js', () => ({
  archiveAttempts: (_workspaceId, responseIds) => workflow.archiveAttempt(responseIds[0])
}));

const checkedAt = '2026-04-20T10:00:00+08:00';

function currentDocumentCheck(sourceResponseUpdatedAt, overrides = {}) {
  return {
    status: 'Current',
    checkedAt,
    sourceResponseUpdatedAt,
    summary: 'The PDF opens and contains readable content, but the official template comparison needs staff attention.',
    redFlags: [],
    missingSections: [],
    metadata: {
      name: 'submission.pdf',
      mimeType: 'application/pdf',
      canDownload: true,
      size: 124000,
      modifiedTime: checkedAt
    },
    document: { readable: true, pageCount: 18, extractedCharacterCount: 18420 },
    templateComparison: { available: true, templateCoverage: 0.82, addedContentRatio: 0.67, unchangedInstructionCount: 2 },
    ...overrides
  };
}

function createState() {
  const murielSavedAt = '2026-04-19T09:10:00+08:00';
  const ronSavedAt = '2026-04-19T11:04:00+08:00';
  const markSavedAt = '2026-04-18T16:30:00+08:00';
  return {
    trackerColumns: [
      { id: 'column-srs', key: 'SRS', label: 'SRS', active: true, order: 1 },
      { id: 'column-sdd', key: 'SDD', label: 'SDD', active: true, order: 2 }
    ],
    students: [
      { id: 'student-1', studentNumber: '23-1001-001', name: 'Pacio, Muriel D.', teamCode: '2526-sem2-it332-01', memberNumber: 1 },
      { id: 'student-2', studentNumber: '23-1001-002', name: 'Taghoy, Ron Luigi F.', teamCode: '2526-sem2-it332-41', memberNumber: 2 },
      { id: 'student-3', studentNumber: '23-1001-003', name: 'Barangan, Mark Lorenz L.', teamCode: '2526-sem2-it332-07', memberNumber: 3 },
      { id: 'student-4', studentNumber: '23-1001-004', name: 'Lim, Michelu Tia A.', teamCode: '2526-sem2-it332-01', memberNumber: 4 }
    ],
    projectMetadata: [
      { groupCode: '2526-sem2-it332-41', projectTitle: 'Capstone Review Workspace', softwareName: 'WildTrack' }
    ],
    deliverables: [
      {
        id: 'deliverable-srs',
        slug: 'week-9-srs',
        title: 'Software Requirements Specification',
        shortTitle: 'SRS',
        trackerColumn: 'SRS',
        dueAt: '2026-04-18T23:59:00+08:00',
        status: 'Published',
        fields: [{ id: 'documentPdf', label: 'PDF Drive Link', pdfRequired: true }]
      },
      {
        id: 'deliverable-sdd',
        slug: 'week-10-sdd',
        title: 'Software Design Description',
        shortTitle: 'SDD',
        trackerColumn: 'SDD',
        dueAt: '2026-04-25T23:59:00+08:00',
        status: 'Published',
        fields: [{ id: 'documentPdf', label: 'PDF Drive Link', pdfRequired: true }]
      }
    ],
    attempts: [
      {
        id: 'response-muriel-srs',
        deliverableId: 'deliverable-srs',
        studentNumber: '23-1001-001',
        studentName: 'Pacio, Muriel D.',
        teamCode: '2526-sem2-it332-01',
        submittedAt: murielSavedAt,
        updatedAt: murielSavedAt,
        values: { documentPdf: 'https://drive.google.com/file/d/muriel-srs/view' },
        reviewStatus: 'Received',
        primaryStatus: 'Received',
        archiveStatus: 'Not Archived',
        fileCheckStatus: 'Not checked',
        flags: ['Received']
      },
      {
        id: 'response-ron-srs',
        deliverableId: 'deliverable-srs',
        studentNumber: '23-1001-002',
        studentName: 'Taghoy, Ron Luigi F.',
        teamCode: '2526-sem2-it332-41',
        submittedAt: ronSavedAt,
        updatedAt: ronSavedAt,
        values: { documentPdf: 'https://drive.google.com/file/d/ron-srs/view' },
        reviewStatus: 'Needs Review',
        primaryStatus: 'Needs Review',
        archiveStatus: 'Not Archived',
        fileCheckStatus: 'COMPLETED',
        flags: ['Template-like', 'Template Headings Missing'],
        documentCheck: currentDocumentCheck(ronSavedAt, {
          summary: 'This is a deliberately long Document Check summary that should remain in the selected response details instead of stretching every row in the submissions table.',
          redFlags: ['Template-like'],
          missingSections: ['Scope', 'Definitions', 'System interfaces', 'Traceability matrix']
        }),
        aiReport: {
          status: 'Current',
          generatedAt: checkedAt,
          sourceResponseUpdatedAt: ronSavedAt,
          summary: 'The submission describes its requirements, but traceability and interface constraints require manual review.',
          flags: ['Weak traceability'],
          missingSections: ['Requirements traceability matrix'],
          suggestedAction: 'Ask the team to connect each requirement to its source and design element.'
        }
      },
      {
        id: 'response-mark-srs',
        deliverableId: 'deliverable-srs',
        studentNumber: '23-1001-003',
        studentName: 'Barangan, Mark Lorenz L.',
        teamCode: '2526-sem2-it332-07',
        submittedAt: markSavedAt,
        updatedAt: markSavedAt,
        values: { documentPdf: 'https://drive.google.com/file/d/mark-srs/view' },
        reviewStatus: 'Accepted',
        primaryStatus: 'Accepted',
        archiveStatus: 'Archived',
        fileCheckStatus: 'COMPLETED',
        flags: ['Accepted'],
        documentCheck: currentDocumentCheck(markSavedAt),
        acceptance: { acceptedBy: 'Sir Ralph Laviste', acceptedByRole: 'Teacher/Admin', acceptedAt: checkedAt }
      },
      {
        id: 'response-muriel-sdd',
        deliverableId: 'deliverable-sdd',
        studentNumber: '23-1001-001',
        studentName: 'Pacio, Muriel D.',
        teamCode: '2526-sem2-it332-01',
        submittedAt: checkedAt,
        updatedAt: checkedAt,
        values: { documentPdf: 'https://drive.google.com/file/d/muriel-sdd/view' },
        reviewStatus: 'Received',
        primaryStatus: 'Received',
        archiveStatus: 'Not Archived',
        fileCheckStatus: 'Not checked',
        flags: ['Received']
      }
    ]
  };
}

function pageTree(initialEntry = '/review') {
  return (
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ModalsProvider>
        <Notifications />
        <MemoryRouter initialEntries={[initialEntry]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <ReviewPage />
        </MemoryRouter>
      </ModalsProvider>
    </MantineProvider>
  );
}

function renderPage(initialEntry = '/review') {
  return render(pageTree(initialEntry));
}

describe('deliverable-first submission review', () => {
  beforeEach(() => {
    workflow.workspaceId = 'workspace-it';
    workflow.session = { authenticated: true, email: 'admin@school.edu' };
    workflow.state = createState();
    Object.values(workflow).forEach((value) => value?.mockReset?.());
    workflow.runDocumentCheck.mockResolvedValue({ ok: true });
    workflow.runDocumentChecks.mockImplementation(async (ids, { onProgress } = {}) => {
      onProgress?.({ completed: ids.length, total: ids.length });
      return { completed: ids.length, total: ids.length, failed: 0 };
    });
    workflow.getAiReviewStatus.mockResolvedValue({ configured: true, message: 'Gemini connected.' });
    workflow.runAiReviews.mockResolvedValue(undefined);
    workflow.archiveAttempt.mockResolvedValue({ ok: true, archived: 1 });
    workflow.markAccepted.mockImplementation(async (id) => ({
      feedback: [],
      acceptance: {
        acceptedBy: 'teacher@example.edu',
        acceptedByRole: 'Teacher/Admin',
        acceptedAt: checkedAt,
        sourceResponseUpdatedAt: workflow.state.attempts.find((attempt) => attempt.id === id).updatedAt
      }
    }));
  });

  it('shows pending and failed single document checks without opening a success report', async () => {
    let finish;
    workflow.runDocumentCheck.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    renderPage('/review?response=response-muriel-srs');
    const check = screen.getByRole('button', { name: 'Check document', exact: true });
    fireEvent.click(check);
    expect(check).toBeDisabled();
    await act(async () => finish({ ok: false, error: 'Document service unavailable. Try again.' }));
    expect(await screen.findByText('Document service unavailable. Try again.')).toBeVisible();
    expect(check).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Close Document Check details' })).not.toBeInTheDocument();
  });

  it('explains unavailable AI review without inventing a saved AI report', async () => {
    const response = workflow.state.attempts.find(item => item.id === 'response-muriel-srs');
    response.documentCheck = currentDocumentCheck(response.updatedAt);
    workflow.getAiReviewStatus.mockResolvedValue({ configured: false, message: 'AI Review is not connected yet.' });
    renderPage('/review?response=response-muriel-srs');
    fireEvent.click(screen.getByRole('button', { name: 'Run AI Review' }));
    expect(await screen.findByText(/AI Review is not connected yet/)).toBeInTheDocument();
    expect(screen.getByText('No current AI Review is available for this response.')).toBeInTheDocument();
  });

  it('AI review all carries retry tokens only for retry-required responses in a mixed batch', async () => {
    const muriel = workflow.state.attempts.find(item => item.id === 'response-muriel-srs');
    const ron = workflow.state.attempts.find(item => item.id === 'response-ron-srs');
    muriel.documentCheck = currentDocumentCheck(muriel.updatedAt);
    ron.aiReport = null;
    ron.aiReviewState = {
      status: 'UNCERTAIN',
      sourceResponseUpdatedAt: ron.updatedAt,
      retryToken: 'ron-retry-token',
      message: 'The previous provider request has an uncertain outcome.'
    };
    workflow.state.attempts = [muriel, ron];

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'AI review all' }));
    const confirmation = await screen.findByRole('dialog', { name: 'AI review submissions' });
    expect(confirmation).toHaveTextContent('1 review needs an explicit retry');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start / retry reviews' }));

    await waitFor(() => expect(workflow.runAiReviews).toHaveBeenCalledTimes(1));
    const [workspaceId, ids, options] = workflow.runAiReviews.mock.calls[0];
    expect(workspaceId).toBe('workspace-it');
    expect(ids).toEqual(['response-muriel-srs', 'response-ron-srs']);
    expect(options.retryTokens).toEqual({ 'response-ron-srs': 'ron-retry-token' });
  });

  it('starts with a compact deliverable queue and only pending SRS responses', () => {
    renderPage();

    const queue = screen.getByRole('table', { name: 'Deliverables awaiting review' });
    const srsRow = within(queue).getByRole('button', { name: 'Open SRS review' }).closest('tr');
    expect(within(srsRow).getAllByRole('cell').map((cell) => cell.textContent.trim())).toEqual([
      'SRSSoftware Requirements Specification',
      'Apr 18, 2026',
      '4',
      '3',
      '1',
      '1',
      '2',
      '1',
      '1'
    ]);

    const submissions = screen.getByRole('table', { name: 'SRS submissions' });
    expect(within(submissions).getByText('Pacio, Muriel D.')).toBeInTheDocument();
    expect(within(submissions).getByText('Taghoy, Ron Luigi F.')).toBeInTheDocument();
    expect(within(submissions).queryByText('Barangan, Mark Lorenz L.')).not.toBeInTheDocument();
    within(submissions).getAllByText('Not checked').forEach((label) => {
      expect(label.closest('.wt-status-indicator')).toHaveAttribute('data-tone', 'neutral');
    });
  });

  it('keeps every deliverable chevron at one fixed size regardless of label length', () => {
    renderPage();

    const chevrons = document.querySelectorAll('.wt-review-deliverable-chevron');
    expect(chevrons.length).toBeGreaterThan(1);
    chevrons.forEach((chevron) => {
      expect(chevron).toHaveClass('wt-review-deliverable-chevron');
      expect(chevron).toHaveAttribute('width', '16');
      expect(chevron).toHaveAttribute('height', '16');
    });
  });

  it('keeps long reports in a selected-response drawer and preserves selection while searching', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review Taghoy, Ron Luigi F. response' }));

    const drawer = screen.getByRole('dialog', { name: 'Review Taghoy, Ron Luigi F.' });
    expect(drawer).toHaveTextContent('This is a deliberately long Document Check summary');
    expect(drawer).toHaveTextContent('The submission describes its requirements');
    expect(within(drawer).getByRole('link', { name: 'Open submitted file' })).toHaveAttribute(
      'href',
      'https://drive.google.com/file/d/ron-srs/view'
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Search submissions' }), { target: { value: 'Ron Luigi' } });
    expect(screen.getByRole('dialog', { name: 'Review Taghoy, Ron Luigi F.' })).toBeInTheDocument();
  });

  it('checks selected responses as a non-blocking batch and reports completion', async () => {
    workflow.runDocumentChecks.mockImplementationOnce(async (ids, { onProgress } = {}) => {
      onProgress?.({ completed: ids.length, total: ids.length });
      return {
        completed: ids.length,
        total: ids.length,
        failed: 1,
        results: [
          { attemptId: 'response-ron-srs', ok: false, error: 'Download is disabled.' },
          { attemptId: 'response-muriel-srs', ok: true }
        ]
      };
    });
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible responses' }));
    expect(screen.getByText('2 responses selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Check selected' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Check 2 selected documents?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start Document Check' }));

    await waitFor(() => expect(workflow.runDocumentChecks).toHaveBeenCalledWith(
      ['response-ron-srs', 'response-muriel-srs'],
      expect.objectContaining({ onProgress: expect.any(Function) })
    ));
    const completionAlert = await screen.findByRole('status');
    expect(completionAlert).toHaveTextContent('2 of 2 completed | 1 could not be checked');
    expect(completionAlert).toHaveTextContent('Taghoy, Ron Luigi F.: Download is disabled.');
  });

  it('checks every unchecked response for the selected deliverable in one action', async () => {
    const base = createState();
    const unchecked = Array.from({ length: 62 }, (_, index) => ({
      id: `unchecked-${index + 1}`,
      deliverableId: 'deliverable-srs',
      studentNumber: `23-9000-${String(index + 1).padStart(3, '0')}`,
      studentName: `Queue Student ${index + 1}`,
      teamCode: `2526-sem2-it332-${String(Math.floor(index / 5) + 1).padStart(2, '0')}`,
      submittedAt: '2026-04-18T12:00:00+08:00',
      updatedAt: `2026-04-18T12:${String(index % 60).padStart(2, '0')}:00+08:00`,
      values: { documentPdf: `https://drive.google.com/file/d/unchecked-${index + 1}/view` },
      reviewStatus: 'Received',
      primaryStatus: 'Received',
      archiveStatus: 'Not Archived',
      fileCheckStatus: 'Not checked',
      flags: ['Received']
    }));
    workflow.state = {
      ...base,
      students: [
        ...base.students,
        ...unchecked.map((response, index) => ({
          id: `queue-student-${index + 1}`,
          studentNumber: response.studentNumber,
          name: response.studentName,
          teamCode: response.teamCode,
          memberNumber: (index % 5) + 1
        }))
      ],
      attempts: [...base.attempts, ...unchecked]
    };
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Check all unchecked (63)' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Check all 63 unchecked documents?' });
    expect(confirmation).not.toHaveTextContent(/three PDFs|archive/i);
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start Document Check' }));

    await waitFor(() => expect(workflow.runDocumentChecks).toHaveBeenCalledTimes(1));
    const requestedIds = workflow.runDocumentChecks.mock.calls[0][0];
    expect(requestedIds).toHaveLength(63);
    expect(requestedIds).toContain('response-muriel-srs');
    expect(requestedIds).toContain('unchecked-62');
  });

  it.each(['workspace', 'account'])('discards batch progress and private failures after the %s changes', async (change) => {
    let finish, progress;
    workflow.runDocumentChecks.mockImplementation((_ids, options) => {
      progress = options.onProgress;
      return new Promise(resolve => { finish = resolve; });
    });
    const view = renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible responses' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check selected' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start Document Check' }));
    expect(screen.getByRole('status')).toHaveTextContent('Checking documents');
    if (change === 'workspace') workflow.workspaceId = 'workspace-cs';
    else workflow.session = { authenticated: true, email: 'other@school.edu' };
    view.rerender(pageTree('/review'));
    await act(async () => {
      progress({ completed: 2, total: 2 });
      finish({ completed: 2, total: 2, failed: 1, results: [{ attemptId: 'response-ron-srs', ok: false, error: 'Old workspace private failure' }] });
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(/Old workspace private failure/)).not.toBeInTheDocument();
  });

  it('keeps 318 responses in one compact submissions table instead of creating response cards', () => {
    const students = Array.from({ length: 318 }, (_, index) => ({
      id: `student-${index + 1}`,
      studentNumber: `23-${String(index + 1).padStart(4, '0')}-001`,
      name: `Student ${String(index + 1).padStart(3, '0')}`,
      teamCode: `2526-sem2-it332-${String(Math.floor(index / 5) + 1).padStart(2, '0')}`,
      memberNumber: (index % 5) + 1
    }));
    const deliverable = createState().deliverables[0];
    workflow.state = {
      ...createState(),
      students,
      deliverables: [deliverable],
      attempts: students.map((student, index) => ({
        id: `response-${index + 1}`,
        deliverableId: deliverable.id,
        studentNumber: student.studentNumber,
        studentName: student.name,
        teamCode: student.teamCode,
        submittedAt: '2026-04-18T12:00:00+08:00',
        updatedAt: `2026-04-18T12:${String(index % 60).padStart(2, '0')}:00+08:00`,
        values: { documentPdf: `https://drive.google.com/file/d/response-${index + 1}/view` },
        reviewStatus: 'Received',
        primaryStatus: 'Received',
        archiveStatus: 'Not Archived',
        fileCheckStatus: 'Not checked',
        flags: ['Received']
      }))
    };

    renderPage();
    const table = screen.getByRole('table', { name: 'SRS submissions' });
    expect(within(table).getAllByRole('row')).toHaveLength(51);
    expect(screen.getByText('Showing 1-50 of 318')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 7')).toBeInTheDocument();
  });

  it('removes an accepted response from the active queue and confirms one archive record honestly', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review Pacio, Muriel D. response' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Review Pacio, Muriel D.' })).getByRole('button', { name: 'Accept response' }));
    expect(workflow.markAccepted).toHaveBeenCalledWith('response-muriel-srs');

    await waitFor(() => expect(within(screen.getByRole('table', { name: 'SRS submissions' })).queryByText('Pacio, Muriel D.')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Review Pacio, Muriel D.' })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog', { name: 'Review Pacio, Muriel D.' })).getByRole('button', { name: 'Archive response' })).toBeEnabled();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Review Pacio, Muriel D.' })).getByRole('button', { name: 'Archive response' }));
    const archiveConfirmation = await screen.findByRole('dialog', { name: 'Archive this accepted response?' });
    expect(archiveConfirmation).toHaveTextContent('one archive metadata record');
    expect(archiveConfirmation).toHaveTextContent('Independent PDF storage is not connected yet');
    fireEvent.click(within(archiveConfirmation).getByRole('button', { name: 'Archive response' }));
    await waitFor(() => expect(workflow.archiveAttempt).toHaveBeenCalledWith('response-muriel-srs'));

    fireEvent.click(screen.getByRole('button', { name: 'Accepted' }));
    expect(within(screen.getByRole('table', { name: 'SRS submissions' })).getByText('Pacio, Muriel D.')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'SRS submissions' })).getByText('Barangan, Mark Lorenz L.')).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('group', { name: 'Review filter' })).getByRole('button', { name: 'Archived' }));
    expect(within(screen.getByRole('table', { name: 'SRS submissions' })).getByText('Barangan, Mark Lorenz L.')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'SRS submissions' })).getByText('Pacio, Muriel D.')).toBeInTheDocument();
  });

  it('counts received students uniquely so duplicate responses do not hide missing work', () => {
    const duplicate = {
      ...workflow.state.attempts.find((attempt) => attempt.id === 'response-muriel-srs'),
      id: 'response-muriel-srs-conflict',
      updatedAt: '2026-04-19T09:30:00+08:00'
    };
    workflow.state = { ...workflow.state, attempts: [...workflow.state.attempts, duplicate] };

    renderPage();
    const queue = screen.getByRole('table', { name: 'Deliverables awaiting review' });
    const srsRow = within(queue).getByRole('button', { name: 'Open SRS review' }).closest('tr');
    const cells = within(srsRow).getAllByRole('cell').map((cell) => cell.textContent.trim());
    expect(cells[3]).toBe('3');
    expect(cells[4]).toBe('1');
  });

  it('does not require Document Check for link-only deliverables', () => {
    const deliverable = {
      id: 'deliverable-source',
      slug: 'source-code',
      title: 'Source Code',
      shortTitle: 'SourceCode',
      trackerColumn: 'SourceCode',
      dueAt: '2026-05-30T23:59:00+08:00',
      status: 'Published',
      fields: [{ id: 'repositoryUrl', label: 'Repository link', type: 'url' }]
    };
    workflow.state = {
      ...workflow.state,
      deliverables: [...workflow.state.deliverables, deliverable],
      attempts: [...workflow.state.attempts, {
        id: 'response-muriel-source',
        deliverableId: deliverable.id,
        studentNumber: '23-1001-001',
        studentName: 'Pacio, Muriel D.',
        teamCode: '2526-sem2-it332-01',
        submittedAt: checkedAt,
        updatedAt: checkedAt,
        values: { repositoryUrl: 'https://github.com/example/project' },
        reviewStatus: 'Received',
        primaryStatus: 'Received',
        archiveStatus: 'Not Archived',
        flags: ['Received']
      }]
    };

    renderPage();
    const queue = screen.getByRole('table', { name: 'Deliverables awaiting review' });
    const sourceRow = within(queue).getByRole('button', { name: 'Open SourceCode review' }).closest('tr');
    expect(within(sourceRow).getAllByRole('cell')[5]).toHaveTextContent('0');
    fireEvent.click(within(sourceRow).getByRole('button', { name: 'Open SourceCode review' }));
    expect(within(screen.getByRole('table', { name: 'SourceCode submissions' })).getByText('Not applicable')).toBeInTheDocument();
  });

  it('opens an exact linked response in its deliverable context', () => {
    renderPage('/review?deliverable=deliverable-srs&response=response-ron-srs');

    expect(screen.getByRole('dialog', { name: 'Review Taghoy, Ron Luigi F.' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'SRS submissions' })).toBeInTheDocument();
  });

  it('opens a linked response after its server data arrives', async () => {
    const loaded = workflow.state;
    workflow.state = { ...loaded, attempts: [], deliverables: [] };
    const entry = '/review?response=response-ron-srs';
    const view = renderPage(entry);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    workflow.state = loaded;
    view.rerender(pageTree(entry));
    expect(await screen.findByRole('dialog', { name: 'Review Taghoy, Ron Luigi F.' })).toBeInTheDocument();
  });

  it('lists one queue row per deliverable when saved state still holds duplicate copies', () => {
    workflow.state = {
      ...workflow.state,
      deliverables: [
        ...workflow.state.deliverables,
        {
          id: '55555555-5555-4555-8555-555555555555',
          slug: 'srs',
          title: 'SRS Submission',
          shortTitle: 'SRS',
          trackerColumn: 'SRS',
          dueAt: '2026-04-18T23:59:00+08:00',
          status: 'Published',
          fields: [{ id: 'documentPdf', label: 'PDF Drive Link', pdfRequired: true }]
        },
        {
          id: 'deliv-generated-1780000000004',
          slug: 'sdd-submission',
          title: 'SDD Submission',
          shortTitle: 'SDD',
          trackerColumn: 'SDD',
          dueAt: '2026-04-25T23:59:00+08:00',
          status: 'Published',
          fields: [{ id: 'documentPdf', label: 'PDF Drive Link', pdfRequired: true }]
        }
      ]
    };

    renderPage();

    const queue = screen.getByRole('table', { name: 'Deliverables awaiting review' });
    expect(within(queue).getAllByRole('button', { name: 'Open SRS review' })).toHaveLength(1);
    expect(within(queue).getAllByRole('button', { name: /^Open \w+ review$/ })).toHaveLength(2);
  });
});
