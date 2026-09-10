import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { AdviserViewPage } from './AdviserViewPage.jsx';

const workflow = vi.hoisted(() => ({
  state: null,
  workspaceId: 'workspace-it',
  session: { authenticated: true, email: 'adviser@school.edu' },
  staffIdentity: null,
  reloadIdentity: vi.fn(),
  markAccepted: vi.fn(),
  revokeAcceptance: vi.fn(),
  saveFeedback: vi.fn(),
  runDocumentCheck: vi.fn(),
  runDocumentChecks: vi.fn()
}));

vi.mock('../app/WorkspaceSession.jsx', () => ({
  useWorkspaceSession: () => ({ activeWorkspaceId: workflow.workspaceId, session: workflow.session })
}));

vi.mock('../app/StaffIdentity.jsx', () => ({
  useStaffIdentity: () => ({
    data: workflow.staffIdentity,
    status: 'ready',
    error: '',
    reload: workflow.reloadIdentity
  })
}));

vi.mock('../hooks/useWorkspaceResource.js', () => ({
  useWorkspaceResource: () => ({
    data: workflow.state,
    setData: (next) => {
      workflow.state = typeof next === 'function' ? next(workflow.state) : next;
    },
    status: 'ready',
    error: ''
  })
}));

vi.mock('../lib/reviewDeskClient.js', () => ({
  emptyReviewDesk: () => ({}),
  loadReviewDesk: vi.fn(),
  applyReviewMutation: (response, mutation) => ({ ...response, ...mutation }),
  applyDocumentCheck: (response, report) => report?.fieldId
    ? { ...response, artifactChecks: { ...(response.artifactChecks || {}), [report.fieldId]: report } }
    : { ...response, documentCheck: report },
  acceptResponse: (...args) => workflow.markAccepted(...args),
  revokeAcceptance: (...args) => workflow.revokeAcceptance(...args),
  saveFeedback: (...args) => workflow.saveFeedback(...args),
  runDocumentCheck: (...args) => workflow.runDocumentCheck(...args),
  runDocumentChecks: (...args) => workflow.runDocumentChecks(...args)
}));

const TEAM_A = '2526-sem2-it332-01';
const TEAM_B = '2526-sem2-it332-02';

function createState({ conflicting = false, accepted = false } = {}) {
  return {
    scopeTeamCodes: [TEAM_A],
    students: [
      { studentNumber: '22-1001-001', name: 'ALPHA, ANA', teamCode: TEAM_A, memberNumber: 1, adviser: 'Dr. Elena Mercado' },
      { studentNumber: '22-1002-002', name: 'BETA, BEN', teamCode: TEAM_A, memberNumber: 2, adviser: 'Dr. Elena Mercado' },
      { studentNumber: '22-2001-001', name: 'GAMMA, GIO', teamCode: TEAM_B, memberNumber: 1, adviser: 'Prof. Adrian Flores' }
    ],
    projectMetadata: [
      { groupCode: TEAM_A, projectTitle: 'Accessible Learning Hub', softwareName: 'AccessHub', adviserName: 'Dr. Elena Mercado' },
      { groupCode: TEAM_B, projectTitle: 'Campus Queue Monitor', softwareName: 'QueueWatch', adviserName: 'Prof. Adrian Flores' }
    ],
    deliverables: [
      {
        id: 'deliv-srs',
        slug: 'srs',
        shortTitle: 'SRS',
        title: 'Software Requirements Specification',
        trackerColumn: 'SRS',
        dueAt: '2026-04-18T23:59:00+08:00',
        status: 'Published',
        fields: [{ id: 'documentPdf', type: 'drive', pdfRequired: true }]
      },
      {
        id: 'deliv-sdd',
        slug: 'sdd',
        shortTitle: 'SDD',
        title: 'Software Design Description',
        trackerColumn: 'SDD',
        dueAt: '2026-04-25T23:59:00+08:00',
        status: 'Published',
        fields: [{ id: 'documentPdf', type: 'drive', pdfRequired: true }]
      }
    ],
    attempts: [
      {
        id: 'response-a1', deliverableId: 'deliv-srs', studentNumber: '22-1001-001', studentName: 'ALPHA, ANA', teamCode: TEAM_A,
        submittedAt: '2026-04-17T09:00:00+08:00', updatedAt: '2026-04-17T09:00:00+08:00',
        values: { documentPdf: 'https://drive.google.com/file/d/shared-team-file/view' },
        reviewStatus: 'Received', fileCheckStatus: 'COMPLETED',
        documentCheck: { status: 'Current', sourceResponseUpdatedAt: '2026-04-17T09:00:00+08:00', summary: 'Readable PDF.' }
      },
      {
        id: 'response-a2', deliverableId: 'deliv-srs', studentNumber: '22-1002-002', studentName: 'BETA, BEN', teamCode: TEAM_A,
        submittedAt: '2026-04-17T10:00:00+08:00', updatedAt: '2026-04-17T10:00:00+08:00',
        values: { documentPdf: conflicting ? 'https://drive.google.com/file/d/different-team-file/view' : 'https://drive.google.com/file/d/shared-team-file/view' },
        reviewStatus: accepted ? 'Accepted' : 'Received',
        primaryStatus: accepted ? 'Accepted' : 'Received',
        acceptance: accepted ? { acceptedBy: 'Dr. Elena Mercado', acceptedByRole: 'Adviser', acceptedAt: '2026-04-17T11:00:00+08:00' } : null,
        fileCheckStatus: 'COMPLETED',
        documentCheck: { status: 'Current', sourceResponseUpdatedAt: '2026-04-17T10:00:00+08:00', summary: 'Readable PDF.' },
        aiReport: {
          status: 'Current',
          generatedAt: '2026-04-17T10:30:00+08:00',
          sourceResponseUpdatedAt: '2026-04-17T10:00:00+08:00',
          summary: 'Requirements are present, but traceability needs staff review.',
          flags: ['Traceability weak'],
          missingSections: ['Acceptance criteria'],
          suggestedAction: 'Review the requirements matrix.'
        },
        feedback: []
      },
      {
        id: 'response-b1', deliverableId: 'deliv-srs', studentNumber: '22-2001-001', studentName: 'GAMMA, GIO', teamCode: TEAM_B,
        submittedAt: '2026-04-17T12:00:00+08:00', values: { documentPdf: 'https://drive.google.com/file/d/other-team/view' }, reviewStatus: 'Received'
      }
    ]
  };
}

function createMultiArtifactState({ accepted = false, archived = false } = {}) {
  const state = createState({ accepted });
  const deliverable = state.deliverables[0];
  deliverable.id = 'deliv-mvp-validation';
  deliverable.slug = 'mvp-validation';
  deliverable.shortTitle = 'MVP Validation';
  deliverable.title = 'MVP Validation';
  deliverable.trackerColumn = 'MVPValidation';
  deliverable.fields = [
    { definitionId: 'field-form', id: 'validationInstrument', label: 'Validation Instrument', type: 'googleForm', pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false },
    { definitionId: 'field-framework', id: 'frameworkModel', label: 'Framework / Model', type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO', aiReviewEnabled: true },
    { definitionId: 'field-sheet', id: 'validationResponseSheet', label: 'Validation Response Sheet', type: 'googleSheet', pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false },
    { definitionId: 'field-highlights', id: 'validationHighlights', label: 'MVP Validation Highlights', type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO', aiReviewEnabled: true },
    { definitionId: 'field-evidence', id: 'validationEvidence', label: 'Validation Evidence', type: 'driveFolder', pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false }
  ];
  state.attempts = state.attempts.map((response) => {
    if (response.deliverableId !== 'deliv-srs') return response;
    const values = {
      validationInstrument: 'https://docs.google.com/forms/d/e/validation-form/viewform',
      frameworkModel: 'https://drive.google.com/file/d/framework-pdf/view',
      validationResponseSheet: 'https://docs.google.com/spreadsheets/d/validation-sheet/edit',
      validationHighlights: 'https://drive.google.com/file/d/highlights-pdf/view',
      validationEvidence: 'https://drive.google.com/drive/folders/validation-evidence'
    };
    return {
      ...response,
      deliverableId: 'deliv-mvp-validation',
      values,
      archiveStatus: archived && response.id === 'response-a2' ? 'Archived' : response.archiveStatus,
      documentCheck: null,
      aiReport: null,
      artifactChecks: response.id === 'response-a2' ? {
        'field-framework': {
          fieldId: 'field-framework',
          status: 'Current',
          checkedAt: '2026-04-17T10:15:00+08:00',
          sourceUrl: values.frameworkModel,
          sourceResponseUpdatedAt: response.updatedAt || response.submittedAt,
          summary: 'Framework PDF is readable.'
        }
      } : {},
      artifactAiReviews: response.id === 'response-a2' ? {
        'field-framework': {
          fieldId: 'field-framework',
          status: 'COMPLETED',
          generatedAt: '2026-04-17T10:30:00+08:00',
          sourceUrl: values.frameworkModel,
          sourceResponseUpdatedAt: response.updatedAt || response.submittedAt,
          report: { summary: 'Framework review belongs only to the framework PDF.' }
        }
      } : {}
    };
  });
  return state;
}

function renderPage(role = 'adviser') {
  localStorage.setItem('wildtrack.v2.preview-role', role);
  localStorage.setItem('wildtrack.v2.preview-adviser', 'Dr. Elena Mercado');
  return render(adviserTree());
}

function adviserTree() {
  return (
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ModalsProvider>
        <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <AdviserViewPage />
        </MemoryRouter>
      </ModalsProvider>
    </MantineProvider>
  );
}

describe('adviser My advised teams review', () => {
  beforeEach(() => {
    workflow.workspaceId = 'workspace-it';
    workflow.session = { authenticated: true, email: 'adviser@school.edu' };
    workflow.staffIdentity = {
      adviserName: 'Dr. Elena Mercado',
      assignments: [{ workspaceId: 'workspace-it', teamCode: TEAM_A }],
      workspaces: [{ id: 'workspace-it', name: 'IT Capstone - IT332' }]
    };
    localStorage.clear();
    workflow.state = createState();
    Object.values(workflow).filter((value) => typeof value === 'function').forEach((mock) => mock.mockReset());
    workflow.runDocumentCheck.mockResolvedValue({ ok: true });
    workflow.runDocumentChecks.mockResolvedValue({ ok: true, completed: 0, total: 0, failed: 0 });
  });

  it.each(['workspace', 'account'])('discards late adviser batch results after %s change', async (change) => {
    let finish, progress;
    workflow.runDocumentChecks.mockImplementation((_workspace, _responses, _deliverables, options) => {
      progress = options.onProgress;
      return new Promise(resolve => { finish = resolve; });
    });
    const view = renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Check .*unchecked member response/ }));
    if (change === 'workspace') workflow.workspaceId = 'workspace-cs';
    else workflow.session = { authenticated: true, email: 'other@school.edu' };
    view.rerender(adviserTree());
    await act(async () => { progress({ completed: 2, total: 2 }); finish({ completed: 2, total: 2, failed: 1 }); });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('limits a regular adviser to assigned teams and groups equivalent member submissions', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'My advised teams' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(TEAM_A) })).toBeInTheDocument();
    expect(screen.queryByText(TEAM_B)).not.toBeInTheDocument();
    expect(screen.getByText('2 of 2 members')).toBeInTheDocument();
    expect(screen.getByText('1 shared file')).toBeInTheDocument();
    expect(screen.getByText('SRS')).toBeInTheDocument();
    screen.getAllByText('Not checked').forEach((label) => {
      expect(label.closest('.wt-status-indicator')).toHaveAttribute('data-tone', 'neutral');
    });
  });

  it('shows conflicting member files and lets the adviser choose the current group output', () => {
    workflow.state = createState({ conflicting: true });
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('2 different files were submitted');
    const outputSelect = screen.getByRole('combobox', { name: 'Current group output' });
    expect(within(outputSelect).getAllByRole('option')).toHaveLength(2);
  });

  it('shows existing AI Review results without exposing run or rerun controls', () => {
    renderPage();

    expect(screen.getByText('Requirements are present, but traceability needs staff review.')).toBeInTheDocument();
    expect(screen.getByText(/Acceptance criteria/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Run AI Review|Rerun AI Review/i })).not.toBeInTheDocument();
  });

  it('targets Document Check and AI state to the explicit PDF artifact instead of the first submitted URL', async () => {
    workflow.state = createMultiArtifactState();
    workflow.runDocumentCheck.mockResolvedValue({
      ok: true,
      report: {
        fieldId: 'field-highlights',
        status: 'Current',
        checkedAt: '2026-04-17T10:45:00+08:00',
        sourceUrl: 'https://drive.google.com/file/d/highlights-pdf/view',
        summary: 'Highlights PDF is readable.'
      }
    });
    renderPage();

    const formArtifact = screen.getByRole('group', { name: 'Validation Instrument artifact' });
    const frameworkArtifact = screen.getByRole('group', { name: 'Framework / Model artifact' });
    const highlightsArtifact = screen.getByRole('group', { name: 'MVP Validation Highlights artifact' });
    expect(within(formArtifact).getByText('Google Form')).toBeInTheDocument();
    expect(within(formArtifact).queryByRole('button', { name: /Document Check/i })).not.toBeInTheDocument();
    expect(within(frameworkArtifact).getByRole('button', { name: 'View Document Check' })).toBeInTheDocument();
    expect(within(frameworkArtifact).getByText('Framework review belongs only to the framework PDF.')).toBeInTheDocument();

    fireEvent.click(within(highlightsArtifact).getByRole('button', { name: 'Check document' }));
    await waitFor(() => expect(workflow.runDocumentCheck).toHaveBeenCalledWith(
      'workspace-it',
      expect.objectContaining({ id: 'response-a2' }),
      expect.objectContaining({ id: 'deliv-mvp-validation' }),
      expect.objectContaining({ definitionId: 'field-highlights', id: 'validationHighlights' })
    ));
    expect(workflow.runDocumentCheck.mock.calls[0][1].values.validationInstrument).toContain('docs.google.com/forms');
  });

  it('allows acceptance to be revoked after the response has been archived', async () => {
    workflow.state = createMultiArtifactState({ accepted: true, archived: true });
    renderPage();

    const revoke = screen.getByRole('button', { name: 'Revoke acceptance' });
    expect(revoke).toBeEnabled();
    fireEvent.click(revoke);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm revoke' }));
    expect(workflow.revokeAcceptance).toHaveBeenCalledWith('response-a2');
  });

  it('saves student-visible feedback against the selected group output', () => {
    renderPage();

    fireEvent.change(screen.getByRole('textbox', { name: 'Feedback for student' }), {
      target: { value: 'Clarify the acceptance criteria before the next consultation.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save feedback' }));

    expect(workflow.saveFeedback).toHaveBeenCalledWith('response-a2', {
      note: 'Clarify the acceptance criteria before the next consultation.',
      visibility: 'Student'
    });
  });

  it('keeps unsaved feedback and explains a rejected save', async () => {
    workflow.saveFeedback.mockRejectedValue(new Error('Permission changed. Reload and try again.'));
    renderPage();
    const editor = screen.getByRole('textbox', { name: 'Feedback for student' });
    fireEvent.change(editor, { target: { value: 'Keep this unsaved note.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save feedback' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission changed. Reload and try again.');
    expect(editor).toHaveValue('Keep this unsaved note.');
  });

  it.each([false, true])('explains a rejected acceptance change (accepted=%s)', async (accepted) => {
    workflow.state = createState({ accepted });
    (accepted ? workflow.revokeAcceptance : workflow.markAccepted).mockRejectedValue(new Error('Review access expired. Reload to continue.'));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: accepted ? 'Revoke acceptance' : 'Accept group output' }));
    fireEvent.click(await screen.findByRole('button', { name: accepted ? 'Confirm revoke' : 'Confirm acceptance' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Review access expired. Reload to continue.');
    expect(workflow.state.attempts.find((item) => item.id === 'response-a2').reviewStatus).toBe(accepted ? 'Accepted' : 'Received');
  });

  it('disables duplicate document checks until the server responds', async () => {
    let finish;
    workflow.runDocumentCheck.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    renderPage();
    const button = screen.getByRole('button', { name: 'Check document', exact: true });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    await act(async () => finish({ ok: false, error: 'Try again later.' }));
    expect(button).toBeEnabled();
  });

  it('explains an unavailable document check', async () => {
    workflow.runDocumentCheck.mockResolvedValue({ ok: false, error: 'Document provider unavailable. Try again later.' });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Check document', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Document provider unavailable. Try again later.');
  });

  it('edits the current student feedback instead of rendering a message history', () => {
    workflow.state = createState();
    workflow.state.attempts.find((response) => response.id === 'response-a2').feedback = [{
      id: 'feedback-existing',
      note: 'Clarify the original acceptance criteria.',
      author: 'Dr. Elena Mercado',
      visibility: 'Student',
      createdAt: '2026-04-17T11:00:00+08:00'
    }];
    renderPage();

    const editor = screen.getByRole('textbox', { name: 'Feedback for student' });
    expect(editor).toHaveValue('Clarify the original acceptance criteria.');
    expect(screen.queryByRole('region', { name: 'Saved feedback' })).not.toBeInTheDocument();

    fireEvent.change(editor, { target: { value: 'Clarify the revised acceptance criteria.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update feedback' }));
    expect(workflow.saveFeedback).toHaveBeenCalledWith('response-a2', {
      note: 'Clarify the revised acceptance criteria.',
      visibility: 'Student'
    });
  });

  it('accepts and revokes the selected group output without changing duplicate member records', async () => {
    const { unmount } = renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Accept group output' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm acceptance' }));
    expect(workflow.markAccepted).toHaveBeenCalledWith('response-a2');

    unmount();
    workflow.state = createState({ accepted: true });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke acceptance' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm revoke' }));
    expect(workflow.revokeAcceptance).toHaveBeenCalledWith('response-a2');
  });
});
