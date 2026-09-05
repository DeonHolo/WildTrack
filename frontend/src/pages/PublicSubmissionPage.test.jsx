import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { PublicSubmissionPage } from './PublicSubmissionPage.jsx';

const api = vi.hoisted(() => ({
  clearDraft: vi.fn(),
  confirmStudentAssociation: vi.fn(),
  getDraft: vi.fn(),
  getPublicSubmissionForm: vi.fn(),
  getMyAssociation: vi.fn(),
  getMyResponse: vi.fn(),
  saveDraft: vi.fn(),
  submitResponse: vi.fn()
}));

vi.mock('../lib/api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  clearDraft: api.clearDraft,
  confirmStudentAssociation: api.confirmStudentAssociation,
  getDraft: api.getDraft,
  getPublicSubmissionForm: api.getPublicSubmissionForm,
  getMyAssociation: api.getMyAssociation,
  getMyResponse: api.getMyResponse,
  saveDraft: api.saveDraft,
  submitResponse: api.submitResponse
}));

const createState = () => ({
  classRecord: {
    name: 'IT Capstone - IT332',
    trackerSheet: 'IT332 Tracker'
  },
  students: [
    {
      studentNumber: '22-1001-001',
      name: 'DELA CRUZ, JUAN CARLOS M.',
      teamCode: '2526-sem2-it332-11',
      memberNumber: 1,
      adviser: 'Sir Roberto Villanueva'
    },
    {
      studentNumber: '22-1002-002',
      name: 'SANTOS, MARIA L.',
      teamCode: '2526-sem2-it332-12',
      memberNumber: 2,
      adviser: 'Prof. Ana Reyes'
    }
  ],
  attempts: []
});

const workflow = vi.hoisted(() => ({
  state: null,
  authenticateGoogleAccount: vi.fn(),
  refreshBackendData: vi.fn()
}));

const workspaceSession = vi.hoisted(() => ({
  activeWorkspace: {
    id: 'workspace-it',
    name: 'IT Capstone - IT332',
    program: 'IT',
    courseCode: 'IT332',
    semester: 'Semester 2',
    academicYear: '2025-26'
  },
  activeWorkspaceId: 'workspace-it',
  session: { authenticated: true, email: 'form.student@gmail.com', roles: [] },
  account: { email: 'form.student@gmail.com', name: '' },
  needsWorkspaceChoice: false,
  switchWorkspace: vi.fn()
}));

vi.mock('../app/WorkflowContext.jsx', () => ({
  useWorkflow: () => workflow
}));

vi.mock('../app/WorkspaceSession.jsx', () => ({
  useWorkspaceSession: () => workspaceSession
}));

function setServerSession(email = 'form.student@gmail.com') {
  workspaceSession.session = { authenticated: true, email, roles: [] };
  workspaceSession.account = { email, name: '' };
}

function setAnonymousSession() {
  workspaceSession.session = { authenticated: false, roles: [] };
  workspaceSession.account = null;
}

function FormHarness({ path = '/submit/week-9-srs' }) {
  return (
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ModalsProvider>
        <MemoryRouter
          initialEntries={[path]}
          future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        >
          <Routes>
            <Route path="/submit/:slug" element={<PublicSubmissionPage />} />
            <Route path="/w/:workspaceKey/submit/:slug" element={<PublicSubmissionPage />} />
          </Routes>
        </MemoryRouter>
      </ModalsProvider>
    </MantineProvider>
  );
}

function renderForm(path = '/submit/week-9-srs') {
  return render(<FormHarness path={path} />);
}

async function selectStudent() {
  const studentNumber = await screen.findByRole('combobox', { name: /Student Number/i });
  fireEvent.focus(studentNumber);
  fireEvent.change(studentNumber, { target: { value: '22-1001' } });
  fireEvent.click(screen.getByRole('option', { name: '22-1001-001' }));
}

async function selectStudentByName(name = 'DELA CRUZ') {
  const studentName = await screen.findByRole('combobox', { name: /Student Name/i });
  fireEvent.focus(studentName);
  fireEvent.change(studentName, { target: { value: name } });
  fireEvent.click(screen.getByRole('option', { name: /DELA CRUZ, JUAN CARLOS M\./i }));
}

describe('public submission form', () => {
  it('accepts the workspace from a form link even when it matches the unconfirmed default', async () => {
    workspaceSession.needsWorkspaceChoice = true;
    renderForm('/w/workspace-it/submit/week-9-srs');
    await waitFor(() => expect(workspaceSession.switchWorkspace).toHaveBeenCalledWith('workspace-it'));
    expect(await screen.findByRole('heading', { name: 'Week 9: Software Requirements Specification' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Workspace' })).not.toBeInTheDocument();
  });

  beforeEach(() => {
    workflow.state = createState();
    setServerSession();
    workspaceSession.activeWorkspace = {
      id: 'workspace-it',
      name: 'IT Capstone - IT332',
      program: 'IT',
      courseCode: 'IT332',
      semester: 'Semester 2',
      academicYear: '2025-26'
    };
    workspaceSession.activeWorkspaceId = 'workspace-it';
    workspaceSession.needsWorkspaceChoice = false;
    workspaceSession.switchWorkspace.mockReset();
    workspaceSession.switchWorkspace.mockResolvedValue({ ok: true });
    workflow.authenticateGoogleAccount.mockReset();
    workflow.refreshBackendData.mockReset().mockResolvedValue({ ok: true });
    api.clearDraft.mockReset().mockResolvedValue(undefined);
    api.confirmStudentAssociation.mockReset().mockImplementation(async (_workspaceId, studentNumber) => {
      const student = workflow.state.students.find((item) => item.studentNumber === studentNumber);
      return student ? {
        studentNumber: student.studentNumber,
        studentName: student.name,
        teamCode: student.teamCode
      } : null;
    });
    api.getDraft.mockReset().mockResolvedValue({ present: false, values: null, revision: 0 });
    api.getPublicSubmissionForm.mockReset();
    api.getPublicSubmissionForm.mockResolvedValue({
      workspace: workspaceSession.activeWorkspace,
      deliverable: {
        id: 'deliv-srs',
        trackerColumnKey: 'SRS',
        title: 'Week 9: Software Requirements Specification',
        slug: 'week-9-srs',
        instructions: 'Submit your SRS as a PDF Drive file.',
        dueAt: '2026-04-18T23:59:00',
        pdfRequired: true,
        status: 'PUBLISHED'
      }
    });
    api.getMyAssociation.mockReset();
    api.getMyAssociation.mockResolvedValue(null);
    api.getMyResponse.mockReset();
    api.getMyResponse.mockResolvedValue(null);
    api.saveDraft.mockReset().mockResolvedValue({ present: true, values: {}, revision: 1 });
    api.submitResponse.mockReset().mockResolvedValue({
      changed: true,
      responseId: 'server-response',
      revision: 1,
      valuesJson: '{}'
    });
  });

  it('loads a published workspace form for an anonymous visitor without private workspace data', async () => {
    setAnonymousSession();
    workflow.state = {
      ...createState(),
      students: []
    };
    workspaceSession.switchWorkspace.mockResolvedValue({ ok: false, error: 'Private workspace access is not available.' });

    renderForm('/w/it-it332-2025-26-semester-2/submit/week-9-srs');

    expect(await screen.findByRole('heading', { name: 'Week 9: Software Requirements Specification' })).toBeInTheDocument();
    expect(screen.getAllByText('Continue with Google').length).toBeGreaterThan(0);
    expect(api.getPublicSubmissionForm).toHaveBeenCalledWith('it-it332-2025-26-semester-2', 'week-9-srs');
  });

  it('prefills existing server submission for authenticated owner and marks it ready to edit (ticket 05)', async () => {
    localStorage.clear();
    api.getMyResponse.mockResolvedValue({
      id: 'server-resp-1',
      deliverableId: 'deliv-srs',
      revision: 2,
      valuesJson: JSON.stringify({ documentPdf: 'https://drive.google.com/file/d/my-prior-srs/view' })
    });
    renderForm('/submit/week-9-srs?student=22-1001-001');

    await waitFor(() => {
      expect(screen.getByText(/Your previous response is ready to edit/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue('https://drive.google.com/file/d/my-prior-srs/view')).toBeInTheDocument();
    });
  });

  it('restores a server draft after browser storage is cleared', async () => {
    localStorage.clear();
    api.getDraft.mockResolvedValue({
      present: true,
      values: { documentPdf: 'https://drive.google.com/file/d/server-draft/view' },
      revision: 3
    });

    renderForm();

    expect(await screen.findByRole('textbox', { name: /PDF Drive Link/i }))
      .toHaveValue('https://drive.google.com/file/d/server-draft/view');
    expect(api.getDraft).toHaveBeenCalledWith('workspace-it', 'deliv-srs');
  });

  it('preserves draft revision conflicts and tells the student to reload', async () => {
    api.getDraft.mockResolvedValue({
      present: true,
      values: { documentPdf: 'https://drive.google.com/file/d/server-draft/view' },
      revision: 3
    });
    api.saveDraft.mockResolvedValue({ conflict: true });
    renderForm();

    const input = await screen.findByRole('textbox', { name: /PDF Drive Link/i });
    fireEvent.change(input, { target: { value: 'https://drive.google.com/file/d/edited-draft/view' } });

    await waitFor(() => expect(api.saveDraft).toHaveBeenCalledWith(
      'workspace-it',
      'deliv-srs',
      { documentPdf: 'https://drive.google.com/file/d/edited-draft/view' },
      3
    ), { timeout: 2500 });
    await waitFor(() => expect(screen.getByRole('status'))
      .toHaveTextContent('Draft changed in another session. Reload to continue.'));
  });

  it('maintains institutional roster casing on student name prefill (ticket 04)', async () => {
    api.getMyAssociation.mockResolvedValue({
      studentNumber: '22-1001-001',
      studentName: 'Deon Holo', // Title case from Google/OAuth
      teamCode: '2526-sem2-it332-11'
    });
    renderForm('/submit/week-9-srs');

    await waitFor(() => {
      // Must match official roster name 'DELA CRUZ, JUAN CARLOS M.', not 'Deon Holo'
      expect(screen.getByDisplayValue('DELA CRUZ, JUAN CARLOS M.')).toBeInTheDocument();
    });
  });

  it('requires verified Google identity before class-record and submission fields are shown', async () => {
    setAnonymousSession();
    renderForm();

    expect(await screen.findByRole('heading', { name: 'Week 9: Software Requirements Specification' })).toBeInTheDocument();
    expect(screen.getAllByText('Continue with Google').length).toBeGreaterThan(0);
    expect(screen.getByText('Use your Google account before entering your student and submission details.')).toBeInTheDocument();
    expect(screen.queryByText(/A response already exists for this Student Number/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No separate WildTrack password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Student Number/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /PDF Drive Link/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit response/i })).not.toBeInTheDocument();
  });

  it('opens as one WildTrack form with accessible header artwork', async () => {
    renderForm();

    expect(await screen.findByRole('heading', { name: 'Week 9: Software Requirements Specification' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /WildTrack/i })).toBeInTheDocument();
    const formArtwork = screen.getByRole('img', { name: /WildTrack mascot presenting a PDF/i });
    expect(formArtwork).toHaveStyle('background-image: url("/assets/Showing%20PDF.webp")');
    expect(formArtwork).toHaveStyle('background-size: auto 100%');
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
  });

  it('keeps all submitted identity fields visible and autofills them from Student Number', async () => {
    renderForm();

    await selectStudent();

    expect(screen.getByRole('combobox', { name: /Student Number/i })).toHaveValue('22-1001-001');
    expect(screen.getByRole('combobox', { name: /Student Name/i })).toHaveValue('DELA CRUZ, JUAN CARLOS M.');
    expect(screen.getByRole('combobox', { name: /Team Code/i })).toHaveValue('2526-sem2-it332-11');
    expect(screen.queryByText(/class-record entries available/i)).not.toBeInTheDocument();
  });

  it('shows each identity result as only the value belonging to that field', async () => {
    renderForm();

    const studentNumber = await screen.findByRole('combobox', { name: /Student Number/i });
    fireEvent.focus(studentNumber);
    fireEvent.change(studentNumber, { target: { value: '22-1001' } });

    const numberListbox = screen.getByRole('listbox');
    expect(within(numberListbox).getByRole('option', { name: '22-1001-001' })).toBeInTheDocument();
    expect(within(numberListbox).queryByText('DELA CRUZ, JUAN CARLOS M.')).not.toBeInTheDocument();
    expect(within(numberListbox).queryByText('2526-sem2-it332-11')).not.toBeInTheDocument();
  });

  it('autofills Student Number and Team Code when a Student Name is selected', async () => {
    renderForm();

    await selectStudentByName();

    expect(screen.getByRole('combobox', { name: /Student Number/i })).toHaveValue('22-1001-001');
    expect(screen.getByRole('combobox', { name: /Student Name/i })).toHaveValue('DELA CRUZ, JUAN CARLOS M.');
    expect(screen.getByRole('combobox', { name: /Team Code/i })).toHaveValue('2526-sem2-it332-11');
  });

  it('keeps all three identity fields required after autofill', async () => {
    renderForm();
    await selectStudent();

    fireEvent.change(screen.getByRole('combobox', { name: /Student Name/i }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('textbox', { name: /PDF Drive Link/i }), {
      target: { value: 'https://drive.google.com/file/d/submission' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Submit response/i }));

    expect(await screen.findByText('Choose a Student Name.')).toBeInTheDocument();
    expect(api.submitResponse).not.toHaveBeenCalled();
  });

  it('prefills editable identity fields for the active account without a locked record mode', async () => {
    setServerSession('juan.student@gmail.com');
    api.getMyAssociation.mockResolvedValue({
      studentNumber: '22-1001-001',
      studentName: 'DELA CRUZ, JUAN CARLOS M.',
      teamCode: '2526-sem2-it332-11'
    });
    renderForm();

    expect(await screen.findByRole('combobox', { name: /Student Number/i })).toHaveValue('22-1001-001');
    expect(screen.getByRole('combobox', { name: /Student Name/i })).toHaveValue('DELA CRUZ, JUAN CARLOS M.');
    expect(screen.getByRole('combobox', { name: /Team Code/i })).toHaveValue('2526-sem2-it332-11');
    expect(screen.getByText(/associated with juan\.student@gmail\.com/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Use a different student record/i })).not.toBeInTheDocument();
  });

  it('autofills and retains the server association independently of legacy account mirrors', async () => {
    setServerSession('juan.student@gmail.com');
    api.getMyAssociation.mockResolvedValue({
      studentNumber: '22-1001-001',
      studentName: 'DELA CRUZ, JUAN CARLOS M.',
      teamCode: '2526-sem2-it332-11'
    });

    renderForm('/w/workspace-it/submit/week-9-srs');

    expect(await screen.findByRole('combobox', { name: /Student Number/i })).toHaveValue('22-1001-001');
    expect(screen.getByRole('combobox', { name: /Student Name/i })).toHaveValue('DELA CRUZ, JUAN CARLOS M.');
    expect(screen.getByRole('combobox', { name: /Team Code/i })).toHaveValue('2526-sem2-it332-11');
  });

  it('does not let a query parameter silently replace a returning account identity', async () => {
    setServerSession('juan.student@gmail.com');
    api.getMyAssociation.mockResolvedValue({
      studentNumber: '22-1001-001',
      studentName: 'DELA CRUZ, JUAN CARLOS M.',
      teamCode: '2526-sem2-it332-11'
    });
    renderForm('/submit/week-9-srs?student=22-1002-002');

    expect(await screen.findByRole('combobox', { name: /Student Number/i })).toHaveValue('22-1001-001');
    expect(screen.getByRole('combobox', { name: /Student Name/i })).toHaveValue('DELA CRUZ, JUAN CARLOS M.');
    expect(screen.getByRole('combobox', { name: /Team Code/i })).toHaveValue('2526-sem2-it332-11');
  });

  it('prefills only a response owned by the active account', async () => {
    setServerSession('juan.student@gmail.com');
    api.getMyAssociation.mockResolvedValue({
      studentNumber: '22-1001-001',
      studentName: 'DELA CRUZ, JUAN CARLOS M.',
      teamCode: '2526-sem2-it332-11'
    });
    api.getMyResponse.mockResolvedValue({
      id: 'resp-owned',
      valuesJson: JSON.stringify({ documentPdf: 'https://drive.google.com/file/d/owned-response' })
    });
    renderForm();

    expect(await screen.findByRole('textbox', { name: /PDF Drive Link/i })).toHaveValue('https://drive.google.com/file/d/owned-response');
    expect(screen.getByRole('button', { name: /Save response changes/i })).toBeInTheDocument();
  });

  it('clears the previous account response before loading a new session scope', async () => {
    setServerSession('first.student@gmail.com');
    api.getMyResponse.mockResolvedValueOnce({
      id: 'resp-first',
      valuesJson: JSON.stringify({ documentPdf: 'https://drive.google.com/file/d/first-private-response' })
    });
    const view = renderForm();

    expect(await screen.findByRole('textbox', { name: /PDF Drive Link/i }))
      .toHaveValue('https://drive.google.com/file/d/first-private-response');

    let resolveNextResponse;
    api.getMyResponse.mockImplementationOnce(() => new Promise((resolve) => { resolveNextResponse = resolve; }));
    setServerSession('second.student@gmail.com');
    view.rerender(<FormHarness />);

    await waitFor(() => expect(screen.getByRole('textbox', { name: /PDF Drive Link/i })).toHaveValue(''));
    resolveNextResponse(null);
    await waitFor(() => expect(api.getMyResponse).toHaveBeenCalledTimes(2));
  });

  it('ignores private response values that exist only in the legacy workflow mirror', async () => {
    workflow.state.attempts = [{
      id: 'resp-owned',
      deliverableId: 'deliv-srs',
      studentNumber: '22-1001-001',
      googleSubject: 'google-juan',
      googleEmailSnapshot: 'juan.student@gmail.com',
      values: { documentPdf: 'https://drive.google.com/file/d/owned-response' }
    }];
    renderForm();

    await selectStudent();
    expect(screen.getByRole('textbox', { name: /PDF Drive Link/i })).toHaveValue('');
    expect(document.body).not.toHaveTextContent('owned-response');
  });

  it('does not expose another user response held only in the legacy workflow mirror', async () => {
    workflow.state.attempts = [{
      id: 'resp-private',
      deliverableId: 'deliv-srs',
      studentNumber: '22-1001-001',
      values: { documentPdf: 'https://drive.google.com/file/d/private-response' }
    }];
    renderForm();
    await selectStudent();

    expect(screen.getByRole('textbox', { name: /PDF Drive Link/i })).toHaveValue('');
    expect(document.body).not.toHaveTextContent('private-response');
  });

  it('places identity validation beside the form when no class record is selected', async () => {
    renderForm();
    fireEvent.click(await screen.findByRole('button', { name: 'Submit response' }));

    expect(screen.getByRole('alert')).toHaveTextContent("Choose a Student Number from this workspace's class record.");
  });

  it('disables the submission action while the response is saving', async () => {
    api.submitResponse.mockReturnValue(new Promise(() => {}));
    renderForm();
    await selectStudent();
    fireEvent.change(screen.getByRole('textbox', { name: /PDF Drive Link/i }), { target: { value: 'https://drive.google.com/file/d/final-pdf' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit response' })).toBeDisabled());
  });

  it('shows a backend submission failure without creating a local-only success', async () => {
    api.submitResponse.mockRejectedValue(new Error('Network unavailable.'));
    renderForm();
    await selectStudent();
    fireEvent.change(screen.getByRole('textbox', { name: /PDF Drive Link/i }), {
      target: { value: 'https://drive.google.com/file/d/final-pdf' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable.');
    expect(screen.queryByRole('heading', { name: /Response received|Response updated|No changes saved/i })).not.toBeInTheDocument();
  });

  it('surfaces a submission revision conflict without showing a saved result', async () => {
    api.submitResponse.mockResolvedValue({ conflict: true });
    renderForm();
    await selectStudent();
    fireEvent.change(screen.getByRole('textbox', { name: /PDF Drive Link/i }), {
      target: { value: 'https://drive.google.com/file/d/final-pdf' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('A newer version was saved from another session. Reload the form to continue editing.');
    expect(screen.queryByRole('heading', { name: /Response received|Response updated|No changes saved/i })).not.toBeInTheDocument();
  });

  it('confirms a newly selected Student Number on the server before submitting', async () => {
    renderForm();
    await selectStudent();
    fireEvent.change(screen.getByRole('textbox', { name: /PDF Drive Link/i }), {
      target: { value: 'https://drive.google.com/file/d/final-pdf' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));

    await waitFor(() => expect(api.confirmStudentAssociation).toHaveBeenCalledWith('workspace-it', '22-1001-001'));
    expect(api.submitResponse).toHaveBeenCalled();
  });

  it.each([
    [{}, 'Response received'],
    [{ updated: true }, 'Response updated'],
    [{ unchanged: true }, 'No changes saved']
  ])('shows the complete result state after submission', async (overrides, expectedTitle) => {
    api.submitResponse.mockResolvedValue({
      changed: !overrides.unchanged,
      responseId: 'server-response',
      revision: overrides.updated ? 2 : 1,
      valuesJson: '{}'
    });
    renderForm();
    await selectStudent();
    fireEvent.change(screen.getByRole('textbox', { name: /PDF Drive Link/i }), { target: { value: 'https://drive.google.com/file/d/final-pdf' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));

    expect(await screen.findByRole('heading', { name: expectedTitle })).toBeInTheDocument();
    const successArtwork = screen.getByRole('img', { name: /WildTrack mascot celebrating a recorded submission/i });
    expect(successArtwork).toHaveStyle('background-image: url("/assets/Good%20Job.webp")');
    expect(successArtwork).toHaveStyle('background-size: auto 100%');
    expect(screen.getByText('Student Number')).toBeInTheDocument();
    expect(screen.getByText('22-1001-001')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open student dashboard/i })).toBeInTheDocument();
  });

  it('shows an unavailable state for an unpublished form', async () => {
    api.getPublicSubmissionForm.mockResolvedValue({
      workspace: workspaceSession.activeWorkspace,
      deliverable: {
        id: 'deliv-srs',
        trackerColumnKey: 'SRS',
        title: 'Week 9: Software Requirements Specification',
        slug: 'week-9-srs',
        instructions: 'Submit your SRS as a PDF Drive file.',
        dueAt: '2026-04-18T23:59:00',
        pdfRequired: true,
        status: 'UNPUBLISHED'
      }
    });
    renderForm();

    expect(await screen.findByRole('heading', { name: 'Submission form unavailable' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit response/i })).not.toBeInTheDocument();
  });

  it('shows a not-found state for an unknown submission link', async () => {
    api.getPublicSubmissionForm.mockResolvedValue(null);
    renderForm('/submit/not-a-form');

    expect(await screen.findByRole('heading', { name: 'Submission form not found' })).toBeInTheDocument();
  });

  it('shows a loading state while switching to the form workspace', async () => {
    api.getPublicSubmissionForm.mockResolvedValue({
      workspace: { ...workspaceSession.activeWorkspace, id: 'workspace-cs', program: 'CS' },
      deliverable: {
        id: 'deliv-srs',
        trackerColumnKey: 'SRS',
        title: 'Week 9: Software Requirements Specification',
        slug: 'week-9-srs',
        instructions: 'Submit your SRS as a PDF Drive file.',
        dueAt: '2026-04-18T23:59:00',
        pdfRequired: true,
        status: 'PUBLISHED'
      }
    });
    workspaceSession.switchWorkspace.mockReturnValue(new Promise(() => {}));
    renderForm('/w/workspace-cs/submit/week-9-srs');

    await waitFor(() => expect(workspaceSession.switchWorkspace).toHaveBeenCalledWith('workspace-cs'));
    expect(screen.getByRole('heading', { name: 'Opening submission form' })).toBeInTheDocument();
  });

  it('shows a recoverable error when the form workspace cannot be opened', async () => {
    api.getPublicSubmissionForm.mockResolvedValue({
      workspace: { ...workspaceSession.activeWorkspace, id: 'workspace-cs', program: 'CS' },
      deliverable: {
        id: 'deliv-srs',
        trackerColumnKey: 'SRS',
        title: 'Week 9: Software Requirements Specification',
        slug: 'week-9-srs',
        instructions: 'Submit your SRS as a PDF Drive file.',
        dueAt: '2026-04-18T23:59:00',
        pdfRequired: true,
        status: 'PUBLISHED'
      }
    });
    workspaceSession.switchWorkspace.mockResolvedValue({ ok: false, error: 'Workspace access failed.' });
    renderForm('/w/workspace-cs/submit/week-9-srs');

    expect(await screen.findByRole('heading', { name: 'Unable to open submission form' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Workspace access failed.');
  });

  it('uses general link language for a deliverable that does not require a PDF', async () => {
    api.getPublicSubmissionForm.mockResolvedValue({
      workspace: workspaceSession.activeWorkspace,
      deliverable: {
        id: 'deliv-docs',
        trackerColumnKey: 'Documentation',
        title: 'Software Project Documentation',
        slug: 'week-9-srs',
        instructions: 'Submit the required project link.',
        dueAt: '2026-04-18T23:59:00',
        pdfRequired: false,
        status: 'PUBLISHED'
      }
    });
    renderForm();

    expect(await screen.findByText('Submission links required')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Submission Link' })).toBeInTheDocument();
    expect(screen.queryByText('PDF Drive link required')).not.toBeInTheDocument();
    expect(screen.queryByText(/final PDF/i)).not.toBeInTheDocument();
  });
});
