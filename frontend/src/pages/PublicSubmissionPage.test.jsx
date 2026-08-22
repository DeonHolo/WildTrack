import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { PublicSubmissionPage } from './PublicSubmissionPage.jsx';

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
  studentAccounts: [],
  activeAccountEmail: '',
  activeStudentNumber: '',
  attempts: [],
  deliverables: [
    {
      id: 'deliv-srs',
      slug: 'week-9-srs',
      title: 'Week 9: Software Requirements Specification',
      shortTitle: 'SRS',
      dueAt: '2026-04-18T23:59:00+08:00',
      trackerColumn: 'SRS',
      status: 'Published',
      instructions: 'Submit your SRS as a PDF Drive file.',
      fields: [
        { id: 'documentPdf', label: 'PDF Drive Link', type: 'drive', required: true, pdfRequired: true }
      ]
    }
  ]
});

const workflow = vi.hoisted(() => ({
  activeWorkspace: {
    id: 'workspace-it',
    name: 'IT Capstone - IT332',
    program: 'IT',
    courseCode: 'IT332',
    semester: 'Semester 2',
    academicYear: '2025-26'
  },
  activeWorkspaceId: 'workspace-it',
  state: null,
  switchWorkspace: vi.fn(),
  submitPublicForm: vi.fn()
}));

vi.mock('../app/WorkflowContext.jsx', () => ({
  useWorkflow: () => workflow
}));

function renderForm(path = '/submit/week-9-srs') {
  return render(
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

function selectStudent() {
  const studentNumber = screen.getByRole('combobox', { name: /Student Number/i });
  fireEvent.focus(studentNumber);
  fireEvent.change(studentNumber, { target: { value: '22-1001' } });
  fireEvent.click(screen.getByRole('option', { name: '22-1001-001' }));
}

function selectStudentByName(name = 'DELA CRUZ') {
  const studentName = screen.getByRole('combobox', { name: /Student Name/i });
  fireEvent.focus(studentName);
  fireEvent.change(studentName, { target: { value: name } });
  fireEvent.click(screen.getByRole('option', { name: /DELA CRUZ, JUAN CARLOS M\./i }));
}

function successfulResponse(overrides = {}) {
  const student = workflow.state.students[0];
  const deliverable = workflow.state.deliverables[0];
  return {
    ok: true,
    attempt: { primaryStatus: 'Received', reviewStatus: 'Received' },
    student,
    deliverable,
    ...overrides
  };
}

describe('public submission form', () => {
  beforeEach(() => {
    workflow.state = createState();
    workflow.switchWorkspace.mockReset();
    workflow.switchWorkspace.mockResolvedValue({ ok: true });
    workflow.submitPublicForm.mockReset();
  });

  it('opens as one WildTrack form with accessible header artwork', () => {
    renderForm();

    expect(screen.getByRole('link', { name: /WildTrack/i })).toBeInTheDocument();
    const formArtwork = screen.getByRole('img', { name: /WildTrack mascot presenting a PDF/i });
    expect(formArtwork).toHaveStyle('background-image: url("/assets/Showing%20PDF.webp")');
    expect(formArtwork).toHaveStyle('background-size: auto 118%');
    expect(screen.getByRole('heading', { name: 'Week 9: Software Requirements Specification' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
  });

  it('keeps all submitted identity fields visible and autofills them from Student Number', () => {
    renderForm();

    selectStudent();

    expect(screen.getByRole('combobox', { name: /Student Number/i })).toHaveValue('22-1001-001');
    expect(screen.getByRole('combobox', { name: /Student Name/i })).toHaveValue('DELA CRUZ, JUAN CARLOS M.');
    expect(screen.getByRole('combobox', { name: /Team Code/i })).toHaveValue('2526-sem2-it332-11');
    expect(screen.queryByText(/class-record entries available/i)).not.toBeInTheDocument();
  });

  it('shows each identity result as only the value belonging to that field', () => {
    renderForm();

    const studentNumber = screen.getByRole('combobox', { name: /Student Number/i });
    fireEvent.focus(studentNumber);
    fireEvent.change(studentNumber, { target: { value: '22-1001' } });

    const numberListbox = screen.getByRole('listbox');
    expect(within(numberListbox).getByRole('option', { name: '22-1001-001' })).toBeInTheDocument();
    expect(within(numberListbox).queryByText('DELA CRUZ, JUAN CARLOS M.')).not.toBeInTheDocument();
    expect(within(numberListbox).queryByText('2526-sem2-it332-11')).not.toBeInTheDocument();
  });

  it('autofills Student Number and Team Code when a Student Name is selected', () => {
    renderForm();

    selectStudentByName();

    expect(screen.getByRole('combobox', { name: /Student Number/i })).toHaveValue('22-1001-001');
    expect(screen.getByRole('combobox', { name: /Student Name/i })).toHaveValue('DELA CRUZ, JUAN CARLOS M.');
    expect(screen.getByRole('combobox', { name: /Team Code/i })).toHaveValue('2526-sem2-it332-11');
  });

  it('keeps all three identity fields required after autofill', async () => {
    renderForm();
    selectStudent();

    fireEvent.change(screen.getByRole('combobox', { name: /Student Name/i }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('textbox', { name: /PDF Drive Link/i }), {
      target: { value: 'https://drive.google.com/file/d/submission' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Submit response/i }));

    expect(await screen.findByText('Choose a Student Name.')).toBeInTheDocument();
    expect(workflow.submitPublicForm).not.toHaveBeenCalled();
  });

  it('prefills editable identity fields for the active account without a locked record mode', async () => {
    workflow.state.activeAccountEmail = 'juan.student@gmail.com';
    workflow.state.studentAccounts = [{
      email: 'juan.student@gmail.com',
      studentNumber: '22-1001-001',
      studentName: 'DELA CRUZ, JUAN CARLOS M.',
      teamCode: '2526-sem2-it332-11'
    }];
    renderForm();

    expect(await screen.findByRole('combobox', { name: /Student Number/i })).toHaveValue('22-1001-001');
    expect(screen.getByRole('combobox', { name: /Student Name/i })).toHaveValue('DELA CRUZ, JUAN CARLOS M.');
    expect(screen.getByRole('combobox', { name: /Team Code/i })).toHaveValue('2526-sem2-it332-11');
    expect(screen.getByText(/associated with juan\.student@gmail\.com/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Use a different student record/i })).not.toBeInTheDocument();
  });

  it('does not let a query parameter silently replace a returning account identity', async () => {
    workflow.state.activeAccountEmail = 'juan.student@gmail.com';
    workflow.state.studentAccounts = [{
      email: 'juan.student@gmail.com',
      studentNumber: '22-1001-001',
      studentName: 'DELA CRUZ, JUAN CARLOS M.',
      teamCode: '2526-sem2-it332-11'
    }];
    renderForm('/submit/week-9-srs?student=22-1002-002');

    expect(await screen.findByRole('combobox', { name: /Student Number/i })).toHaveValue('22-1001-001');
    expect(screen.getByRole('combobox', { name: /Student Name/i })).toHaveValue('DELA CRUZ, JUAN CARLOS M.');
    expect(screen.getByRole('combobox', { name: /Team Code/i })).toHaveValue('2526-sem2-it332-11');
  });

  it('prefills only a response owned by the active account', async () => {
    workflow.state.activeAccountEmail = 'juan.student@gmail.com';
    workflow.state.studentAccounts = [{
      email: 'juan.student@gmail.com',
      studentNumber: '22-1001-001',
      studentName: 'DELA CRUZ, JUAN CARLOS M.',
      teamCode: '2526-sem2-it332-11'
    }];
    workflow.state.attempts = [{
      id: 'resp-owned',
      deliverableId: 'deliv-srs',
      studentNumber: '22-1001-001',
      googleEmailSnapshot: 'juan.student@gmail.com',
      values: { documentPdf: 'https://drive.google.com/file/d/owned-response' }
    }];
    renderForm();

    expect(await screen.findByRole('textbox', { name: /PDF Drive Link/i })).toHaveValue('https://drive.google.com/file/d/owned-response');
    expect(screen.getByRole('button', { name: /Save response changes/i })).toBeInTheDocument();
  });

  it('clears private response values when a returning account changes to another student record', async () => {
    workflow.state.activeAccountEmail = 'juan.student@gmail.com';
    workflow.state.studentAccounts = [{
      email: 'juan.student@gmail.com',
      studentNumber: '22-1001-001',
      studentName: 'DELA CRUZ, JUAN CARLOS M.',
      teamCode: '2526-sem2-it332-11'
    }];
    workflow.state.attempts = [{
      id: 'resp-owned',
      deliverableId: 'deliv-srs',
      studentNumber: '22-1001-001',
      googleEmailSnapshot: 'juan.student@gmail.com',
      values: { documentPdf: 'https://drive.google.com/file/d/owned-response' }
    }];
    renderForm();

    const studentNumber = await screen.findByRole('combobox', { name: /Student Number/i });
    expect(screen.getByRole('textbox', { name: /PDF Drive Link/i })).toHaveValue('https://drive.google.com/file/d/owned-response');
    fireEvent.change(studentNumber, { target: { value: '22-1002-002' } });

    await waitFor(() => expect(screen.getByRole('textbox', { name: /PDF Drive Link/i })).toHaveValue(''));
    expect(document.body).not.toHaveTextContent('owned-response');
  });

  it('does not expose an existing response link after another user selects the same Student Number', () => {
    workflow.state.attempts = [{
      id: 'resp-private',
      deliverableId: 'deliv-srs',
      studentNumber: '22-1001-001',
      values: { documentPdf: 'https://drive.google.com/file/d/private-response' }
    }];
    renderForm();
    selectStudent();

    expect(screen.getByText(/Existing submitted links stay private/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /PDF Drive Link/i })).toHaveValue('');
    expect(document.body).not.toHaveTextContent('private-response');
  });

  it('places identity validation beside the form when no class record is selected', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));

    expect(screen.getByRole('alert')).toHaveTextContent("Choose a Student Number from this workspace's class record.");
  });

  it('disables the submission action while the response is saving', async () => {
    workflow.submitPublicForm.mockReturnValue(new Promise(() => {}));
    renderForm();
    selectStudent();
    fireEvent.change(screen.getByRole('textbox', { name: /PDF Drive Link/i }), { target: { value: 'https://drive.google.com/file/d/final-pdf' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit response' })).toBeDisabled());
  });

  it.each([
    [{}, 'Response received'],
    [{ updated: true }, 'Response updated'],
    [{ unchanged: true }, 'No changes saved']
  ])('shows the complete result state after submission', async (overrides, expectedTitle) => {
    workflow.submitPublicForm.mockResolvedValue(successfulResponse(overrides));
    renderForm();
    selectStudent();
    fireEvent.change(screen.getByRole('textbox', { name: /PDF Drive Link/i }), { target: { value: 'https://drive.google.com/file/d/final-pdf' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));

    expect(await screen.findByRole('heading', { name: expectedTitle })).toBeInTheDocument();
    const successArtwork = screen.getByRole('img', { name: /WildTrack mascot celebrating a recorded submission/i });
    expect(successArtwork).toHaveStyle('background-image: url("/assets/Good%20Job.webp")');
    expect(successArtwork).toHaveStyle('background-size: auto 118%');
    expect(screen.getByRole('link', { name: /Open student dashboard/i })).toBeInTheDocument();
  });

  it('shows an unavailable state for an unpublished form', () => {
    workflow.state.deliverables[0].status = 'Unpublished';
    renderForm();

    expect(screen.getByRole('heading', { name: 'Submission form unavailable' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit response/i })).not.toBeInTheDocument();
  });

  it('shows a not-found state for an unknown submission link', () => {
    renderForm('/submit/not-a-form');

    expect(screen.getByRole('heading', { name: 'Submission form not found' })).toBeInTheDocument();
  });

  it('shows a loading state while switching to the form workspace', () => {
    workflow.switchWorkspace.mockReturnValue(new Promise(() => {}));
    renderForm('/w/workspace-cs/submit/week-9-srs');

    expect(screen.getByRole('heading', { name: 'Opening submission form' })).toBeInTheDocument();
  });

  it('shows a recoverable error when the form workspace cannot be opened', async () => {
    workflow.switchWorkspace.mockResolvedValue({ ok: false, error: 'Workspace access failed.' });
    renderForm('/w/workspace-cs/submit/week-9-srs');

    expect(await screen.findByRole('heading', { name: 'Unable to open submission form' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Workspace access failed.');
  });

  it('uses general link language for a deliverable that does not require a PDF', () => {
    workflow.state.deliverables[0] = {
      ...workflow.state.deliverables[0],
      title: 'Software Project Documentation',
      shortTitle: 'Documentation',
      instructions: 'Submit the required repository and presentation links.',
      fields: [
        { id: 'frontendRepo', label: 'Frontend repository link', type: 'url', required: true, pdfRequired: false },
        { id: 'presentation', label: 'Presentation link', type: 'url', required: true, pdfRequired: false }
      ]
    };
    renderForm();

    expect(screen.getByText('Submission links required')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Frontend repository link' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Presentation link' })).toBeInTheDocument();
    expect(screen.queryByText('PDF Drive link required')).not.toBeInTheDocument();
    expect(screen.queryByText(/final PDF/i)).not.toBeInTheDocument();
  });
});
