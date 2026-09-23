import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { ReviewPage } from './ReviewPage.jsx';
import { applyReviewState } from '../lib/backendDomain.js';
import { getIdentityConflicts } from '../lib/api.js';
import { useReducer } from 'react';

const workflow = vi.hoisted(() => ({
  state: null,
  workspaceId: 'workspace-it',
  session: { authenticated: true, email: 'admin@school.edu' },
  runDocumentCheck: vi.fn(),
  runDocumentChecks: vi.fn(),
  getAiReviewStatus: vi.fn(),
  runAiReviews: vi.fn(),
  getSavedAiReview: vi.fn(),
  refreshSession: vi.fn(),
  diagnoseAiReviewAuthFailure: vi.fn(),
  markAccepted: vi.fn(),
  revokeAcceptance: vi.fn(),
  archiveAttempt: vi.fn()
}));

vi.mock('../app/WorkspaceSession.jsx', () => ({
  useWorkspaceSession: () => ({ activeWorkspaceId: workflow.workspaceId, session: workflow.session,
    refreshSession: workflow.refreshSession })
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
  getSubmittedFileHistory: vi.fn().mockResolvedValue({ status: 'UNAVAILABLE', revisions: [], historyMayBeIncomplete: true }),
  getAiReviewStatus: (...args) => workflow.getAiReviewStatus(...args),
  getSavedAiReview: (...args) => workflow.getSavedAiReview(...args)
}));

vi.mock('../lib/reviewDeskClient.js', () => ({
  emptyReviewDesk: () => ({}),
  loadReviewDesk: vi.fn(),
  applyDocumentCheck: (response, report) => report?.fieldId
    ? { ...response, artifactChecks: { ...(response.artifactChecks || {}), [report.fieldId]: report } }
    : { ...response, documentCheck: report },
  applyArtifactAiReview: (response, review) => review?.fieldId
    ? { ...response, artifactAiReviews: { ...(response.artifactAiReviews || {}), [review.fieldId]: review } }
    : { ...response, aiReviewState: review },
  applyReviewMutation: (response, mutation) => applyReviewState(response, mutation),
  diagnoseAiReviewAuthFailure: (...args) => workflow.diagnoseAiReviewAuthFailure(...args),
  runDocumentCheck: (_workspaceId, response, _deliverable, field) => workflow.runDocumentCheck(response.id, field),
  runDocumentChecks: (_workspaceId, targets, _deliverables, options) => workflow.runDocumentChecks(targets, options),
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
        fields: [{ id: 'documentPdf', label: 'PDF Drive Link', type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO', aiReviewEnabled: true }]
      },
      {
        id: 'deliverable-sdd',
        slug: 'week-10-sdd',
        title: 'Software Design Description',
        shortTitle: 'SDD',
        trackerColumn: 'SDD',
        dueAt: '2026-04-25T23:59:00+08:00',
        status: 'Published',
        fields: [{ id: 'documentPdf', label: 'PDF Drive Link', type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO', aiReviewEnabled: true }]
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
          findings: [{
            issue: 'The traceability links in the submitted PDF are incomplete.',
            source: 'DOCUMENT',
            evidence: 'Section 4, requirements matrix',
            requirement: ''
          }],
          missingRequiredSections: [{
            section: 'Requirements traceability matrix',
            source: 'OFFICIAL_TEMPLATE',
            requirement: 'Include a Requirements traceability matrix.'
          }],
          limitations: [],
          suggestedAction: 'Ask the team to connect each requirement to its source and design element.'
        },
        aiReviewState: {
          status: 'COMPLETED',
          generatedAt: checkedAt,
          sourceResponseUpdatedAt: ronSavedAt,
          report: {
            summary: 'The submission describes its requirements, but traceability and interface constraints require manual review.',
            findings: [{
              issue: 'The traceability links in the submitted PDF are incomplete.',
              source: 'DOCUMENT',
              evidence: 'Section 4, requirements matrix',
              requirement: ''
            }],
            missingRequiredSections: [{
              section: 'Requirements traceability matrix',
              source: 'OFFICIAL_TEMPLATE',
              requirement: 'Include a Requirements traceability matrix.'
            }],
            limitations: [],
            suggestedAction: 'Ask the team to connect each requirement to its source and design element.'
          }
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

async function openDeliverableOverview() {
  fireEvent.click(screen.getByRole('button', { name: 'Deliverable overview' }));
  return screen.findByRole('table', { name: 'Deliverables awaiting review' });
}

describe('deliverable-first submission review', () => {
  beforeEach(() => {
    workflow.workspaceId = 'workspace-it';
    workflow.session = { authenticated: true, email: 'admin@school.edu' };
    workflow.state = createState();
    getIdentityConflicts.mockReset().mockResolvedValue([]);
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
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review Pacio, Muriel D. response' }));
    const check = await screen.findByRole('button', { name: 'Check again', exact: true });
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
    expect(screen.getByText('No current AI Review is available for this PDF.')).toBeInTheDocument();
  });

  it('explicitly reruns an already reviewed PDF and updates View AI Review with the new saved output', async () => {
    const ron = workflow.state.attempts.find(item => item.id === 'response-ron-srs');
    const original = ron.aiReviewState.report.summary;
    const fresh = { status: 'COMPLETED', sourceUrl: ron.values.documentPdf,
      sourceResponseUpdatedAt: ron.updatedAt, generatedAt: '2026-09-22T09:00:00Z',
      report: { summary: 'Fresh rerun feedback after Gemini completed.', findings: [],
        missingRequiredSections: [], limitations: [], suggestedAction: 'Verify the updated observations.' } };
    let complete;
    workflow.runAiReviews.mockImplementationOnce(async (_workspace, targets, { onResult }) => {
      await new Promise(resolve => { complete = resolve; });
      onResult(targets[0], { ok: true, review: fresh });
    });
    renderPage('/review?response=response-ron-srs');
    const drawer = await screen.findByRole('dialog', { name: 'Review Taghoy, Ron Luigi F.' });
    expect(within(drawer).getByText(original)).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Rerun AI Review' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Rerun AI Review?' });
    expect(confirmation).toHaveTextContent('sends a new request to Gemini');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Rerun review' }));
    await waitFor(() => expect(workflow.runAiReviews).toHaveBeenCalledTimes(1));
    const [workspace, targets, options] = workflow.runAiReviews.mock.calls[0];
    expect(workspace).toBe('workspace-it');
    expect(targets).toEqual([{ key: 'response-ron-srs:documentPdf', responseId: 'response-ron-srs', fieldId: null }]);
    expect(options.rerunKeys).toEqual({ 'response-ron-srs:documentPdf': true });
    expect(within(drawer).getByRole('button', { name: 'AI Review running' })).toBeDisabled();
    await act(async () => { complete(); });
    await waitFor(() => expect(within(drawer).getByText('Fresh rerun feedback after Gemini completed.')).toBeInTheDocument());
    expect(within(drawer).queryByText(original)).not.toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole('button', { name: 'View AI Review' }));
    expect(screen.getByRole('dialog', { name: 'AI Review: PDF Drive Link' }))
      .toHaveTextContent('Fresh rerun feedback after Gemini completed.');
  });

  it('surfaces quota-limited rerun failures and shows Retry AI review instead of stale View AI Review', async () => {
    const ron = workflow.state.attempts.find(item => item.id === 'response-ron-srs');
    workflow.runAiReviews.mockImplementationOnce(async (_workspace, targets, { onResult }) => {
      onResult(targets[0], { ok: false, pauseBatch: true, uncertain: true,
        error: "Gemini's quota or rate limit was reached.", review: {
          status: 'UNCERTAIN', retryToken: 'retry-current', failureCode: 'RATE_LIMITED',
          sourceUrl: ron.values.documentPdf, sourceResponseUpdatedAt: ron.updatedAt,
          message: "Gemini's quota or rate limit was reached."
        } });
    });
    renderPage('/review?response=response-ron-srs');
    const drawer = await screen.findByRole('dialog', { name: 'Review Taghoy, Ron Luigi F.' });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Rerun AI Review' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Rerun AI Review?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Rerun review' }));
    await waitFor(() => expect(within(drawer).getByText(/Gemini's quota or rate limit was reached/)).toBeInTheDocument());
    expect(within(drawer).queryByRole('button', { name: 'View AI Review' })).not.toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Retry AI review' })).toBeInTheDocument();
    expect(workflow.runAiReviews).toHaveBeenCalledTimes(1);
  });

  it('shows an inconclusive rerun and opens the separately identified previous substantive AI Review', async () => {
    const ron = workflow.state.attempts.find(item => item.id === 'response-ron-srs');
    const previousReport = { summary: 'Previously grounded document finding.', findings: [{
      source: 'DOCUMENT', issue: 'Submitted title differs from the deliverable.',
      evidence: 'Title page: Software Project Management Plan', requirement: ''
    }], missingRequiredSections: [] };
    workflow.runAiReviews.mockImplementationOnce(async (_workspace, targets, { onResult }) => {
      onResult(targets[0], { ok: false, inconclusive: true, uncertain: true,
        error: 'New run produced no grounded findings.', review: {
          status: 'UNCERTAIN', failureCode: 'NO_GROUNDED_FINDINGS', retryToken: 'retry-new',
          sourceUrl: ron.values.documentPdf, sourceResponseUpdatedAt: ron.updatedAt,
          message: 'New run produced no grounded findings.', previousReport,
          previousGeneratedAt: '2026-09-21T08:00:00Z'
        } });
    });
    renderPage('/review?response=response-ron-srs');
    const drawer = await screen.findByRole('dialog', { name: 'Review Taghoy, Ron Luigi F.' });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Rerun AI Review' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Rerun AI Review?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Rerun review' }));
    await waitFor(() => expect(within(drawer).getByText(/Latest AI Review inconclusive/)).toBeInTheDocument());
    expect(within(drawer).getByRole('button', { name: 'Retry AI review' })).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole('button', { name: 'View previous AI Review' }));
    const saved = await screen.findByRole('dialog', { name: 'AI Review: PDF Drive Link' });
    expect(saved).toHaveTextContent('Latest AI Review inconclusive');
    expect(saved).toHaveTextContent('Previously saved AI Review');
    expect(saved).toHaveTextContent('Title page: Software Project Management Plan');
    expect(saved).not.toHaveTextContent('AI review completed.');
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
    const [workspaceId, targets, options] = workflow.runAiReviews.mock.calls[0];
    expect(workspaceId).toBe('workspace-it');
    expect(targets).toEqual([
      { key: 'response-muriel-srs:documentPdf', responseId: 'response-muriel-srs', fieldId: null },
      { key: 'response-ron-srs:documentPdf', responseId: 'response-ron-srs', fieldId: null }
    ]);
    expect(options.retryTokens).toEqual({ 'response-ron-srs:documentPdf': 'ron-retry-token' });
  });

  it('pauses AI Review All on a WildTrack session 401 and offers the existing Google sign-in flow', async () => {
    const muriel = workflow.state.attempts.find(item => item.id === 'response-muriel-srs');
    const ron = workflow.state.attempts.find(item => item.id === 'response-ron-srs');
    muriel.documentCheck = currentDocumentCheck(muriel.updatedAt);
    workflow.state.attempts = [muriel, ron];
    workflow.runAiReviews.mockImplementationOnce(async (_workspace, targets, { onResult }) => {
      onResult(targets[0], { ok: false, pauseBatch: true, authenticationRequired: true,
        error: 'Your WildTrack session expired. Sign out, then sign in with Google again.' });
      return { completed: 1, total: 2, paused: true, authenticationRequired: true };
    });
    workflow.refreshSession.mockResolvedValue({ authenticated: false });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'AI review all' }));
    const confirmation = await screen.findByRole('dialog', { name: 'AI review submissions' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start review' }));

    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('AI review paused'));
    expect(status).toHaveTextContent('1 of 2 PDF artifacts attempted');
    expect(status).toHaveTextContent('1 not attempted');
    expect(status).toHaveTextContent('Your WildTrack session expired');
    expect(within(status).queryByRole('button', { name: 'Review retry options' })).not.toBeInTheDocument();
    fireEvent.click(within(status).getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(workflow.refreshSession).toHaveBeenCalledTimes(1));
    expect(workflow.runAiReviews).toHaveBeenCalledTimes(1);
  });

  it('offers sign-in when the AI Review All preflight receives a session 401 without starting requests', async () => {
    workflow.getAiReviewStatus.mockRejectedValueOnce(Object.assign(
      new Error('AI Review returned HTTP 401.'), { status: 401 }));
    workflow.diagnoseAiReviewAuthFailure.mockResolvedValueOnce({ authenticationRequired: true,
      sessionConfirmed: false, error: 'WildTrack does not recognize this login.' });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'AI review all' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('AI review paused');
    expect(status).toHaveTextContent('0 of');
    expect(within(status).getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(workflow.runAiReviews).not.toHaveBeenCalled();
  });

  it('does not instruct another sign-out when the AI endpoint rejects a confirmed administrator session', async () => {
    workflow.getAiReviewStatus.mockRejectedValueOnce(Object.assign(new Error('HTTP 401'), { status: 401 }));
    workflow.diagnoseAiReviewAuthFailure.mockResolvedValueOnce({ authenticationRequired: false,
      sessionConfirmed: true, error: 'WildTrack still recognizes your Administrator session. AI endpoint rejected the request.' });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'AI review all' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('still recognizes your Administrator session');
    expect(within(status).getByRole('button', { name: 'Check saved reviews' })).toBeInTheDocument();
    expect(within(status).queryByRole('button', { name: /Google/i })).not.toBeInTheDocument();
    expect(workflow.runAiReviews).not.toHaveBeenCalled();
  });

  it('shows live AI batch percentage, the next PDF and reused counts without implying incomplete PDFs were attempted', async () => {
    const muriel = workflow.state.attempts.find(item => item.id === 'response-muriel-srs');
    const ron = workflow.state.attempts.find(item => item.id === 'response-ron-srs');
    muriel.documentCheck = currentDocumentCheck(muriel.updatedAt);
    workflow.state.attempts = [muriel, ron];
    let finish;
    workflow.runAiReviews.mockImplementationOnce(async (_workspace, targets, { onResult }) => {
      onResult(targets[0], { ok: true, review: { status: 'COMPLETED', reused: true } });
      await new Promise(resolve => { finish = resolve; });
      onResult(targets[1], { ok: true, review: { status: 'COMPLETED', reused: false } });
      return { completed: 2, total: 2, paused: false };
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'AI review all' }));
    const confirmation = await screen.findByRole('dialog', { name: 'AI review submissions' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start review' }));
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('1 of 2 PDF artifacts attempted'));
    expect(status).toHaveTextContent('50%');
    expect(status).toHaveTextContent('1 saved reviews reused');
    expect(status).toHaveTextContent('Current PDF: Taghoy, Ron Luigi F.');
    expect(within(status).getByRole('progressbar', { name: 'AI Review batch progress' })).toHaveAttribute('aria-valuenow', '50');
    await act(async () => finish());
    expect(status).toHaveTextContent('100%');
    expect(status).toHaveTextContent('2 of 2 PDF artifacts attempted');
    expect(status).not.toHaveTextContent('not attempted');
    expect(within(status).getByRole('progressbar', { name: 'AI Review batch progress' })).toHaveAttribute('aria-valuenow', '100');
  });

  it('counts inaccessible PDFs separately, keeps reviewing later PDFs, and links each skipped submission', async () => {
    const muriel = workflow.state.attempts.find(item => item.id === 'response-muriel-srs');
    const ron = workflow.state.attempts.find(item => item.id === 'response-ron-srs');
    const later = workflow.state.attempts.find(item => item.id === 'response-muriel-sdd');
    muriel.documentCheck = currentDocumentCheck(muriel.updatedAt);
    later.documentCheck = currentDocumentCheck(later.updatedAt);
    workflow.state.attempts = [muriel, ron, later];
    workflow.runAiReviews.mockImplementationOnce(async (_workspace, targets, { onResult }) => {
      expect(targets).toHaveLength(3);
      onResult(targets[0], { ok: false, notStarted: true, pauseBatch: false,
        error: 'The submitted Drive PDF could not be opened. No AI review was started.' });
      onResult(targets[1], { ok: true, review: { status: 'COMPLETED', reused: false } });
      onResult(targets[2], { ok: false, notStarted: true, pauseBatch: false,
        error: 'The submitted Drive PDF could not be opened. No AI review was started.' });
      return { completed: 3, total: 3, paused: false };
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'AI review all' }));
    const confirmation = await screen.findByRole('dialog', { name: 'AI review submissions' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start review' }));

    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('3 of 3 PDF artifacts attempted'));
    expect(status).toHaveTextContent('AI review finished with items needing attention');
    expect(status).toHaveTextContent('1 review available');
    expect(status).toHaveTextContent('2 skipped: inaccessible PDFs');
    expect(status).not.toHaveTextContent('2 incomplete');
    expect(status).not.toHaveTextContent('AI review paused');
    expect(workflow.runAiReviews).toHaveBeenCalledTimes(1);
    const toggle = within(status).getByRole('button', { name: 'Show skipped inaccessible PDFs (2)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(within(status).getByRole('button', { name: 'Hide skipped inaccessible PDFs (2)' })).toHaveAttribute('aria-expanded', 'true');
    const links = await waitFor(() => within(status).getAllByRole('link', { name: 'Open submitted Drive link' }));
    expect(links).toHaveLength(2);
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      muriel.values.documentPdf, later.values.documentPdf
    ]);
    links.forEach(link => {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
    fireEvent.click(within(status).getAllByRole('button', { name: 'View response' })[1]);
    expect(await screen.findByRole('dialog', { name: 'Review Pacio, Muriel D.' })).toBeInTheDocument();
  });

  it('never opens a stale or unsafe link from a skipped batch after the submitted PDF changes', async () => {
    const muriel = workflow.state.attempts.find(item => item.id === 'response-muriel-srs');
    muriel.documentCheck = currentDocumentCheck(muriel.updatedAt);
    workflow.state.attempts = [muriel];
    workflow.runAiReviews.mockImplementationOnce(async (_workspace, targets, { onResult }) => {
      onResult(targets[0], { ok: false, notStarted: true, pauseBatch: false,
        error: 'Submitted PDF inaccessible.' });
      return { completed: 1, total: 1, paused: false };
    });
    const view = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'AI review all' }));
    const confirmation = await screen.findByRole('dialog', { name: 'AI review submissions' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start review' }));
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('1 skipped: inaccessible PDF'));
    fireEvent.click(within(status).getByRole('button', { name: 'Show skipped inaccessible PDFs (1)' }));
    expect(await waitFor(() => within(status).getByRole('link', { name: 'Open submitted Drive link' }))).toHaveAttribute('href', muriel.values.documentPdf);

    workflow.state = { ...workflow.state, attempts: [{ ...muriel,
      values: { ...muriel.values, documentPdf: 'https://drive.google.com/file/d/new-file/view' } }] };
    view.rerender(pageTree());
    expect(within(status).queryByRole('link', { name: 'Open submitted Drive link' })).not.toBeInTheDocument();
    expect(status).toHaveTextContent('Original submission link changed or is not a valid Drive URL.');
    expect(status).toHaveTextContent('1 skipped: inaccessible PDF');
  });

  it('checks saved AI reports using only per-PDF GETs, replacing stale status with persisted completed and running states', async () => {
    const muriel = workflow.state.attempts.find(item => item.id === 'response-muriel-srs');
    const ron = workflow.state.attempts.find(item => item.id === 'response-ron-srs');
    muriel.documentCheck = currentDocumentCheck(muriel.updatedAt);
    workflow.state.attempts = [muriel, ron];
    workflow.runAiReviews.mockImplementationOnce(async (_workspace, targets, { onResult }) => {
      onResult(targets[0], { ok: false, pauseBatch: true, error: 'The first AI request outcome is unknown.' });
      return { completed: 1, total: 2, paused: true };
    });
    workflow.getSavedAiReview.mockImplementation(async (_workspace, responseId) => responseId === muriel.id
      ? { status: 'COMPLETED', sourceUrl: muriel.values.documentPdf, generatedAt: checkedAt,
        sourceResponseUpdatedAt: muriel.updatedAt,
        report: { summary: 'Saved source-grounded finding.',
          findings: [{ source: 'DOCUMENT', issue: 'The PDF cites a missing actor.', evidence: 'Page 3, section 2.1', requirement: '' }],
          missingRequiredSections: [] } }
      : { status: 'RUNNING', sourceUrl: ron.values.documentPdf, message: 'Review in progress' });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'AI review all' }));
    const confirmation = await screen.findByRole('dialog', { name: 'AI review submissions' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start review' }));
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('1 of 2 PDF artifacts attempted'));
    expect(status).toHaveTextContent('50%');
    expect(status).toHaveTextContent('1 not attempted');
    fireEvent.click(within(status).getByRole('button', { name: 'Check saved reviews' }));
    await waitFor(() => expect(status).toHaveTextContent('2 of 2 saved statuses checked'));
    expect(status).toHaveTextContent('Saved AI Reviews still running');
    expect(status).toHaveTextContent('100%');
    expect(status).toHaveTextContent('1 review available');
    expect(status).toHaveTextContent('1 still running');
    expect(status).toHaveTextContent('Original batch messages');
    expect(status).toHaveTextContent('The first AI request outcome is unknown');
    expect(workflow.getSavedAiReview.mock.calls).toEqual([
      ['workspace-it', muriel.id, null], ['workspace-it', ron.id, null]
    ]);
    expect(workflow.runAiReviews).toHaveBeenCalledTimes(1);
    expect(workflow.state.attempts.find(item => item.id === muriel.id).aiReviewState.report.summary).toBe('Saved source-grounded finding.');
    expect(workflow.state.attempts.find(item => item.id === ron.id).aiReviewState.status).toBe('RUNNING');
  });

  it('shows uncertain saved reports and does not replace their status with a false clean result', async () => {
    const muriel = workflow.state.attempts.find(item => item.id === 'response-muriel-srs');
    muriel.documentCheck = currentDocumentCheck(muriel.updatedAt);
    workflow.state.attempts = [muriel];
    workflow.runAiReviews.mockImplementationOnce(async (_workspace, targets, { onResult }) => {
      onResult(targets[0], { ok: false, pauseBatch: true, error: 'The provider outcome is unknown.' });
      return { completed: 1, total: 1, paused: true };
    });
    workflow.getSavedAiReview.mockResolvedValue({ status: 'UNCERTAIN',
      sourceUrl: muriel.values.documentPdf, failureCode: 'INSUFFICIENT_REVIEW_EVIDENCE',
      message: 'Only one distinct grounded check was verified.' });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'AI review all' }));
    const confirmation = await screen.findByRole('dialog', { name: 'AI review submissions' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start review' }));
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('AI review paused'));
    fireEvent.click(within(status).getByRole('button', { name: 'Check saved reviews' }));
    await waitFor(() => expect(status).toHaveTextContent('1 of 1 saved statuses checked'));
    expect(status).toHaveTextContent('Saved AI Review status checked');
    expect(status).toHaveTextContent('0 reviews available');
    expect(status).toHaveTextContent('1 inconclusive');
    expect(status).toHaveTextContent('Only one distinct grounded check was verified.');
    expect(workflow.state.attempts.find(item => item.id === muriel.id).aiReviewState.status).toBe('UNCERTAIN');
    expect(workflow.runAiReviews).toHaveBeenCalledTimes(1);
  });

  it('stops saved-status GET checks after a 401 and preserves the original failure and Google reconnect option', async () => {
    const muriel = workflow.state.attempts.find(item => item.id === 'response-muriel-srs');
    const ron = workflow.state.attempts.find(item => item.id === 'response-ron-srs');
    muriel.documentCheck = currentDocumentCheck(muriel.updatedAt);
    workflow.state.attempts = [muriel, ron];
    workflow.runAiReviews.mockImplementationOnce(async (_workspace, targets, { onResult }) => {
      onResult(targets[0], { ok: false, pauseBatch: true, error: 'Original POST returned an unknown result.' });
      return { completed: 1, total: 2, paused: true };
    });
    workflow.getSavedAiReview.mockRejectedValueOnce(Object.assign(new Error('GET returned 401'), { status: 401 }));
    workflow.diagnoseAiReviewAuthFailure.mockResolvedValueOnce({ authenticationRequired: true,
      sessionConfirmed: false, error: 'WildTrack session needs Google authentication.' });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'AI review all' }));
    const confirmation = await screen.findByRole('dialog', { name: 'AI review submissions' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start review' }));
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('AI review paused'));
    fireEvent.click(within(status).getByRole('button', { name: 'Check saved reviews' }));
    await waitFor(() => expect(status).toHaveTextContent('1 of 2 saved statuses checked'));
    expect(status).toHaveTextContent('1 not checked');
    expect(status).toHaveTextContent('Original POST returned an unknown result.');
    expect(status).toHaveTextContent('GET returned 401');
    expect(within(status).getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(workflow.getSavedAiReview).toHaveBeenCalledTimes(1);
    expect(workflow.runAiReviews).toHaveBeenCalledTimes(1);
  });

  it('discards a delayed saved-review GET after an account switch and never starts a replacement AI request', async () => {
    const muriel = workflow.state.attempts.find(item => item.id === 'response-muriel-srs');
    muriel.documentCheck = currentDocumentCheck(muriel.updatedAt);
    workflow.state.attempts = [muriel];
    workflow.runAiReviews.mockImplementationOnce(async (_workspace, targets, { onResult }) => {
      onResult(targets[0], { ok: false, pauseBatch: true, error: 'Provider outcome unknown.' });
      return { completed: 1, total: 1, paused: true };
    });
    let resolveSaved;
    workflow.getSavedAiReview.mockImplementationOnce(() => new Promise(resolve => { resolveSaved = resolve; }));
    const page = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'AI review all' }));
    const confirmation = await screen.findByRole('dialog', { name: 'AI review submissions' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start review' }));
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('AI review paused'));
    fireEvent.click(within(status).getByRole('button', { name: 'Check saved reviews' }));
    await waitFor(() => expect(workflow.getSavedAiReview).toHaveBeenCalledExactlyOnceWith('workspace-it', muriel.id, null));
    expect(within(status).getByRole('button', { name: 'Check saved reviews' })).toBeDisabled();

    workflow.session = { authenticated: true, email: 'different-admin@school.edu' };
    page.rerender(pageTree());
    await act(async () => resolveSaved({ status: 'COMPLETED', sourceUrl: muriel.values.documentPdf,
      sourceResponseUpdatedAt: muriel.updatedAt, generatedAt: checkedAt,
      report: { findings: [{ source: 'DOCUMENT', issue: 'A verified finding', evidence: 'Section 3', requirement: '' }] } }));
    expect(workflow.state.attempts.find(item => item.id === muriel.id).aiReviewState).toBeUndefined();
    expect(screen.queryByText('Saved AI Review status check progress')).not.toBeInTheDocument();
    expect(workflow.getSavedAiReview).toHaveBeenCalledTimes(1);
    expect(workflow.runAiReviews).toHaveBeenCalledTimes(1);
  });

  it('opens a compact deliverable queue and keeps only pending SRS responses in the workbench', async () => {
    renderPage();

    const queue = await openDeliverableOverview();
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
    expect(drawer).toHaveTextContent('Project context');
    expect(within(drawer).getByRole('link', { name: 'Open PDF' })).toHaveAttribute(
      'href',
      'https://drive.google.com/file/d/ron-srs/view'
    );
    fireEvent.click(within(drawer).getByRole('button', { name: 'View AI Review' }));
    const aiDialog = screen.getByRole('dialog', { name: 'AI Review: PDF Drive Link' });
    expect(aiDialog).toHaveTextContent('The traceability links in the submitted PDF are incomplete.');
    expect(aiDialog).toHaveTextContent('Requirements traceability matrix');
    expect(aiDialog).toHaveTextContent('AI Review is advisory first-pass feedback');

    fireEvent.change(screen.getByRole('textbox', { name: 'Search submissions' }), { target: { value: 'Ron Luigi' } });
    expect(screen.getByRole('dialog', { name: 'Review Taghoy, Ron Luigi F.' })).toBeInTheDocument();
  });

  it('omits Project context when the selected team has no meaningful project metadata', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review Pacio, Muriel D. response' }));

    const drawer = screen.getByRole('dialog', { name: 'Review Pacio, Muriel D.' });
    expect(within(drawer).queryByText('Project context')).not.toBeInTheDocument();
    expect(within(drawer).queryByText('Project metadata not loaded yet.')).not.toBeInTheDocument();
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
    const confirmation = await screen.findByRole('dialog', { name: 'Check 2 selected PDF artifacts?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start Document Check' }));

    await waitFor(() => expect(workflow.runDocumentChecks).toHaveBeenCalled());
    const [targets, options] = workflow.runDocumentChecks.mock.calls[0];
    expect(targets.map(target => target.response.id)).toEqual(['response-muriel-srs', 'response-ron-srs']);
    expect(options).toEqual(expect.objectContaining({ useDedup: true, onProgress: expect.any(Function), shouldContinue: expect.any(Function) }));
    const completionAlert = await screen.findByRole('status');
    expect(completionAlert).toHaveTextContent('2 of 2 completed | 1 could not be checked');
    expect(completionAlert).toHaveTextContent('Taghoy, Ron Luigi F.: Download is disabled.');
  });

  it('shows a readable live Document Check percentage and batch context without guessing which shared PDF is active', async () => {
    let reportProgress;
    let finish;
    workflow.runDocumentChecks.mockImplementationOnce(async (targets, { onProgress }) => {
      reportProgress = onProgress;
      await new Promise(resolve => { finish = resolve; });
      onProgress({ completed: 2, total: targets.length });
      return { completed: 2, total: targets.length, failed: 0,
        results: targets.map(({ response }) => ({ attemptId: response.id, ok: true })) };
    });
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible responses' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check selected' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Check 2 selected PDF artifacts?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start Document Check' }));
    await waitFor(() => expect(workflow.runDocumentChecks).toHaveBeenCalledTimes(1));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('0%');
    expect(status).toHaveTextContent('0 of 2 completed');
    expect(status).toHaveTextContent('Batch includes: Pacio, Muriel D. / PDF Drive Link');
    expect(status).toHaveTextContent('current file is not reported');
    const progress = within(status).getByRole('progressbar', { name: 'Document Check batch progress' });
    expect(progress).toHaveAttribute('aria-valuenow', '0');
    await act(async () => reportProgress({ completed: 1, total: 2 }));
    expect(status).toHaveTextContent('50%');
    expect(status).toHaveTextContent('1 of 2 completed');
    expect(progress).toHaveAttribute('aria-valuenow', '50');
    await act(async () => finish());
    expect(status).toHaveTextContent('100%');
    expect(status).toHaveTextContent('2 of 2 completed');
    expect(progress).toHaveAttribute('aria-valuenow', '100');
  });

  it('applies every returned deduplicated report to its own response and PDF field', async () => {
    const base = createState();
    const deliverable = base.deliverables.find((item) => item.id === 'deliverable-srs');
    deliverable.fields[0].definitionId = 'field-pdf';
    deliverable.fields.push({ id: 'appendixPdf', definitionId: 'field-appendix', label: 'Appendix PDF',
      type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO', aiReviewEnabled: true });
    const muriel = base.attempts.find((item) => item.id === 'response-muriel-srs');
    const ron = base.attempts.find((item) => item.id === 'response-ron-srs');
    muriel.values.appendixPdf = 'https://drive.google.com/open?id=shared-review-file';
    ron.values.appendixPdf = 'https://drive.google.com/file/d/shared-review-file/view';
    workflow.state = base;
    workflow.runDocumentChecks.mockImplementationOnce(async (targets, { onProgress }) => {
      expect(targets).toHaveLength(4);
      onProgress?.({ completed: 4, total: 4 });
      return {
        completed: 4, total: 4, failed: 0,
        results: targets.map(({ response, field }) => ({
          attemptId: response.id, fieldId: field.definitionId, fieldKey: field.id, ok: true,
          report: { ...currentDocumentCheck(response.updatedAt), fieldId: field.definitionId,
            summary: `Checked ${response.id}:${field.definitionId}` }
        }))
      };
    });

    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible responses' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check selected' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Check 4 selected PDF artifacts?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start Document Check' }));

    await waitFor(() => expect(workflow.runDocumentChecks).toHaveBeenCalledTimes(1));
    expect(workflow.runDocumentChecks.mock.calls[0][1]).toEqual(expect.objectContaining({ useDedup: true }));
    await waitFor(() => {
      const currentMuriel = workflow.state.attempts.find((item) => item.id === muriel.id);
      const currentRon = workflow.state.attempts.find((item) => item.id === ron.id);
      expect(currentMuriel.artifactChecks['field-pdf'].summary).toBe(`Checked ${muriel.id}:field-pdf`);
      expect(currentMuriel.artifactChecks['field-appendix'].summary).toBe(`Checked ${muriel.id}:field-appendix`);
      expect(currentRon.artifactChecks['field-pdf'].summary).toBe(`Checked ${ron.id}:field-pdf`);
      expect(currentRon.artifactChecks['field-appendix'].summary).toBe(`Checked ${ron.id}:field-appendix`);
    });
    expect(screen.getByRole('status')).toHaveTextContent('4 of 4 completed');
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
    const confirmation = await screen.findByRole('dialog', { name: 'Check all 63 unchecked PDF artifacts?' });
    expect(confirmation).not.toHaveTextContent(/three PDFs|archive/i);
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start Document Check' }));

    await waitFor(() => expect(workflow.runDocumentChecks).toHaveBeenCalledTimes(1));
    const requestedTargets = workflow.runDocumentChecks.mock.calls[0][0];
    expect(requestedTargets).toHaveLength(63);
    expect(requestedTargets.map(target => target.response.id)).toContain('response-muriel-srs');
    expect(requestedTargets.map(target => target.response.id)).toContain('unchecked-62');
  });

  it.each(['workspace', 'account'])('discards batch progress and private failures after the %s changes', async (change) => {
    let finish, progress;
    workflow.runDocumentChecks.mockImplementation((_targets, options) => {
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

  it('accepts only the specifically checked response after explicit academic confirmation, not the class or archive', async () => {
    renderPage();
    expect(screen.queryByRole('button', { name: 'Accept All Response' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Pacio, Muriel D. response' }));
    expect(screen.getByRole('button', { name: 'Accept All Response' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Accept All Response' }));
    let confirmation = await screen.findByRole('dialog', { name: 'Accept selected responses?' });
    expect(confirmation).toHaveTextContent('1 selected response: 1 eligible for acceptance, 0 skipped');
    expect(confirmation).toHaveTextContent('Acceptance is an academic decision made by staff, not an automated AI Review result');
    expect(confirmation).toHaveTextContent('This does not archive responses');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
    expect(workflow.markAccepted).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Accept All Response' }));
    confirmation = await screen.findByRole('dialog', { name: 'Accept selected responses?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Accept 1 eligible response' }));
    await waitFor(() => expect(workflow.markAccepted).toHaveBeenCalledExactlyOnceWith('response-muriel-srs'));
    expect(await screen.findByText('Selected responses accepted')).toBeInTheDocument();
    expect(screen.getByText(/1 accepted · 0 failed · 0 skipped of 1 selected/)).toBeInTheDocument();
    expect(screen.getByText(/No responses were archived/)).toBeInTheDocument();
    expect(workflow.archiveAttempt).not.toHaveBeenCalled();
    expect(workflow.state.attempts.find(item => item.id === 'response-muriel-srs')).toMatchObject({ reviewStatus: 'Accepted', archiveStatus: 'Not Archived' });
    expect(workflow.state.attempts.find(item => item.id === 'response-ron-srs').reviewStatus).toBe('Needs Review');
    expect(workflow.state.attempts.find(item => item.id === 'response-muriel-sdd').reviewStatus).toBe('Received');
    expect(workflow.state.attempts.find(item => item.id === 'response-mark-srs').archiveStatus).toBe('Archived');
  });

  it('preserves failed selected responses and reports partial backend acceptance accurately', async () => {
    workflow.markAccepted.mockImplementation(async id => {
      if (id === 'response-ron-srs') throw new Error('Adviser lacks access to this team.');
      return { acceptance: { acceptedAt: checkedAt,
        sourceResponseUpdatedAt: workflow.state.attempts.find(item => item.id === id).updatedAt } };
    });
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible responses' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept All Response' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Accept selected responses?' });
    expect(confirmation).toHaveTextContent('2 selected responses: 2 eligible for acceptance, 0 skipped');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Accept 2 eligible responses' }));

    expect(await screen.findByText('Selected response acceptance completed with exceptions')).toBeInTheDocument();
    expect(screen.getByText(/1 accepted · 1 failed · 0 skipped of 2 selected/)).toBeInTheDocument();
    expect(screen.getByText(/Adviser lacks access to this team/)).toBeInTheDocument();
    expect(workflow.markAccepted).toHaveBeenCalledTimes(2);
    expect(workflow.markAccepted.mock.calls.map(call => call[0]).sort()).toEqual(['response-muriel-srs', 'response-ron-srs']);
    expect(screen.getByRole('checkbox', { name: 'Select Taghoy, Ron Luigi F. response' })).toBeChecked();
    expect(workflow.state.attempts.find(item => item.id === 'response-muriel-srs')).toMatchObject({ reviewStatus: 'Accepted', archiveStatus: 'Not Archived' });
    expect(workflow.state.attempts.find(item => item.id === 'response-ron-srs').reviewStatus).toBe('Needs Review');
    expect(workflow.archiveAttempt).not.toHaveBeenCalled();
  });

  it('skips already archived and unresolved-identity-conflict selections even with the All filter', async () => {
    getIdentityConflicts.mockResolvedValue([{ status: 'OPEN', studentRecordId: 'student-2' }]);
    renderPage();
    fireEvent.click(within(screen.getByRole('group', { name: 'Review filter' })).getByRole('button', { name: 'All' }));
    expect(await screen.findByText('Identity conflict')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible responses' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept All Response' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Accept selected responses?' });
    expect(confirmation).toHaveTextContent('3 selected responses: 1 eligible for acceptance, 2 skipped');
    expect(confirmation).toHaveTextContent('1 archived, 1 identity conflicts');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Accept 1 eligible response' }));
    await waitFor(() => expect(workflow.markAccepted).toHaveBeenCalledExactlyOnceWith('response-muriel-srs'));
    expect(await screen.findByText('Selected response acceptance completed with exceptions')).toBeInTheDocument();
    expect(screen.getByText(/1 accepted · 0 failed · 2 skipped of 3 selected/)).toBeInTheDocument();
    expect(workflow.archiveAttempt).not.toHaveBeenCalled();
    expect(workflow.state.attempts.find(item => item.id === 'response-ron-srs').reviewStatus).toBe('Needs Review');
    expect(workflow.state.attempts.find(item => item.id === 'response-mark-srs').archiveStatus).toBe('Archived');
    expect(workflow.state.attempts.find(item => item.id === 'response-muriel-sdd').reviewStatus).toBe('Received');
  });

  it('disables bulk acceptance when every checked response is already accepted or archived', async () => {
    const accepted = workflow.state.attempts.find(item => item.id === 'response-ron-srs');
    accepted.reviewStatus = 'Accepted';
    accepted.primaryStatus = 'Accepted';
    accepted.acceptance = { acceptedAt: checkedAt, sourceResponseUpdatedAt: accepted.updatedAt };
    renderPage();
    fireEvent.click(within(screen.getByRole('group', { name: 'Review filter' })).getByRole('button', { name: 'All' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Taghoy, Ron Luigi F. response' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Barangan, Mark Lorenz L. response' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept All Response' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Accept selected responses?' });
    expect(confirmation).toHaveTextContent('2 selected responses: 0 eligible for acceptance, 2 skipped');
    expect(confirmation).toHaveTextContent('1 already accepted, 1 archived');
    expect(confirmation).toHaveTextContent('No selected responses are eligible for acceptance.');
    expect(within(confirmation).getByRole('button', { name: 'Accept 0 eligible responses' })).toBeDisabled();
    expect(workflow.markAccepted).not.toHaveBeenCalled();
  });

  it('does not accept any response if the checked selection becomes ineligible before confirmation', async () => {
    let resolveConflicts;
    getIdentityConflicts.mockImplementation(() => new Promise(resolve => { resolveConflicts = resolve; }));
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Taghoy, Ron Luigi F. response' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept All Response' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Accept selected responses?' });
    expect(confirmation).toHaveTextContent('1 eligible for acceptance');
    await act(async () => resolveConflicts([{ status: 'OPEN', studentRecordId: 'student-2' }]));
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Accept 1 eligible response' }));
    expect(await screen.findByText('Selected response acceptance completed with exceptions')).toBeInTheDocument();
    expect(screen.getByText(/0 accepted · 0 failed · 1 skipped of 1 selected/)).toBeInTheDocument();
    expect(workflow.markAccepted).not.toHaveBeenCalled();
  });

  it('uses the same Files icon for Recheck all documents and Check selected', () => {
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Pacio, Muriel D. response' }));
    const recheckIcon = screen.getByRole('button', { name: 'Recheck all documents' }).querySelector('svg');
    const checkSelectedIcon = screen.getByRole('button', { name: 'Check selected' }).querySelector('svg');
    expect(recheckIcon).not.toBeNull();
    expect(recheckIcon.innerHTML).toBe(checkSelectedIcon.innerHTML);
  });

  it('counts received students uniquely so duplicate responses do not hide missing work', async () => {
    const duplicate = {
      ...workflow.state.attempts.find((attempt) => attempt.id === 'response-muriel-srs'),
      id: 'response-muriel-srs-conflict',
      updatedAt: '2026-04-19T09:30:00+08:00'
    };
    workflow.state = { ...workflow.state, attempts: [...workflow.state.attempts, duplicate] };

    renderPage();
    const queue = await openDeliverableOverview();
    const srsRow = within(queue).getByRole('button', { name: 'Open SRS review' }).closest('tr');
    const cells = within(srsRow).getAllByRole('cell').map((cell) => cell.textContent.trim());
    expect(cells[3]).toBe('3');
    expect(cells[4]).toBe('1');
  });

  it('does not require Document Check for link-only deliverables', async () => {
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
    const queue = await openDeliverableOverview();
    const sourceRow = within(queue).getByRole('button', { name: 'Open SourceCode review' }).closest('tr');
    expect(within(sourceRow).getAllByRole('cell')[5]).toHaveTextContent('0');
    fireEvent.click(within(sourceRow).getByRole('button', { name: 'Open SourceCode review' }));
    expect(within(screen.getByRole('table', { name: 'SourceCode submissions' })).getAllByText('Not applicable')).toHaveLength(2);
  });

  it('aggregates two PDF artifacts independently while keeping one response row', async () => {
    const savedAt = '2026-04-19T09:10:00+08:00';
    const deliverable = {
      id: 'deliverable-srs',
      slug: 'mvp-validation',
      title: 'MVP Validation',
      shortTitle: 'MVP Validation',
      trackerColumn: 'SRS',
      dueAt: '2026-04-18T23:59:00+08:00',
      status: 'Published',
      fields: [
        { id: 'validationInstrument', definitionId: 'field-form', label: 'Validation Instrument', type: 'googleForm', pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false },
        { id: 'frameworkModel', definitionId: 'field-framework', label: 'Framework / Model', type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO', aiReviewEnabled: true },
        { id: 'responseSheet', definitionId: 'field-sheet', label: 'Validation Response Sheet', type: 'googleSheet', pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false },
        { id: 'validationHighlights', definitionId: 'field-highlights', label: 'MVP Validation Highlights', type: 'drive', pdfRequired: true, documentCheckPolicy: 'MANUAL', aiReviewEnabled: true },
        { id: 'validationEvidence', definitionId: 'field-folder', label: 'Validation Evidence', type: 'driveFolder', pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false }
      ]
    };
    const response = {
      id: 'response-muriel-srs',
      deliverableId: deliverable.id,
      studentNumber: '23-1001-001',
      studentName: 'Pacio, Muriel D.',
      teamCode: '2526-sem2-it332-01',
      submittedAt: savedAt,
      updatedAt: savedAt,
      values: {
        validationInstrument: 'https://docs.google.com/forms/d/e/form-id/viewform',
        frameworkModel: 'https://drive.google.com/file/d/framework-pdf/view',
        responseSheet: 'https://docs.google.com/spreadsheets/d/sheet-id/edit',
        validationHighlights: 'https://drive.google.com/file/d/highlights-pdf/view',
        validationEvidence: 'https://drive.google.com/drive/folders/evidence-folder'
      },
      reviewStatus: 'Received',
      primaryStatus: 'Received',
      archiveStatus: 'Not Archived',
      flags: ['Received'],
      artifactChecks: {
        'field-framework': currentDocumentCheck(savedAt, {
          fieldId: 'field-framework',
          sourceUrl: 'https://drive.google.com/file/d/framework-pdf/view',
          summary: 'Framework PDF is ready for staff review.'
        })
      },
      artifactAiReviews: {
        'field-framework': {
          fieldId: 'field-framework', status: 'COMPLETED', generatedAt: checkedAt,
          sourceUrl: 'https://drive.google.com/file/d/framework-pdf/view',
          report: { summary: 'Framework reviewed.' }
        },
        'field-highlights': {
          fieldId: 'field-highlights', status: 'UNCERTAIN', generatedAt: checkedAt,
          sourceUrl: 'https://drive.google.com/file/d/highlights-pdf/view', retryToken: 'retry-highlights'
        }
      }
    };
    workflow.state = {
      ...createState(),
      deliverables: [deliverable],
      attempts: [response],
      students: [createState().students[0]]
    };
    renderPage('/review?deliverable=deliverable-srs&response=response-muriel-srs');

    const submissions = screen.getByRole('table', { name: 'MVP Validation submissions' });
    expect(within(submissions).getAllByRole('row')).toHaveLength(2);
    expect(within(submissions).getByText('Not checked')).toBeInTheDocument();
    expect(within(submissions).getByText('Retry required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check all unchecked (1)' })).toBeInTheDocument();

    const drawer = screen.getByRole('dialog', { name: 'Review Pacio, Muriel D.' });
    ['Validation Instrument', 'Framework / Model', 'Validation Response Sheet', 'MVP Validation Highlights', 'Validation Evidence']
      .forEach(label => expect(within(drawer).getByText(label)).toBeInTheDocument());
    expect(within(drawer).getByText('Framework PDF is ready for staff review.')).toBeInTheDocument();
    expect(within(drawer).getAllByRole('button', { name: /Document Check|Check document|Check again/ })).toHaveLength(2);

    fireEvent.click(within(drawer).getByRole('button', { name: 'Check document' }));
    await waitFor(() => expect(workflow.runDocumentCheck).toHaveBeenCalledWith(
      'response-muriel-srs',
      expect.objectContaining({ id: 'validationHighlights', definitionId: 'field-highlights' })
    ));
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

  it('lists one queue row per deliverable when saved state still holds duplicate copies', async () => {
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

    const queue = await openDeliverableOverview();
    expect(within(queue).getAllByRole('button', { name: 'Open SRS review' })).toHaveLength(1);
    expect(within(queue).getAllByRole('button', { name: /^Open \w+ review$/ })).toHaveLength(2);
  });
});
