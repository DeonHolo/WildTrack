import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { useReducer } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { AdviserViewPage, buildTeamDeliverableRows } from './AdviserViewPage.jsx';

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
  useWorkspaceResource: () => {
    const [, refresh] = useReducer((value) => value + 1, 0);
    return {
      data: workflow.state,
      setData: (next) => {
        workflow.state = typeof next === 'function' ? next(workflow.state) : next;
        refresh();
      },
      status: 'ready',
      error: ''
    };
  }
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
        acceptance: accepted ? { acceptedBy: 'Dr. Elena Mercado', acceptedByRole: 'Adviser', acceptedAt: '2026-04-17T11:00:00+08:00', sourceResponseUpdatedAt: '2026-04-17T10:00:00+08:00' } : null,
        fileCheckStatus: 'COMPLETED',
        documentCheck: { status: 'Current', sourceResponseUpdatedAt: '2026-04-17T10:00:00+08:00', summary: 'Readable PDF.' },
        aiReport: {
          status: 'Current',
          generatedAt: '2026-04-17T10:30:00+08:00',
          sourceResponseUpdatedAt: '2026-04-17T10:00:00+08:00',
          summary: 'Requirements are present, but traceability needs staff review.',
          findings: [{
            issue: 'The submitted PDF does not clearly connect requirements to acceptance evidence.',
            source: 'DOCUMENT',
            evidence: 'Requirements matrix section',
            requirement: ''
          }],
          missingRequiredSections: [{
            section: 'Acceptance criteria',
            source: 'DELIVERABLE_REQUIREMENTS',
            requirement: 'Include Acceptance criteria.'
          }],
          limitations: ['No official template was supplied, so compliance with a specific template structure was not assessed.'],
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
    { definitionId: 'field-student-number', id: 'studentNumber', label: 'Student Number', type: 'academicStudentNumber', pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false },
    { definitionId: 'field-student-name', id: 'studentName', label: 'Student Name', type: 'academicStudentName', pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false },
    { definitionId: 'field-team-code', id: 'teamCode', label: 'Team Code', type: 'academicTeamCode', pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false },
    { definitionId: 'field-section', id: 'section', label: 'Section', type: 'academicSection', pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false },
    { definitionId: 'field-validation-step', id: 'validationStep', label: 'Validation step', type: 'multipleChoice', pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false },
    { definitionId: 'field-form', id: 'validationInstrument', label: 'Validation Instrument', type: 'googleForm', pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false },
    { definitionId: 'field-framework', id: 'frameworkModel', label: 'Framework / Model', type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO', aiReviewEnabled: true },
    { definitionId: 'field-sheet', id: 'validationResponseSheet', label: 'Validation Response Sheet', type: 'googleSheet', pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false },
    { definitionId: 'field-highlights', id: 'validationHighlights', label: 'MVP Validation Highlights', type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO', aiReviewEnabled: true },
    { definitionId: 'field-evidence', id: 'validationEvidence', label: 'Validation Evidence', type: 'driveFolder', pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false }
  ];
  state.attempts = state.attempts.map((response) => {
    if (response.deliverableId !== 'deliv-srs') return response;
    const values = {
      studentNumber: response.studentNumber,
      studentName: response.studentName,
      teamCode: response.teamCode,
      section: 'G7',
      validationStep: 'Initial submission',
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

function renderPage(role = 'adviser', initialEntry = '/adviser') {
  localStorage.setItem('wildtrack.v2.preview-role', role);
  localStorage.setItem('wildtrack.v2.preview-adviser', 'Dr. Elena Mercado');
  return render(adviserTree(initialEntry));
}

function adviserTree(initialEntry = '/adviser') {
  return (
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ModalsProvider>
        <MemoryRouter initialEntries={[initialEntry]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <AdviserViewPage />
          <LocationProbe />
        </MemoryRouter>
      </ModalsProvider>
    </MantineProvider>
  );
}

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <span data-testid="current-adviser-location">{`${location.pathname}${location.search}`}</span>
    <button type="button" data-testid="adviser-history-back" style={{ display: 'none' }} onClick={() => navigate(-1)}>Back</button>
  </>;
}

function groupOutputDetails(title = 'SRS') {
  return screen.getByRole('region', { name: `${title} group output details` });
}

async function chooseGroupOutput(owner) {
  fireEvent.click(screen.getByRole('textbox', { name: 'Current group output' }));
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(owner) }));
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

  it('shows conflicting member files and lets the adviser choose the current group output', async () => {
    workflow.state = createState({ conflicting: true });
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('2 different files were submitted');
    const outputSelect = screen.getByRole('textbox', { name: 'Current group output' });
    expect(outputSelect).toHaveValue('');
    expect(screen.getByText('Selection required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept group output' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Feedback for student' })).toBeDisabled();
    fireEvent.click(outputSelect);
    const olderOption = await screen.findByRole('option', { name: /ALPHA, ANA/ });
    expect(olderOption.closest('[role="listbox"]').querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(olderOption).toHaveTextContent('saved');
  });

  it('uses an explicit older file consistently for the chooser, table, feedback, and acceptance', async () => {
    workflow.state = createState({ conflicting: true });
    renderPage();

    await chooseGroupOutput('ALPHA, ANA');
    expect(screen.getByRole('textbox', { name: 'Current group output' })).toHaveValue('File 2 | ALPHA, ANA');
    expect(screen.queryByText('Selection required')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(within(groupOutputDetails()).getByRole('status')).toHaveTextContent('Current group output selected');
    expect(screen.getByText('SRS').closest('tr')).toHaveTextContent('Selected: File 2');
    expect(screen.getByRole('link', { name: 'Open PDF' })).toHaveAttribute('href', 'https://drive.google.com/file/d/shared-team-file/view');

    fireEvent.change(screen.getByRole('textbox', { name: 'Feedback for student' }), { target: { value: 'Review the selected older output.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save feedback' }));
    expect(workflow.saveFeedback).toHaveBeenCalledWith('response-a1', { note: 'Review the selected older output.', visibility: 'Student' });
    fireEvent.click(screen.getByRole('button', { name: 'Accept group output' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm acceptance' }));
    expect(workflow.markAccepted).toHaveBeenCalledWith('response-a1');
  });

  it.each(['adviser', 'admin'])('restores the sole accepted older output without an unresolved warning for %s', (role) => {
    workflow.state = createState({ conflicting: true });
    const accepted = workflow.state.attempts[0];
    accepted.reviewStatus = 'Accepted';
    accepted.acceptance = { acceptedAt: '2026-04-17T11:00:00+08:00', sourceResponseUpdatedAt: accepted.updatedAt };
    workflow.state.attempts[1].feedback = [{ note: 'Feedback on the other file.', visibility: 'Student' }];
    const first = renderPage(role);

    expect(screen.getByRole('textbox', { name: 'Current group output' })).toHaveValue('File 2 | ALPHA, ANA');
    expect(screen.getByText('SRS').closest('tr')).toHaveTextContent('Accepted');
    expect(screen.getByText('SRS').closest('tr')).toHaveTextContent('Accepted: File 2');
    expect(screen.queryByText('Selection required')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(within(groupOutputDetails()).getByRole('status')).toHaveTextContent('Accepted group output');
    expect(screen.getByRole('button', { name: 'Revoke acceptance' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Feedback for student' })).toHaveValue('');
    first.unmount();
    renderPage(role);
    expect(screen.getByRole('textbox', { name: 'Current group output' })).toHaveValue('File 2 | ALPHA, ANA');
    expect(screen.getByRole('button', { name: 'Revoke acceptance' })).toBeEnabled();
  });

  it('keeps distinct accepted files ambiguous until staff explicitly choose one', async () => {
    workflow.state = createState({ conflicting: true, accepted: true });
    workflow.state.attempts[0].reviewStatus = 'Accepted';
    workflow.state.attempts[0].acceptance = { acceptedAt: '2026-04-17T11:15:00+08:00', sourceResponseUpdatedAt: workflow.state.attempts[0].updatedAt };
    renderPage();

    expect(screen.getByRole('textbox', { name: 'Current group output' })).toHaveValue('');
    expect(screen.getByRole('alert')).toHaveTextContent('More than one file has current acceptance');
    expect(screen.getByRole('button', { name: 'Accept group output' })).toBeDisabled();
    await chooseGroupOutput('ALPHA, ANA');
    expect(screen.getByRole('button', { name: 'Revoke acceptance' })).toBeEnabled();
    expect(screen.queryByText('Selection required')).not.toBeInTheDocument();
  });

  it('updates accepted selection and decision immediately, then revokes only that response', async () => {
    workflow.state = createState({ conflicting: true });
    const chosen = workflow.state.attempts[0];
    workflow.markAccepted.mockResolvedValue({ reviewStatus: 'Accepted', acceptance: { acceptedAt: '2026-04-17T11:00:00+08:00', sourceResponseUpdatedAt: chosen.updatedAt } });
    workflow.revokeAcceptance.mockResolvedValue({ reviewStatus: 'Received', acceptance: null });
    renderPage();
    await chooseGroupOutput('ALPHA, ANA');

    fireEvent.click(screen.getByRole('button', { name: 'Accept group output' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm acceptance' }));
    expect(await screen.findByRole('button', { name: 'Revoke acceptance' })).toBeEnabled();
    expect(screen.getByText('SRS').closest('tr')).toHaveTextContent('Accepted');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke acceptance' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm revoke' }));
    await waitFor(() => expect(workflow.state.attempts[0].acceptance).toBeNull());
    expect(workflow.revokeAcceptance).toHaveBeenCalledWith('response-a1');
    expect(screen.getByText('SRS').closest('tr')).toHaveTextContent('Needs Review');
    expect(screen.getByText('SRS').closest('tr')).toHaveTextContent('Selected: File 2');
    expect(workflow.state.attempts[1].reviewStatus).toBe('Received');
  });

  it('invalidates the explicit choice when the selected saved response materially changes', async () => {
    workflow.state = createState({ conflicting: true });
    const view = renderPage();
    await chooseGroupOutput('ALPHA, ANA');
    workflow.state = {
      ...workflow.state,
      attempts: workflow.state.attempts.map((response) => response.id === 'response-a1'
        ? { ...response, updatedAt: '2026-04-17T13:00:00+08:00', values: { documentPdf: 'https://drive.google.com/file/d/revised-file/view' }, reviewStatus: 'Received', acceptance: null }
        : response)
    };
    view.rerender(adviserTree());
    expect(screen.getByRole('textbox', { name: 'Current group output' })).toHaveValue('');
    expect(screen.getByText('Selection required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept group output' })).toBeDisabled();
  });

  it('keeps an accepted member response as the target when a newer member submits the same output', async () => {
    workflow.state = createState();
    workflow.state.attempts[0].reviewStatus = 'Accepted';
    workflow.state.attempts[0].acceptance = { acceptedAt: '2026-04-17T11:00:00+08:00', sourceResponseUpdatedAt: workflow.state.attempts[0].updatedAt };
    workflow.state.attempts[0].feedback = [{ note: 'Feedback belongs to the accepted response.', visibility: 'Student' }];
    renderPage();
    expect(screen.getByRole('textbox', { name: 'Feedback for student' })).toHaveValue('Feedback belongs to the accepted response.');
    expect(screen.getByRole('button', { name: 'Revoke acceptance' })).toBeEnabled();
    expect(screen.getByText('SRS').closest('tr')).toHaveTextContent('Accepted');
  });

  it('keeps choices scoped to team, deliverable, and workspace', async () => {
    workflow.state = createState({ conflicting: true });
    const original = workflow.state;
    original.students.push({ studentNumber: '22-2002-002', name: 'DELTA, DAN', teamCode: TEAM_B, adviser: 'Prof. Adrian Flores' });
    original.attempts = original.attempts.filter((response) => response.teamCode !== TEAM_B).concat(original.attempts.filter((response) => response.teamCode === TEAM_A).map((response, index) => ({ ...response, id: `response-b${index + 1}`, teamCode: TEAM_B, studentNumber: `22-200${index + 1}-00${index + 1}`, studentName: index ? 'DELTA, DAN' : 'GAMMA, GIO' })));
    workflow.staffIdentity.assignments.push({ workspaceId: 'workspace-it', teamCode: TEAM_B });
    const view = renderPage();
    await chooseGroupOutput('ALPHA, ANA');
    fireEvent.click(screen.getByRole('button', { name: new RegExp(TEAM_B) }));
    expect(screen.getByRole('textbox', { name: 'Current group output' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Accept group output' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(TEAM_A) }));
    expect(screen.getByRole('textbox', { name: 'Current group output' })).toHaveValue('File 2 | ALPHA, ANA');
    fireEvent.click(screen.getByText('SDD').closest('tr'));
    expect(screen.getByRole('textbox', { name: 'Feedback for student' })).toBeDisabled();
    fireEvent.click(screen.getByText('SRS').closest('tr'));
    workflow.workspaceId = 'workspace-cs';
    workflow.staffIdentity = { ...workflow.staffIdentity, assignments: [{ workspaceId: 'workspace-cs', teamCode: TEAM_A }] };
    view.rerender(adviserTree());
    expect(screen.getByRole('textbox', { name: 'Current group output' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Accept group output' })).toBeDisabled();
  });

  it('groups identical configured artifacts despite different student identity and ancillary answers', () => {
    const state = createMultiArtifactState();
    state.attempts[0].values.validationStep = 'Second submission';
    state.attempts[0].values.unconfiguredLink = 'https://drive.google.com/file/d/ancillary-file/view';
    const team = { teamCode: TEAM_A, members: state.students.filter((student) => student.teamCode === TEAM_A) };
    const row = buildTeamDeliverableRows(state, team).find((item) => item.deliverable.id === 'deliv-mvp-validation');
    expect(row.outputs).toHaveLength(1);
    expect(row.hasConflict).toBe(false);
    expect(row.outputs[0].responses).toHaveLength(2);
  });

  it('keeps swapped configured PDF fields and case-sensitive Drive file IDs distinct', () => {
    const state = createMultiArtifactState();
    const first = state.attempts[0];
    const second = state.attempts[1];
    first.values = { ...second.values };
    [first.values.frameworkModel, first.values.validationHighlights] = [first.values.validationHighlights, first.values.frameworkModel];
    const team = { teamCode: TEAM_A, members: state.students.filter((student) => student.teamCode === TEAM_A) };
    expect(buildTeamDeliverableRows(state, team)[0].outputs).toHaveLength(2);
    first.values = { ...second.values, frameworkModel: 'https://drive.google.com/file/d/Framework-pdf/view' };
    expect(buildTeamDeliverableRows(state, team)[0].outputs).toHaveLength(2);
  });

  it('does not pull another saved team output into the team through a matching roster number', () => {
    const state = createState();
    state.attempts.push({ ...state.attempts[0], id: 'other-team-same-student', teamCode: TEAM_B, values: { documentPdf: 'https://drive.google.com/file/d/other-file/view' } });
    const team = { teamCode: TEAM_A, members: state.students.filter((student) => student.teamCode === TEAM_A) };
    const row = buildTeamDeliverableRows(state, team)[0];
    expect(row.outputs).toHaveLength(1);
    expect(row.responses.map((response) => response.id)).not.toContain('other-team-same-student');
  });

  it('shows existing AI Review results without exposing run or rerun controls', () => {
    renderPage();

    // Structured, source-labeled findings replace the overlapping top-level
    // narrative when both are available; the underlying saved report remains intact.
    expect(screen.queryByText('Requirements are present, but traceability needs staff review.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View AI Review' })).toBeInTheDocument();
    expect(screen.queryByText(/Document evidence:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Run AI Review|Rerun AI Review/i })).not.toBeInTheDocument();
  });

  it('opens a legacy current aiReport from View AI Review without running a provider', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'View AI Review' }));
    const dialog = await screen.findByRole('dialog', { name: 'AI Review: Software Requirements Specification' });
    expect(dialog).toHaveTextContent('The submitted PDF does not clearly connect requirements to acceptance evidence.');
    expect(workflow.runDocumentCheck).not.toHaveBeenCalled();
  });

  it('shows staff-only modifier metadata and WildTrack history inside Document Check', async () => {
    workflow.state = createState();
    const response = workflow.state.attempts.find((item) => item.id === 'response-a2');
    response.documentCheck.checkedAt = '2026-04-17T10:45:00+08:00';
    response.documentCheck.sourceUrl = response.values.documentPdf;
    response.observedFileHistory = {
      sourceLabel: 'WildTrack Document Check observation',
      coverageMessage: 'This history contains only file states WildTrack observed when Document Check ran.',
      olderRevisionHistoryMessage: 'Older Google Drive revision history is unavailable with the current API-key connection.',
      observations: [{
        changeType: 'CONTENT_CHANGED',
        firstObservedAt: '2026-04-17T10:45:00+08:00',
        lastObservedAt: '2026-04-17T10:45:00+08:00',
        driveModifiedTime: '2026-04-17T10:40:00+08:00',
        driveCreatedTime: '2026-04-01T08:00:00+08:00',
        driveOwner: 'Original Drive Owner',
        contentIdentifier: 'md5:changed123',
        modifiedBy: 'editor@example.com',
        editorMetadataSource: 'Google Drive File metadata'
      }]
    };
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'View Document Check' }));
    const dialog = await screen.findByRole('dialog', { name: /Document Check/i });
    expect(dialog).toHaveTextContent('Last modified byeditor@example.com');
    expect(dialog).toHaveTextContent('Created time');
    expect(dialog).toHaveTextContent('Drive ownerOriginal Drive Owner');
    fireEvent.click(within(dialog).getByRole('tab', { name: 'File history' }));
    expect(screen.getByRole('heading', { name: 'Recorded checks' })).toBeInTheDocument();
    expect(screen.getByText(/only file states WildTrack observed/i)).toBeInTheDocument();
    expect(screen.getByText('Content changed')).toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: 'WildTrack observations' })).toHaveTextContent('editor@example.com');
    const technicalDetails = screen.getByText('Technical record details').closest('details');
    expect(technicalDetails).not.toHaveAttribute('open');
    fireEvent.click(within(technicalDetails).getByText('Technical record details'));
    expect(technicalDetails).toHaveTextContent('Google Drive File metadata');
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
    expect(screen.queryByRole('group', { name: 'Student Number artifact' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Student Name artifact' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Team Code artifact' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Section artifact' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Validation step artifact' })).not.toBeInTheDocument();
    expect(within(formArtifact).getByText('Google Form')).toBeInTheDocument();
    expect(within(formArtifact).queryByRole('button', { name: /Document Check/i })).not.toBeInTheDocument();
    expect(within(frameworkArtifact).getByRole('button', { name: 'View Document Check' })).toBeInTheDocument();
    expect(within(frameworkArtifact).getByRole('button', { name: 'View AI Review' })).toBeInTheDocument();

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

  it('saves student-visible feedback against the selected group output', async () => {
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

  it('restores the selected team and deliverable from the URL after a reload', () => {
    workflow.staffIdentity.assignments = [
      { workspaceId: 'workspace-it', teamCode: TEAM_A },
      { workspaceId: 'workspace-it', teamCode: TEAM_B }
    ];

    renderPage('adviser', `/adviser?team=${TEAM_B}&deliverable=deliv-sdd`);

    expect(screen.getByRole('button', { name: new RegExp(TEAM_B) })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('heading', { name: 'Software Design Description' })).toBeInTheDocument();
    expect(screen.getByTestId('current-adviser-location')).toHaveTextContent(`team=${TEAM_B}`);
    expect(screen.getByTestId('current-adviser-location')).toHaveTextContent('deliverable=deliv-sdd');
  });

  it('updates the URL when the adviser changes team or deliverable', async () => {
    workflow.staffIdentity.assignments = [
      { workspaceId: 'workspace-it', teamCode: TEAM_A },
      { workspaceId: 'workspace-it', teamCode: TEAM_B }
    ];
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(TEAM_B) }));
    await waitFor(() => expect(screen.getByTestId('current-adviser-location')).toHaveTextContent(`team=${TEAM_B}`));

    fireEvent.click(screen.getByText('SDD').closest('tr'));
    await waitFor(() => expect(screen.getByTestId('current-adviser-location')).toHaveTextContent('deliverable=deliv-sdd'));
    expect(screen.getByRole('heading', { name: 'Software Design Description' })).toBeInTheDocument();
  });

  it('restores earlier team and deliverable selections through browser history', async () => {
    workflow.staffIdentity.assignments = [
      { workspaceId: 'workspace-it', teamCode: TEAM_A },
      { workspaceId: 'workspace-it', teamCode: TEAM_B }
    ];
    renderPage('adviser', `/adviser?team=${TEAM_A}&deliverable=deliv-srs`);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(TEAM_B) }));
    fireEvent.click(screen.getByText('SDD').closest('tr'));
    await waitFor(() => expect(screen.getByTestId('current-adviser-location')).toHaveTextContent('deliverable=deliv-sdd'));

    fireEvent.click(screen.getByTestId('adviser-history-back'));
    await waitFor(() => expect(screen.getByTestId('current-adviser-location')).toHaveTextContent(`team=${TEAM_B}`));
    expect(screen.getByTestId('current-adviser-location')).toHaveTextContent('deliverable=deliv-srs');
    expect(screen.getByRole('heading', { name: 'Software Requirements Specification' })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('adviser-history-back'));
    await waitFor(() => expect(screen.getByTestId('current-adviser-location')).toHaveTextContent(`team=${TEAM_A}`));
    expect(screen.getByRole('button', { name: new RegExp(TEAM_A) })).toHaveAttribute('aria-current', 'true');
  });

  it('rejects a stale or unauthorized team in the URL and falls back to an assigned team', async () => {
    renderPage('adviser', `/adviser?team=${TEAM_B}&deliverable=deliv-sdd`);

    expect(screen.queryByText(TEAM_B)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('current-adviser-location')).toHaveTextContent(`team=${TEAM_A}`));
    expect(screen.getByRole('button', { name: new RegExp(TEAM_A) })).toHaveAttribute('aria-current', 'true');
  });

  it('keeps persisted feedback editable when the already-selected deliverable is opened again', () => {
    workflow.state = createState();
    workflow.state.attempts.find((response) => response.id === 'response-a2').feedback = [{
      id: 'feedback-existing',
      note: 'This feedback must survive reopening the current deliverable.',
      author: 'adviser@school.edu',
      visibility: 'Student',
      updatedAt: '2026-09-15T12:11:00+08:00'
    }];
    renderPage();

    const editor = screen.getByRole('textbox', { name: 'Feedback for student' });
    expect(editor).toHaveValue('This feedback must survive reopening the current deliverable.');

    fireEvent.click(screen.getByText('SRS', { selector: 'p' }).closest('tr'));

    expect(editor).toHaveValue('This feedback must survive reopening the current deliverable.');
    expect(screen.getByRole('button', { name: 'Update feedback' })).toBeDisabled();
  });

  it('uses a compact artifact-specific link action instead of a full-width submitted-link button', () => {
    renderPage();

    expect(screen.getByRole('link', { name: 'Open PDF' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open submitted link' })).not.toBeInTheDocument();
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
