import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications, notifications } from '@mantine/notifications';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { ReviewPage } from './ReviewPage.jsx';
import { getIdentityConflicts, getLatestAiReviewBatch, getAiReviewBatch, prepareAiReviewBatch, startAiReviewBatch, resumeAiReviewBatch, stopAiReviewBatch, cancelAiReviewBatchPreparation } from '../lib/api.js';
import { applyReviewState } from '../lib/backendDomain.js';
import { useCallback, useReducer } from 'react';

const workflow = vi.hoisted(() => ({
  state: null,
  workspaceId: 'workspace-it',
  session: { authenticated: true, email: 'admin@school.edu' },
  reload: vi.fn(),
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

vi.mock('../hooks/useWorkspaceResource.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { useWorkspaceResource: (...args) => {
    if (args[3] === 'ai-review-batch') return actual.useWorkspaceResource(...args);
    const [, rerender] = useReducer((value) => value + 1, 0);
    const reload = useCallback(async () => {
      const fresh = await workflow.reload();
      if (fresh) { workflow.state = fresh; rerender(); }
      return fresh;
    }, [rerender]);
    return {
    reload,
    data: workflow.state,
    setData: (next) => {
      workflow.state = typeof next === 'function' ? next(workflow.state) : next;
      rerender();
    },
    status: 'ready',
    error: ''
    };
  }
  };
});

vi.mock('../lib/api.js', () => ({
  getIdentityConflicts: vi.fn().mockResolvedValue([]),
  getAiReviewStatus: (...args) => workflow.getAiReviewStatus(...args),
  getLatestAiReviewBatch: vi.fn().mockResolvedValue(null),
  getAiReviewBatch: vi.fn().mockResolvedValue(null),
  prepareAiReviewBatch: vi.fn().mockResolvedValue(null),
  startAiReviewBatch: vi.fn().mockResolvedValue(null),
  resumeAiReviewBatch: vi.fn().mockResolvedValue(null),
  stopAiReviewBatch: vi.fn().mockResolvedValue(null),
  cancelAiReviewBatchPreparation: vi.fn().mockResolvedValue(null),

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

function renderPage(initialEntry = '/review?deliverable=deliverable-srs') {
  return render(pageTree(initialEntry));
}

async function startPrecheck() {
  fireEvent.click(screen.getByRole('button', { name: 'AI review all' }));
  const confirmation = await screen.findByRole('dialog', { name: 'Prepare AI Review?' });
  fireEvent.click(within(confirmation).getByRole('button', { name: 'Start precheck' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Prepare AI Review?' })).not.toBeInTheDocument());
}

async function openBatchConfirmation() {
  await startPrecheck();
  fireEvent.click(await screen.findByRole('button', { name: 'Choose review scope' }));
  return screen.findByRole('dialog', { name: 'AI review submissions' });
}

async function openDeliverableOverview() {
  fireEvent.click(screen.getByRole('button', { name: 'Deliverable overview' }));
  return screen.findByRole('table', { name: 'Deliverables awaiting review' });
}

async function chooseAllDeliverables() {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  fireEvent.click(screen.getByRole('textbox', { name: 'Deliverable' }));
  fireEvent.click(await screen.findByRole('option', { name: 'All deliverables' }));
  return screen.getByRole('table', { name: 'All deliverables submissions' });
}

describe('deliverable-first submission review', () => {
  beforeEach(() => {
    notifications.clean();

    getLatestAiReviewBatch.mockReset().mockResolvedValue(null);
    getAiReviewBatch.mockReset().mockResolvedValue(null);
    prepareAiReviewBatch.mockReset().mockResolvedValue(null);
    startAiReviewBatch.mockReset().mockResolvedValue(null);
    resumeAiReviewBatch.mockReset().mockResolvedValue(null);
    stopAiReviewBatch.mockReset().mockResolvedValue(null);
    cancelAiReviewBatchPreparation.mockReset().mockResolvedValue(null);

    workflow.workspaceId = 'workspace-it';
    workflow.session = { authenticated: true, email: 'admin@school.edu' };
    workflow.state = createState();
    getIdentityConflicts.mockReset().mockResolvedValue([]);
    Object.values(workflow).forEach((value) => value?.mockReset?.());
    workflow.reload.mockImplementation(async () => workflow.state);
    workflow.runDocumentCheck.mockResolvedValue({ ok: true });
    workflow.runDocumentChecks.mockImplementation(async (ids, { onProgress } = {}) => {
      onProgress?.({ completed: ids.length, total: ids.length });
      return { completed: ids.length, total: ids.length, failed: 0 };
    });
    workflow.getAiReviewStatus.mockResolvedValue({ configured: true, message: 'Gemini connected.' });
    workflow.runAiReviews.mockResolvedValue(undefined);
    workflow.archiveAttempt.mockResolvedValue({ ok: true, archived: 0, queued: 1, records: [{ captureState: 'QUEUED' }] });
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


  function completedBatch(entries) {
    return { id: 'completed-current', state: 'COMPLETED', version: 11, entries,
      totalPdfs: entries.length, selectedDocuments: entries.length, uniqueDocuments: entries.length,
      completedDocuments: entries.length, pendingDocuments: 0, message: 'Saved results are available.' };
  }

  function savedEntry(responseId = 'response-ron-srs', fieldId = null, sourceUrl = 'https://drive.google.com/file/d/ron-srs/view') {
    return { target: { responseId, fieldId }, preview: { category: 'FAILED', key: `${responseId}:${fieldId}`, sourceUrl },
      identity: { sourceUrl }, phase: 'DONE', resultStatus: 'COMPLETED', error: '' };
  }

  function expectNoAiRequests() {
    expect(prepareAiReviewBatch).not.toHaveBeenCalled();
    expect(startAiReviewBatch).not.toHaveBeenCalled();
    expect(resumeAiReviewBatch).not.toHaveBeenCalled();
    expect(workflow.runAiReviews).not.toHaveBeenCalled();
  }

  it('sorts newest submissions by default and reverses individual column headers', () => {
    renderPage();
    const table = screen.getByRole('table', { name: 'SRS submissions' });
    const names = () => within(table).getAllByRole('row').slice(1).map((row) => within(row).getByRole('button', { name: /Review .* response/ }).textContent);
    expect(names()[0]).toContain('Taghoy, Ron Luigi F.');

    const sort = within(table).getByRole('button', { name: 'Sort by Submitted' });
    expect(sort.closest('th')).toHaveAttribute('aria-sort', 'descending');
    fireEvent.click(sort);
    expect(names()[0]).toContain('Pacio, Muriel D.');
    expect(sort.closest('th')).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(within(table).getByRole('button', { name: 'Sort by Student' }));
    expect(names()[0]).toContain('Pacio, Muriel D.');
    fireEvent.click(within(table).getByRole('button', { name: 'Sort by Student' }));
    expect(names()[0]).toContain('Taghoy, Ron Luigi F.');
    expect(sort.closest('th')).not.toHaveAttribute('aria-sort');
    expectNoAiRequests();
  });

  it('defaults to all deliverables when no deep link specifies a scope', () => {
    renderPage('/review');
    expect(screen.getByRole('table', { name: 'All deliverables submissions' })).toBeInTheDocument();
  });

  it('combines deliverables with the correct per-row status, drawer and PDF', async () => {
    workflow.state.deliverables[1].fields[0].documentCheckPolicy = 'OFF';
    workflow.state.deliverables[1].fields[0].aiReviewEnabled = false;
    renderPage();
    const table = await chooseAllDeliverables();
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByRole('button', { name: 'Sort by Deliverable' })).toBeInTheDocument();
    const sdd = within(table).getAllByRole('row').find(row => within(row).queryByText('SDD', { exact: true }));
    expect(within(sdd).getAllByText('Not applicable')).toHaveLength(2);
    fireEvent.click(within(sdd).getByRole('button', { name: 'Review Pacio, Muriel D. response' }));
    const drawer = await screen.findByRole('dialog', { name: 'Review Pacio, Muriel D.' });
    expect(drawer).toHaveTextContent('SDD response');
    expect(within(drawer).getByRole('link', { name: 'Open PDF' })).toHaveAttribute('href', 'https://drive.google.com/file/d/muriel-sdd/view');
    expectNoAiRequests();
  });

  it('accepts only the selected response IDs across deliverables in the combined view', async () => {
    renderPage();
    const table = await chooseAllDeliverables();
    const rows = within(table).getAllByRole('row').filter(row => within(row).queryByText('Pacio, Muriel D.'));
    expect(rows).toHaveLength(2);
    rows.forEach(row => fireEvent.click(within(row).getByRole('checkbox')));
    fireEvent.click(screen.getByRole('button', { name: 'Accept All Response' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Accept selected responses?' });
    expect(confirmation).toHaveTextContent('2 selected responses: 2 eligible for acceptance, 0 skipped');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Accept 2 eligible responses' }));
    await screen.findByText('Selected responses accepted');
    expect(workflow.markAccepted.mock.calls.map(call => call[0]).sort()).toEqual(['response-muriel-sdd', 'response-muriel-srs']);
    expect(workflow.state.attempts.find(item => item.id === 'response-ron-srs').reviewStatus).toBe('Needs Review');
    expect(workflow.archiveAttempt).not.toHaveBeenCalled();
    expectNoAiRequests();
  });

  it('opens a freshly saved batch review even when its preparation snapshot was FAILED', async () => {
    const fresh = structuredClone(workflow.state);
    fresh.attempts.find(item => item.id === 'response-ron-srs').aiReviewState.report = {
      findings: [{ issue: 'New saved review result', source: 'DOCUMENT', evidence: 'Exact extracted PDF text.' }]
    };
    workflow.reload.mockResolvedValue(fresh);
    getLatestAiReviewBatch.mockResolvedValue(completedBatch([savedEntry()]));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Check saved reviews' }));
    const report = await screen.findByRole('dialog', { name: 'AI Review: Software Requirements Specification' });
    expect(report).toHaveTextContent('New saved review result');
    expect(report).not.toHaveTextContent('Artifact:');
    expect(report.querySelector('blockquote')).toHaveTextContent('Exact extracted PDF text.');
    expectNoAiRequests();
  });

  it('lets staff choose exact saved artifacts and return to the chooser', async () => {
    const ron = workflow.state.attempts.find(item => item.id === 'response-ron-srs');
    workflow.state.deliverables[0].fields.push({ id: 'appendixPdf', definitionId: 'field-appendix',
      label: 'Appendix PDF', type: 'drive', pdfRequired: true, documentCheckPolicy: 'MANUAL', aiReviewEnabled: true });
    ron.values.appendixPdf = 'https://drive.google.com/file/d/ron-appendix/view';
    ron.artifactAiReviews = { 'field-appendix': { status: 'COMPLETED', sourceUrl: ron.values.appendixPdf,
      report: { findings: [{ issue: 'Appendix saved result', source: 'DOCUMENT', evidence: 'Appendix PDF excerpt.' }] } } };
    getLatestAiReviewBatch.mockResolvedValue(completedBatch([
      savedEntry(), savedEntry(), savedEntry(ron.id, 'field-appendix', ron.values.appendixPdf)
    ]));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Check saved reviews' }));
    const chooser = await screen.findByRole('dialog', { name: 'Saved AI Reviews' });
    expect(within(chooser).getAllByRole('button', { name: /View review:/ })).toHaveLength(2);
    fireEvent.click(within(chooser).getByRole('button', { name: /View review:.*Appendix PDF/ }));
    const report = await screen.findByRole('dialog', { name: 'AI Review: Software Requirements Specification' });
    expect(report).toHaveTextContent('Appendix saved result');
    expect(report).not.toHaveTextContent('traceability links');
    fireEvent.click(within(report).getByRole('button', { name: 'Close AI Review details' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Saved AI Reviews' })).toBeVisible());
    expectNoAiRequests();
  });

  it('opens only batch-selected results and excludes unrelated older saved reviews', async () => {
    const ron = workflow.state.attempts.find(item => item.id === 'response-ron-srs');
    const muriel = workflow.state.attempts.find(item => item.id === 'response-muriel-srs');
    muriel.aiReviewState = { ...ron.aiReviewState, sourceUrl: muriel.values.documentPdf };
    getLatestAiReviewBatch.mockResolvedValue(completedBatch([
      { ...savedEntry(), selected: true },
      { ...savedEntry(muriel.id, null, muriel.values.documentPdf), selected: false, phase: 'PREPARED' }
    ]));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Check saved reviews' }));
    expect(await screen.findByRole('dialog', { name: 'AI Review: Software Requirements Specification' })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Saved AI Reviews' })).not.toBeInTheDocument();
    expectNoAiRequests();
  });

  it('can read existing saved reports before a prepared batch has selected any PDFs', async () => {
    getLatestAiReviewBatch.mockResolvedValue({ ...completedBatch([{ ...savedEntry(), selected: false }]), state: 'READY' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Check saved reviews' }));
    expect(await screen.findByRole('dialog', { name: 'AI Review: Software Requirements Specification' })).toBeVisible();
    expectNoAiRequests();
  });

  it('opens a saved result when the submitted link contains surrounding whitespace', async () => {
    workflow.state.attempts.find(item => item.id === 'response-ron-srs').values.documentPdf = '  https://drive.google.com/file/d/ron-srs/view  ';
    getLatestAiReviewBatch.mockResolvedValue(completedBatch([savedEntry()]));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Check saved reviews' }));
    expect(await screen.findByRole('dialog', { name: 'AI Review: Software Requirements Specification' })).toBeVisible();
    expectNoAiRequests();
  });

  it('opens a previous saved report with its failure warning rather than implying a failed batch succeeded', async () => {
    const ron = workflow.state.attempts.find(item => item.id === 'response-ron-srs');
    ron.aiReviewState = { status: 'UNCERTAIN', failureCode: 'REQUEST_REJECTED', sourceUrl: ron.values.documentPdf,
      previousReport: ron.aiReviewState.report, previousGeneratedAt: checkedAt, message: 'Latest request failed.' };
    const entry = { ...savedEntry(), resultStatus: 'UNCERTAIN', error: 'Latest request failed.' };
    getLatestAiReviewBatch.mockResolvedValue(completedBatch([entry]));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Check saved reviews' }));
    const report = await screen.findByRole('dialog', { name: 'AI Review: Software Requirements Specification' });
    expect(report).toHaveTextContent('Latest AI Review did not finish');
    expect(report).toHaveTextContent('Previously saved AI Review');
    expectNoAiRequests();
  });

  it('gives visible feedback instead of opening a batch review for a replacement file', async () => {
    getLatestAiReviewBatch.mockResolvedValue(completedBatch([savedEntry(undefined, null, 'https://drive.google.com/file/d/replaced/view')]));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Check saved reviews' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No saved AI Review is available for the current files');
    expect(screen.queryByRole('dialog', { name: /AI Review:/ })).not.toBeInTheDocument();
    expectNoAiRequests();
  });

  it('reports a saved-results read failure and reenables the button', async () => {
    workflow.reload.mockResolvedValue(null);
    getLatestAiReviewBatch.mockResolvedValue(completedBatch([savedEntry()]));
    renderPage();
    const button = await screen.findByRole('button', { name: 'Check saved reviews' });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getAllByText('Saved reviews could not be loaded. Please try again.').length).toBeGreaterThan(0));
    expect(button).toBeEnabled();
    expectNoAiRequests();
  });

  it.each(['workspace', 'account'])('ignores a saved-review read after changing %s', async change => {
    let complete;
    workflow.reload.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    getLatestAiReviewBatch.mockResolvedValue(completedBatch([savedEntry()]));
    const view = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Check saved reviews' }));
    if (change === 'workspace') workflow.workspaceId = 'different-workspace';
    else workflow.session = { authenticated: true, email: 'another-admin@school.edu' };
    getLatestAiReviewBatch.mockResolvedValue(null);
    view.rerender(pageTree());
    await act(async () => { complete(workflow.state); });
    expect(screen.queryByRole('dialog', { name: /AI Review:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Saved AI Reviews' })).not.toBeInTheDocument();
    expectNoAiRequests();
  });

  it('reruns a current Document Check directly from its artifact without starting AI Review', async () => {
    const saved = workflow.state.attempts.find(item => item.id === 'response-ron-srs');
    workflow.runDocumentCheck.mockResolvedValue({ ok: true,
      report: { ...saved.documentCheck, summary: 'Fresh document inspection saved.' } });
    renderPage('/review?response=response-ron-srs');
    expect(screen.getByRole('button', { name: 'View Document Check' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Rerun Document Check' }));
    await waitFor(() => expect(workflow.runDocumentCheck).toHaveBeenCalledWith('response-ron-srs', expect.objectContaining({ id: 'documentPdf' })));
    const checkDialog = (await screen.findByRole('button', { name: 'Close Document Check details' })).closest('[role="dialog"]');
    expect(checkDialog).toHaveTextContent('Fresh document inspection saved.');
    expect(workflow.runDocumentCheck).toHaveBeenCalledTimes(1);
    expect(workflow.runAiReviews).not.toHaveBeenCalled();
    expect(startAiReviewBatch).not.toHaveBeenCalled();
  });

  it('reuses a completed Document Check across ordinary page opens and requests one check after the artifact changes', async () => {
    const responseId = 'response-ron-srs';
    const entry = `/review?response=${responseId}`;
    const saved = workflow.state.attempts.find(item => item.id === responseId);
    saved.documentCheck.sourceUrl = saved.values.documentPdf;

    // Independent page instances exercise ordinary opens, rather than the explicit recheck action.
    for (let open = 0; open < 2; open += 1) {
      const view = renderPage(entry);
      fireEvent.click(await screen.findByRole('button', { name: 'View Document Check', exact: true }));
      expect(await screen.findByRole('button', { name: 'Close Document Check details' })).toBeVisible();
      expect(workflow.runDocumentCheck).not.toHaveBeenCalled();
      expect(workflow.runDocumentChecks).not.toHaveBeenCalled();
      expect(workflow.runAiReviews).not.toHaveBeenCalled();
      view.unmount();
    }

    const changedUrl = 'https://drive.google.com/file/d/ron-revised-srs/view';
    const changedAt = '2026-04-21T11:04:00+08:00';
    workflow.state = { ...workflow.state, attempts: workflow.state.attempts.map(item => item.id === responseId
      ? { ...item, updatedAt: changedAt, values: { ...item.values, documentPdf: changedUrl } }
      : item) };
    workflow.runDocumentCheck.mockResolvedValueOnce({ ok: true, report: currentDocumentCheck(changedAt, {
      sourceUrl: changedUrl, summary: 'The revised PDF was checked.'
    }) });

    const changedView = renderPage(entry);
    fireEvent.click(await screen.findByRole('button', { name: 'Rerun Document Check', exact: true }));
    expect(await screen.findByRole('button', { name: 'Close Document Check details' })).toBeVisible();
    expect(workflow.runDocumentCheck).toHaveBeenCalledTimes(1);
    expect(workflow.runDocumentCheck).toHaveBeenCalledWith(responseId, expect.objectContaining({ id: 'documentPdf' }));
    expect(workflow.state.attempts.find(item => item.id === responseId).documentCheck.sourceUrl).toBe(changedUrl);
    changedView.unmount();

    renderPage(entry);
    fireEvent.click(await screen.findByRole('button', { name: 'View Document Check', exact: true }));
    expect(await screen.findByRole('button', { name: 'Close Document Check details' })).toBeVisible();
    expect(workflow.runDocumentCheck).toHaveBeenCalledTimes(1);
    expect(workflow.runDocumentChecks).not.toHaveBeenCalled();
    expect(workflow.runAiReviews).not.toHaveBeenCalled();
  });

  it('shows pending and failed single document checks without opening a success report', async () => {
    let finish;
    workflow.runDocumentCheck.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review Pacio, Muriel D. response' }));
    const check = await screen.findByRole('button', { name: 'Run Document Check', exact: true });
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
      report: { summary: 'Fresh rerun feedback after Gemini completed.', outcome: 'ISSUES_IDENTIFIED', findings: [{ source: 'DOCUMENT', issue: 'Fresh rerun feedback after Gemini completed.', evidence: 'Updated PDF passage', requirement: '' }],
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
    expect(screen.getByRole('dialog', { name: 'AI Review: Software Requirements Specification' }))
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
    expect(within(drawer).getByRole('button', { name: 'View AI Review' })).toBeDisabled();
    expect(within(drawer).getByRole('button', { name: 'Retry AI review' })).toBeInTheDocument();
    expect(workflow.runAiReviews).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').style.getPropertyValue('--alert-color')).toContain('orange');
    fireEvent.click(within(drawer).getByRole('button', { name: 'Retry AI review' }));
    expect(await screen.findByRole('dialog', { name: 'Retry AI reviews?' })).toBeInTheDocument();
    expect(drawer).toBeInTheDocument();
    expect(prepareAiReviewBatch).not.toHaveBeenCalled();
  });

  it('counts a completed review with manual checks as available and finishes green', async () => {
    const ron = workflow.state.attempts.find(item => item.id === 'response-ron-srs');
    const report = { outcome: 'INCONCLUSIVE', summary: 'Completed checklist with three manual checks.',
      verifiedChecks: Array.from({ length: 45 }, (_, i) => ({ aspect: `Check ${i + 1}` })),
      verificationNotes: ['Check one', 'Check two', 'Check three'] };
    workflow.runAiReviews.mockImplementationOnce(async (_workspace, targets, { onResult }) => {
      onResult(targets[0], { ok: true, inconclusive: true, advisory: 'Items to check in the PDF.',
        review: { status: 'COMPLETED', sourceUrl: ron.values.documentPdf,
          sourceResponseUpdatedAt: ron.updatedAt, report } });
    });
    renderPage('/review?response=response-ron-srs');
    const drawer = await screen.findByRole('dialog', { name: 'Review Taghoy, Ron Luigi F.' });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Rerun AI Review' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Rerun AI Review?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Rerun review' }));
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('AI review complete'));
    expect(status).toHaveTextContent('1 review available');
    expect(status).toHaveTextContent('1 completed review has items to check in the PDF');
    expect(status).not.toHaveTextContent('incomplete');
    expect(status.style.getPropertyValue('--alert-color')).toContain('green');
    expect(workflow.state.attempts.find(item => item.id === ron.id).aiReviewState.report.outcome).toBe('INCONCLUSIVE');
    expect(drawer).toBeInTheDocument();
  });

  it('counts a recovered completed manual report as available during a read-only saved-status check', async () => {
    const ron = workflow.state.attempts.find(item => item.id === 'response-ron-srs');
    workflow.runAiReviews.mockImplementationOnce(async (_workspace, targets, { onResult }) => {
      onResult(targets[0], { ok: false, uncertain: true, error: 'Provider outcome unknown',
        review: { status: 'UNCERTAIN', sourceUrl: ron.values.documentPdf,
          sourceResponseUpdatedAt: ron.updatedAt, retryToken: 'retry' } });
      return { paused: true };
    });
    workflow.getSavedAiReview.mockResolvedValue({ status: 'COMPLETED', sourceUrl: ron.values.documentPdf,
      sourceResponseUpdatedAt: ron.updatedAt, report: { outcome: 'INCONCLUSIVE', verificationNotes: ['Check one'] } });
    renderPage('/review?response=response-ron-srs');
    const drawer = await screen.findByRole('dialog', { name: 'Review Taghoy, Ron Luigi F.' });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Rerun AI Review' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Rerun AI Review?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Rerun review' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check saved reviews' }));
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Saved AI Reviews available'));
    expect(status).toHaveTextContent('1 review available');
    expect(status).toHaveTextContent('0 unconfirmed attempts');
    expect(status).toHaveTextContent('1 completed review has items to check');
    expect(status.style.getPropertyValue('--alert-color')).toContain('green');
    expect(workflow.runAiReviews).toHaveBeenCalledTimes(1);
    expect(workflow.getSavedAiReview).toHaveBeenCalledExactlyOnceWith('workspace-it', ron.id, null);
  });

  it.each([
    ['The submitted Drive PDF could not be opened. Google Drive reported a file-access or download restriction.', 'green'],
    ['The submitted Drive PDF could not be opened. The server failed to retrieve the file.', 'orange']
  ])('distinguishes an access skip from a technical retrieval failure: %s', async (error, color) => {
    workflow.runAiReviews.mockImplementationOnce(async (_workspace, targets, { onResult }) => {
      onResult(targets[0], { ok: false, notStarted: true, error });
    });
    renderPage('/review?response=response-ron-srs');
    const drawer = await screen.findByRole('dialog', { name: 'Review Taghoy, Ron Luigi F.' });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Rerun AI Review' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Rerun AI Review?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Rerun review' }));
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('1 skipped: inaccessible PDF'));
    expect(status.style.getPropertyValue('--alert-color')).toContain(color);
    expect(status).toHaveTextContent('No Gemini request was started');
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
    const saved = await screen.findByRole('dialog', { name: 'AI Review: Software Requirements Specification' });
    expect(saved).toHaveTextContent('Latest AI Review inconclusive');
    expect(saved).toHaveTextContent('Previously saved AI Review');
    expect(saved).toHaveTextContent('Title page: Software Project Management Plan');
    expect(saved).not.toHaveTextContent('AI review completed.');
  });

  it('confirms the precheck first, then shows progress only in the banner without starting AI', async () => {
    const planning = { id: 'background-precheck', state: 'PLANNING', version: 1,
      entries: [], totalPdfs: 2, preparedPdfs: 0 };
    prepareAiReviewBatch.mockResolvedValue(planning);
    getAiReviewBatch.mockResolvedValue(planning);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'AI review all' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Prepare AI Review?' });
    expect(confirmation).toHaveTextContent('does not send an AI request');
    expect(prepareAiReviewBatch).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start precheck' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Prepare AI Review?' })).not.toBeInTheDocument());
    await waitFor(() => expect(prepareAiReviewBatch).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Preparing AI Review')).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'AI review submissions' })).not.toBeInTheDocument();
    expect(screen.queryByText('Checking current files and saved reviews')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'AI review all' }));
    expect(screen.queryByRole('dialog', { name: 'Prepare AI Review?' })).not.toBeInTheDocument();
    expect(prepareAiReviewBatch).toHaveBeenCalledTimes(1);
    expect(cancelAiReviewBatchPreparation).not.toHaveBeenCalled();
    expect(startAiReviewBatch).not.toHaveBeenCalled();
  });

  it.each(['close button', 'Escape', 'outside click', 'Close'])('retains a ready precheck after closing confirmation with %s', async (method) => {
    const ready = { id: 'ready-precheck', state: 'READY', version: 2,
      entries: [], totalPdfs: 2, preparedPdfs: 2 };
    prepareAiReviewBatch.mockResolvedValue(ready);
    renderPage();
    const dialog = await openBatchConfirmation();
    if (method === 'close button') fireEvent.click(within(dialog).getByRole('button', { name: 'Close AI Review window' }));
    else if (method === 'Escape') fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    else if (method === 'Close') fireEvent.click(within(dialog).getByRole('button', { name: 'Close', exact: true }));
    else {
      const overlay = document.querySelector('.mantine-Modal-overlay');
      fireEvent.mouseDown(overlay); fireEvent.mouseUp(overlay); fireEvent.click(overlay);
    }
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'AI review submissions' })).not.toBeInTheDocument());
    expect(cancelAiReviewBatchPreparation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Choose review scope' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'AI review submissions' })).toBeVisible());
    expect(prepareAiReviewBatch).toHaveBeenCalledTimes(1);
    expect(startAiReviewBatch).not.toHaveBeenCalled();
  });

  it('shows a background precheck becoming ready and cancels only from the banner action', async () => {
    const planning = { id: 'background-precheck', state: 'PLANNING', version: 1,
      entries: [], totalPdfs: 1, preparedPdfs: 0 };
    const ready = { ...planning, state: 'READY', version: 2, preparedPdfs: 1, entries: [{
      target: { responseId: 'response-ron-srs', fieldId: 'documentPdf' }, phase: 'PREPARED',
      preview: { key: 'ready-pdf', category: 'MISSING' }
    }] };
    prepareAiReviewBatch.mockResolvedValue(planning);
    getAiReviewBatch.mockResolvedValue(ready);
    cancelAiReviewBatchPreparation.mockResolvedValue({ ...ready, state: 'CANCELLED' });
    renderPage();
    await startPrecheck();
    expect(await screen.findByText('Preparing AI Review')).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'AI review submissions' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Choose review scope' }));
    const reopened = await screen.findByRole('dialog', { name: 'AI review submissions' });
    expect(reopened).toHaveTextContent('1 unique review to run');
    expect(within(reopened).getByRole('button', { name: 'Start review' })).toBeEnabled();
    expect(cancelAiReviewBatchPreparation).not.toHaveBeenCalled();
    expect(startAiReviewBatch).not.toHaveBeenCalled();
    fireEvent.click(within(reopened).getByRole('button', { name: 'Close', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel precheck' }));
    await waitFor(() => expect(cancelAiReviewBatchPreparation).toHaveBeenCalledWith('workspace-it', planning.id));
    expect(prepareAiReviewBatch).toHaveBeenCalledTimes(1);
  });

  it('does not create a precheck when its initial confirmation is cancelled', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'AI review all' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Prepare AI Review?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel', exact: true }));
    expect(prepareAiReviewBatch).not.toHaveBeenCalled();
    expect(cancelAiReviewBatchPreparation).not.toHaveBeenCalled();
    expect(startAiReviewBatch).not.toHaveBeenCalled();
  });

  it('requests a stop from the running banner and can continue unstarted documents once paused', async () => {
    const running = { ...completedBatch([savedEntry()]), state: 'RUNNING', completedDocuments: 0, pendingDocuments: 1 };
    const stopping = { ...running, stopRequested: true, message: 'The current document will finish before the batch stops.' };
    const paused = { ...stopping, state: 'PAUSED' };
    getLatestAiReviewBatch.mockResolvedValue(running);
    stopAiReviewBatch.mockResolvedValue(stopping);
    getAiReviewBatch.mockResolvedValue(paused);
    resumeAiReviewBatch.mockResolvedValue({ ...running, stopRequested: false });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop after current document' }));
    await waitFor(() => expect(stopAiReviewBatch).toHaveBeenCalledWith('workspace-it', running.id));
    expect(await screen.findByRole('button', { name: 'Stop requested' })).toBeDisabled();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue remaining (1)' }));
    await waitFor(() => expect(resumeAiReviewBatch).toHaveBeenCalledWith('workspace-it', running.id));
    expect(prepareAiReviewBatch).not.toHaveBeenCalled();
    expect(startAiReviewBatch).not.toHaveBeenCalled();
    expect(cancelAiReviewBatchPreparation).not.toHaveBeenCalled();
  });

  it('prepares a verified batch before requesting consent and sends retry acknowledgement only after confirmation', async () => {
    const entries = [
      { target: { responseId: 'response-muriel-srs', fieldId: 'documentPdf' }, phase: 'PREPARED',
        preview: { key: 'shared-content', category: 'MISSING' } },
      { target: { responseId: 'response-ron-srs', fieldId: 'documentPdf' }, phase: 'PREPARED',
        preview: { key: 'failed-content', category: 'FAILED', retryToken: 'retry-current' } }
    ];
    prepareAiReviewBatch.mockResolvedValue({ id: 'batch-1', state: 'READY', version: 4, entries, totalPdfs: 2 });
    startAiReviewBatch.mockResolvedValue({ id: 'batch-1', state: 'RUNNING', version: 5, entries,
      totalPdfs: 2, selectedDocuments: 2, completedDocuments: 0, pendingDocuments: 2 });
    renderPage();
    const confirmation = await openBatchConfirmation();
    await waitFor(() => expect(confirmation).toHaveTextContent('2 unique reviews to run'));
    expect(startAiReviewBatch).not.toHaveBeenCalled();
    expect(within(confirmation).getByRole('button', { name: 'Start review' })).toBeDisabled();
    fireEvent.click(within(confirmation).getByRole('checkbox', { name: 'I agree to retry 1 uncertain review' }));
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start review' }));
    await waitFor(() => expect(startAiReviewBatch).toHaveBeenCalledWith('workspace-it', 'batch-1', {
      version: 4, mode: 'ATTENTION', includeOutdated: true, retryAcknowledged: true
    }));
    expect(workflow.runAiReviews).not.toHaveBeenCalled();
  });

  it('shows a preparation failure without starting a provider request', async () => {
    prepareAiReviewBatch.mockRejectedValue(new Error('Your WildTrack session expired. Sign in again.'));
    renderPage();
    await startPrecheck();
    expect(await screen.findByRole('alert')).toHaveTextContent('Your WildTrack session expired');
    expect(screen.queryByRole('dialog', { name: 'AI review submissions' })).not.toBeInTheDocument();
    expect(startAiReviewBatch).not.toHaveBeenCalled();
    expect(workflow.runAiReviews).not.toHaveBeenCalled();
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

  it('shows unique contents before total PDF submissions and explicitly includes successful reviews', async () => {
    const entries = ['response-muriel-srs', 'response-ron-srs', 'response-mark-sdd'].map((responseId, index) => ({
      target: { responseId, fieldId: 'documentPdf' }, phase: 'PREPARED',
      preview: { key: index < 2 ? 'shared' : 'successful', category: index < 2 ? 'MISSING' : 'CLEAN' }
    }));
    prepareAiReviewBatch.mockResolvedValue({ id: 'batch-count', state: 'READY', version: 1, entries, totalPdfs: 3 });
    renderPage();
    const dialog = await openBatchConfirmation();
    await waitFor(() => expect(dialog).toHaveTextContent('1 unique review to run'));
    expect(dialog).toHaveTextContent('3 total PDF submissions');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Include successful reviews too' }));
    expect(dialog).toHaveTextContent('2 unique reviews to run');
    expect(startAiReviewBatch).not.toHaveBeenCalled();
  });

  it('excludes unverifiable PDFs from unique review counts and does not manufacture a sharing diagnosis', async () => {
    prepareAiReviewBatch.mockResolvedValue({ id: 'batch-access', state: 'READY', version: 1, totalPdfs: 2, entries: [
      { target: { responseId: 'response-muriel-srs', fieldId: 'documentPdf' }, phase: 'PREPARED',
        preview: { key: 'verified', category: 'MISSING' } },
      { target: { responseId: 'response-ron-srs', fieldId: 'documentPdf' }, phase: 'UNVERIFIED',
        error: 'Backend access failure could not be confirmed as a sharing problem.' }
    ] });
    renderPage();
    const dialog = await openBatchConfirmation();
    await waitFor(() => expect(dialog).toHaveTextContent('1 unique review to run'));
    expect(dialog).toHaveTextContent('Some PDFs could not be verified');
    expect(dialog).toHaveTextContent('excluded from the review count because their contents could not be verified');
    fireEvent.click(within(dialog).getByText('See affected PDFs'));
    expect(dialog).toHaveTextContent('could not be confirmed as a sharing problem');
    expect(startAiReviewBatch).not.toHaveBeenCalled();
  });

  it('discloses newer recorded file history and lets staff exclude updated PDFs', async () => {
    prepareAiReviewBatch.mockResolvedValue({ id: 'batch-updated', state: 'READY', version: 1, totalPdfs: 1, entries: [
      { target: { responseId: 'response-muriel-srs', fieldId: 'documentPdf' }, phase: 'PREPARED', newerHistory: true,
        preview: { key: 'updated', category: 'MISSING', outdated: true,
          deliverableTitle: 'Software Requirements Specification', studentName: 'Pacio, Muriel D.',
          generatedAt: '2026-04-19T00:00:00Z', modifiedAt: '2026-04-20T00:00:00Z' } }
    ] });
    renderPage();
    const dialog = await openBatchConfirmation();
    await waitFor(() => expect(dialog).toHaveTextContent('1 unique review to run'));
    fireEvent.click(within(dialog).getByText('See affected PDFs'));
    expect(dialog).toHaveTextContent('Document Check also recorded a file update after the saved AI Review');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Include updated PDFs (1)' }));
    expect(dialog).toHaveTextContent('0 unique reviews to run');
    expect(within(dialog).getByRole('button', { name: 'Start review' })).toBeDisabled();
  });

  it('restores paused server progress and continues only remaining work', async () => {
    const paused = { id: 'batch-paused', state: 'PAUSED', version: 2, entries: [], totalPdfs: 3,
      selectedDocuments: 2, completedDocuments: 1, uniqueDocuments: 2, pendingDocuments: 1,
      message: 'Gemini connection could not be confirmed.' };
    getLatestAiReviewBatch.mockResolvedValue(paused);
    resumeAiReviewBatch.mockResolvedValue({ ...paused, state: 'RUNNING', version: 3 });
    renderPage();
    const resume = await screen.findByRole('button', { name: 'Continue remaining (1)' });
    expect(screen.getByText(/1 of 2 unique review attempts finished/)).toBeVisible();
    fireEvent.click(resume);
    await waitFor(() => expect(resumeAiReviewBatch).toHaveBeenCalledWith('workspace-it', 'batch-paused'));
    expect(startAiReviewBatch).not.toHaveBeenCalled();
    expect(workflow.runAiReviews).not.toHaveBeenCalled();
  });

  it('gives visible overlap feedback instead of silently ignoring an individual review during a server batch', async () => {
    workflow.state.attempts.find(item => item.id === 'response-muriel-srs').documentCheck = currentDocumentCheck('2026-04-19T09:10:00+08:00');
    getLatestAiReviewBatch.mockResolvedValue({ id: 'batch-running', state: 'RUNNING', version: 2,
      entries: [], totalPdfs: 2, selectedDocuments: 2, completedDocuments: 0, pendingDocuments: 2 });
    renderPage('/review?response=response-muriel-srs');
    await screen.findByText('AI Review running');

    fireEvent.click(await screen.findByRole('button', { name: 'Run AI Review', exact: true }));
    await waitFor(() => expect(screen.getByText('AI Review already running')).toBeVisible());
    expect(prepareAiReviewBatch).not.toHaveBeenCalled();
    expect(workflow.runAiReviews).not.toHaveBeenCalled();
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
    const aiDialog = screen.getByRole('dialog', { name: 'AI Review: Software Requirements Specification' });
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
    fireEvent.click(within(table).getByRole('button', { name: 'Sort by Student' }));
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Student 001');
    fireEvent.click(within(table).getByRole('button', { name: 'Sort by Student' }));
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Student 318');
  });

  it('removes an accepted response from Pending but waits for preserved copies before showing Archived', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review Pacio, Muriel D. response' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Review Pacio, Muriel D.' })).getByRole('button', { name: 'Accept response' }));
    expect(workflow.markAccepted).toHaveBeenCalledWith('response-muriel-srs');

    await waitFor(() => expect(within(screen.getByRole('table', { name: 'SRS submissions' })).queryByText('Pacio, Muriel D.')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Review Pacio, Muriel D.' })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog', { name: 'Review Pacio, Muriel D.' })).getByRole('button', { name: 'Archive response' })).toBeEnabled();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Review Pacio, Muriel D.' })).getByRole('button', { name: 'Archive response' }));
    const archiveConfirmation = await screen.findByRole('dialog', { name: 'Archive this accepted response?' });
    expect(archiveConfirmation).toHaveTextContent('preserve copies of the accepted PDFs');
    expect(archiveConfirmation).toHaveTextContent('Check Final archive for progress');
    fireEvent.click(within(archiveConfirmation).getByRole('button', { name: 'Archive response' }));
    await waitFor(() => expect(workflow.archiveAttempt).toHaveBeenCalledWith('response-muriel-srs'));
    expect(await screen.findByText('Copying is in progress. Check Final archive for the latest status.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Accepted' }));
    expect(within(screen.getByRole('table', { name: 'SRS submissions' })).getByText('Pacio, Muriel D.')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'SRS submissions' })).getByText('Barangan, Mark Lorenz L.')).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('group', { name: 'Review filter' })).getByRole('button', { name: 'Archived' }));
    expect(within(screen.getByRole('table', { name: 'SRS submissions' })).getByText('Barangan, Mark Lorenz L.')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'SRS submissions' })).queryByText('Pacio, Muriel D.')).not.toBeInTheDocument();
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
    const framework = within(drawer).getByRole('group', { name: 'Framework / Model artifact' });
    expect(within(framework).getByRole('button', { name: 'View Document Check' })).toBeEnabled();
    expect(within(framework).getByRole('button', { name: 'Rerun Document Check' })).toBeEnabled();
    const highlights = within(drawer).getByRole('group', { name: 'MVP Validation Highlights artifact' });
    expect(within(highlights).getByRole('button', { name: 'View Document Check' })).toBeDisabled();
    expect(within(highlights).getByRole('button', { name: 'Run Document Check' })).toBeEnabled();

    fireEvent.click(within(drawer).getByRole('button', { name: 'Run Document Check' }));
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
