import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { StudentApplicationShell } from '../components/layout/StudentApplicationShell.jsx';
import { StudentStatusPage } from './StudentStatusPage.jsx';

const LONG_FEEDBACK = 'Clarify the authentication boundary and connect every requirement to a testable acceptance criterion. '.repeat(8);

function createState() {
  return {
    backendSync: { enabled: true, status: 'Backend data loaded.', lastError: '', lastLoadedAt: '2026-09-05T00:00:00Z' },
    students: [
      {
        studentNumber: '22-1001-001',
        name: 'DELA CRUZ, JUAN CARLOS M.',
        teamCode: '2526-sem2-it332-11',
        memberNumber: 1,
        adviser: 'Sir Roberto Villanueva',
        milestones: { SRS: 0, SDD: 4, SourceCode: '' }
      },
      {
        studentNumber: '22-1002-002',
        name: 'SANTOS, MARIA L.',
        teamCode: '2526-sem2-it332-11',
        memberNumber: 2,
        adviser: 'Sir Roberto Villanueva',
        milestones: { SRS: 0, SDD: 4, SourceCode: '' }
      }
    ],
    studentAccounts: [],
    activeAccountEmail: '',
    activeStudentNumber: '22-1001-001',
    trackerColumns: [
      { id: 'col-srs', key: 'SRS', label: 'SRS', active: true },
      { id: 'col-sdd', key: 'SDD', label: 'SDD', active: true },
      { id: 'col-source', key: 'SourceCode', label: 'Source Code', active: true }
    ],
    projectMetadata: [{
      groupCode: '2526-sem2-it332-11',
      projectTitle: 'StudyBuddy: A Collaborative Academic Task Manager',
      softwareName: 'StudyBuddy',
      adviserName: 'Sir Roberto Villanueva',
      category: 'Academic Capstone',
      proposalRemarks: 'Refine the group workflow.',
      demoComments: 'Show the shared task view.'
    }],
    deliverables: [
      {
        id: 'deliv-srs',
        slug: 'week-9-srs',
        title: 'Week 9: Software Requirements Specification',
        shortTitle: 'SRS',
        dueAt: '2026-04-18T23:59:00+08:00',
        trackerColumn: 'SRS',
        status: 'Published',
        fields: [{ id: 'documentPdf', pdfRequired: true }]
      },
      {
        id: 'deliv-sdd',
        slug: 'week-10-sdd',
        title: 'Week 10: Software Design Description',
        shortTitle: 'SDD',
        dueAt: '2026-04-25T23:59:00+08:00',
        trackerColumn: 'SDD',
        status: 'Published',
        fields: [{ id: 'documentPdf', pdfRequired: true }]
      },
      {
        id: 'deliv-code',
        slug: 'source-code',
        title: 'Source Code Submission',
        shortTitle: 'Source Code',
        dueAt: '2026-05-30T23:59:00+08:00',
        trackerColumn: 'SourceCode',
        status: 'Published',
        fields: [{ id: 'repository', pdfRequired: false }]
      }
    ],
    attempts: [
      {
        id: 'owned-srs',
        deliverableId: 'deliv-srs',
        studentNumber: '22-1001-001',
        googleSubject: 'google-juan',
        googleEmailSnapshot: 'juan.student@gmail.com',
        submittedAt: '2026-04-18T20:30:00+08:00',
        updatedAt: '2026-04-18T20:30:00+08:00',
        values: { documentPdf: 'https://drive.google.com/file/d/owned-response/view' },
        primaryStatus: 'Received',
        reviewStatus: 'Received',
        fileCheckStatus: 'COMPLETED',
        documentCheck: {
          status: 'Current',
          sourceResponseUpdatedAt: '2026-04-18T20:30:00+08:00',
          summary: 'The PDF is readable and accessible.',
          metadata: { mimeType: 'application/pdf', canDownload: true },
          document: { readable: true, pageCount: 24 }
        },
        feedback: [{ author: 'Sir Roberto Villanueva', note: LONG_FEEDBACK }],
        aiReport: { summary: 'STAFF ONLY AI ANALYSIS' }
      },
      {
        id: 'foreign-sdd',
        deliverableId: 'deliv-sdd',
        studentNumber: '22-1001-001',
        googleEmailSnapshot: 'another.student@gmail.com',
        submittedAt: '2026-04-25T20:30:00+08:00',
        values: { documentPdf: 'https://drive.google.com/file/d/foreign-private-response/view' },
        feedback: [{ author: 'Private adviser', note: 'PRIVATE FEEDBACK FOR ANOTHER GOOGLE ACCOUNT' }]
      },
      {
        id: 'teammate-srs',
        deliverableId: 'deliv-srs',
        studentNumber: '22-1002-002',
        googleEmailSnapshot: 'maria.student@gmail.com',
        values: { documentPdf: 'https://drive.google.com/file/d/teammate-private-response/view' }
      }
    ]
  };
}

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
  workspaces: [
    {
      id: 'workspace-it',
      name: 'IT Capstone - IT332',
      program: 'IT',
      courseCode: 'IT332',
      semester: 'Semester 2',
      academicYear: '2025-26'
    },
    {
      id: 'workspace-cs',
      name: 'CS Capstone - CS332',
      program: 'CS',
      courseCode: 'CS332',
      semester: 'Semester 2',
      academicYear: '2025-26'
    }
  ],
  switchWorkspace: vi.fn(),
  state: null,
  claimStudentNumber: vi.fn(),
  disconnectStudentNumber: vi.fn(),
  logoutStudentAccount: vi.fn(),
  refreshBackendData: vi.fn(),
  setActiveStudentNumber: vi.fn()
}));

vi.mock('../app/WorkflowContext.jsx', () => ({
  useWorkflow: () => workflow
}));

vi.mock('../lib/api.js', () => ({
  getMyAssociation: vi.fn().mockResolvedValue(null),
  disconnectStudentAssociation: vi.fn().mockResolvedValue({}),
  confirmStudentAssociation: vi.fn()
}));

function renderDashboard() {
  return render(
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ModalsProvider>
        <MemoryRouter
          initialEntries={['/student']}
          future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        >
          <Routes>
            <Route path="/student" element={<StudentApplicationShell><StudentStatusPage /></StudentApplicationShell>} />
            <Route path="/login" element={<h1>Student access</h1>} />
          </Routes>
        </MemoryRouter>
      </ModalsProvider>
    </MantineProvider>
  );
}

function associateAccount(overrides = {}) {
  workflow.state.activeAccountEmail = 'juan.student@gmail.com';
  workflow.state.activeStudentNumber = '22-1001-001';
  workflow.state.studentAccounts = [{
    email: 'juan.student@gmail.com',
    googleSubject: 'google-juan',
    studentNumber: '22-1001-001',
    studentName: 'DELA CRUZ, JUAN CARLOS M.',
    teamCode: '2526-sem2-it332-11',
    ...overrides
  }];
}

describe('student dashboard', () => {
  beforeEach(async () => {
    const { confirmStudentAssociation, disconnectStudentAssociation, getMyAssociation } = await import('../lib/api.js');
    getMyAssociation.mockReset().mockImplementation(() => ({
      then(onFulfilled) {
        const account = workflow.state.studentAccounts.find((item) => item.email === workflow.state.activeAccountEmail);
        const student = workflow.state.students.find((item) => item.studentNumber === account?.studentNumber);
        const association = student ? {
          id: 'association-current',
          workspaceId: workflow.activeWorkspaceId,
          googleEmail: account.email,
          studentNumber: student.studentNumber,
          studentName: student.name,
          teamCode: student.teamCode,
          assuranceLevel: 'SELF_DECLARED'
        } : null;
        onFulfilled(association);
        return Promise.resolve(association);
      }
    }));
    disconnectStudentAssociation.mockReset().mockResolvedValue({});
    confirmStudentAssociation.mockReset().mockImplementation(async (workspaceId, studentNumber) => {
      const student = workflow.state.students.find((item) => item.studentNumber === studentNumber);
      return {
        id: 'association-confirmed',
        workspaceId,
        googleEmail: workflow.state.activeAccountEmail,
        studentNumber,
        studentName: student?.name || '',
        teamCode: student?.teamCode || '',
        assuranceLevel: 'SELF_DECLARED'
      };
    });
    workflow.state = createState();
    workflow.needsWorkspaceChoice = false;
    workflow.workspaceCatalogStatus = 'ready';
    workflow.workspaceCatalogError = '';
    workflow.refreshWorkspaceCatalog = vi.fn();
    workflow.activeWorkspaceId = 'workspace-it';
    workflow.workspaces = [
      { id: 'workspace-it', name: 'IT Capstone' },
      { id: 'workspace-cs', name: 'CS Capstone' },
      { id: 'workspace-third', name: 'IT Capstone Section 3', academicYear: '2026-27', semester: 'Semester 1' }
    ];
    workflow.switchWorkspace.mockReset().mockResolvedValue({ ok: true });
    workflow.claimStudentNumber.mockReset();
    workflow.disconnectStudentNumber.mockReset();
    workflow.logoutStudentAccount.mockReset();
    workflow.refreshBackendData.mockReset();
    workflow.setActiveStudentNumber.mockReset();
  });

  it('keeps student records and response links private while signed out', () => {
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute('href', '/login');
    expect(within(screen.getByRole('region', { name: 'Continue with Google' })).getByLabelText('Continue with Google')).toBeInTheDocument();
    expect(screen.queryByText('DELA CRUZ, JUAN CARLOS M.')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('owned-response');
    expect(screen.queryByRole('combobox', { name: /Student Number/i })).not.toBeInTheDocument();
  });

  it('lets a signed-in student connect one class-record identity with confirmation', async () => {
    workflow.state.activeAccountEmail = 'juan.student@gmail.com';
    workflow.state.studentAccounts = [{
      email: 'juan.student@gmail.com',
      googleSubject: 'google-juan',
      studentNumber: ''
    }];
    workflow.claimStudentNumber.mockReturnValue({
      ok: true,
      student: workflow.state.students[0]
    });
    renderDashboard();

    expect(screen.queryByText(/class-record entries available/i)).not.toBeInTheDocument();

    const studentNumber = screen.getByRole('combobox', { name: /Student Number/i });
    fireEvent.focus(studentNumber);
    fireEvent.change(studentNumber, { target: { value: '22-1001' } });
    fireEvent.click(screen.getByRole('option', { name: /22-1001-001/i }));

    expect(screen.getByLabelText('Selected student record')).toHaveTextContent('DELA CRUZ, JUAN CARLOS M.');
    fireEvent.click(screen.getByRole('button', { name: 'Connect student record' }));

    const dialog = await screen.findByRole('dialog', { name: 'Connect this student record?' });
    expect(dialog).toHaveTextContent('juan.student@gmail.com');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Connect record' }));
    await waitFor(() => expect(workflow.claimStudentNumber).toHaveBeenCalledWith('22-1001-001'));
  });

  it('shows team submission progress in the context of each deliverable', () => {
    associateAccount();
    renderDashboard();

    const deliverables = screen.getByRole('list', { name: 'Your deliverables' });
    const srs = within(deliverables).getByText('SRS').closest('article');
    const sdd = within(deliverables).getByText('SDD').closest('article');
    const source = within(deliverables).getByText('Source Code', { selector: '.wt-student-deliverable-title *' }).closest('article');

    expect(srs).toHaveTextContent('All 2 team members submitted');
    expect(within(srs).getByText('Submitted').closest('.wt-status-indicator')).toHaveAttribute('data-tone', 'success');
    expect(within(srs).getByText('File accessible').closest('.wt-status-indicator')).toHaveAttribute('data-tone', 'success');
    expect(sdd).toHaveTextContent('1 of 2 team members submitted');
    expect(within(sdd).getByText('Response recorded').closest('.wt-status-indicator')).toHaveAttribute('data-tone', 'neutral');
    expect(source).toHaveTextContent('No team members submitted');
    expect(within(source).getByText('Not submitted').closest('.wt-status-indicator')).toHaveAttribute('data-tone', 'neutral');
    expect(screen.queryByText('No response has been recorded.')).not.toBeInTheDocument();
    expect(screen.queryByText(/Members with a recorded response/i)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('teammate-private-response');
  });

  it('explains numeric tracker values with one concise shared tooltip', async () => {
    associateAccount();
    renderDashboard();

    const help = screen.getByRole('button', { name: 'Explain tracker values' });
    fireEvent.focus(help);

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Numbers show days late. 0 means submitted on time.');
    expect(screen.getAllByRole('button', { name: 'Explain tracker values' })).toHaveLength(1);
  });

  it('welcomes the connected student with useful progress and student-facing artwork', () => {
    associateAccount();
    renderDashboard();

    const welcome = screen.getByRole('region', { name: 'Student dashboard welcome' });
    expect(within(welcome).getByRole('heading', { name: 'Welcome back, Juan' })).toBeInTheDocument();
    expect(welcome).toHaveTextContent('2 of 3 deliverables submitted');
    expect(welcome).toHaveTextContent('Next to submit: Source Code');
    const welcomeArtwork = within(welcome).getByRole('img', { name: 'WildTrack mascot waving' });
    expect(welcomeArtwork).toHaveStyle('background-image: url("/assets/Waving.webp")');
  });

  it('celebrates when every current deliverable has a recorded response', () => {
    associateAccount();
    workflow.state.attempts.push({
      id: 'owned-source',
      deliverableId: 'deliv-code',
      studentNumber: '22-1001-001',
      googleSubject: 'google-juan',
      googleEmailSnapshot: 'juan.student@gmail.com',
      submittedAt: '2026-05-30T20:30:00+08:00',
      values: { repository: 'https://github.com/example/project' },
      primaryStatus: 'Received',
      reviewStatus: 'Received'
    });
    renderDashboard();

    const welcome = screen.getByRole('region', { name: 'Student dashboard welcome' });
    expect(welcome).toHaveTextContent('3 of 3 deliverables submitted');
    expect(welcome).toHaveTextContent('All current deliverables have a response.');
    const completionArtwork = within(welcome).getByRole('img', { name: 'WildTrack mascot holding a trophy' });
    expect(completionArtwork).toHaveStyle('background-image: url("/assets/Earn%20Your%20Badges.webp")');
  });

  it('shows only response details owned by the active Google account', () => {
    associateAccount();
    renderDashboard();

    expect(screen.getByText('DELA CRUZ, JUAN CARLOS M.')).toBeInTheDocument();
    expect(screen.getAllByText('juan.student@gmail.com')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Open file' })).toHaveAttribute(
      'href',
      'https://drive.google.com/file/d/owned-response/view'
    );
    expect(document.body).not.toHaveTextContent('foreign-private-response');
    expect(document.body).not.toHaveTextContent('teammate-private-response');
    expect(document.body).not.toHaveTextContent('PRIVATE FEEDBACK FOR ANOTHER GOOGLE ACCOUNT');
    expect(document.body).not.toHaveTextContent('STAFF ONLY AI ANALYSIS');
    expect(screen.queryByText(/Needs review/i)).not.toBeInTheDocument();

    screen.getAllByRole('link', { name: /Open form|Edit response|Open file/i }).forEach((link) => {
      expect(link).toHaveAttribute('target', '_blank');
    });
  });

  it('keeps long adviser feedback compact and reveals the full note in a dialog', async () => {
    associateAccount();
    renderDashboard();

    expect(document.body).not.toHaveTextContent(LONG_FEEDBACK);
    fireEvent.click(screen.getByRole('button', { name: 'Read feedback' }));

    const dialog = await screen.findByRole('dialog', { name: 'Adviser feedback' });
    expect(dialog).toHaveTextContent(LONG_FEEDBACK.trim());
    expect(dialog).toHaveTextContent('Sir Roberto Villanueva');
  });

  it('keeps feedback inside deliverable details instead of duplicating it as a filter', () => {
    associateAccount();
    renderDashboard();

    expect(screen.queryByRole('radio', { name: 'Feedback' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read feedback' })).toBeInTheDocument();
  });

  it('shows student-safe Document Check results without staff AI output', async () => {
    associateAccount();
    renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: 'View Document Check' }));
    const dialog = await screen.findByRole('dialog', { name: 'Document Check' });

    expect(dialog).toHaveTextContent('File accessAccessible');
    expect(dialog).toHaveTextContent('File typePDF');
    expect(dialog).toHaveTextContent('Readable textDetected');
    expect(dialog).toHaveTextContent('Pages24');
    expect(dialog).not.toHaveTextContent('STAFF ONLY AI ANALYSIS');
  });

  it('renders and disconnects a server association when the roster snapshot is stale', async () => {
    const { getMyAssociation } = await import('../lib/api.js');
    getMyAssociation.mockResolvedValue({
      id: 'association-stale-roster',
      workspaceId: 'workspace-it',
      googleEmail: 'juan.student@gmail.com',
      studentNumber: '99-9999-999',
      studentName: 'SERVER ASSOCIATED STUDENT',
      teamCode: '2526-sem2-it332-99',
      assuranceLevel: 'SELF_DECLARED'
    });
    associateAccount({ studentNumber: '99-9999-999' });
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'SERVER ASSOCIATED STUDENT' })).toBeInTheDocument();
    expect(screen.getByText('99-9999-999')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect record' }));
    const dialog = await screen.findByRole('dialog', { name: 'Disconnect this student record?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect record' }));
    await waitFor(() => expect(workflow.disconnectStudentNumber).toHaveBeenCalledTimes(1));
  });

  it('renders a stable loading state while workspace data is being fetched', () => {
    workflow.state.activeAccountEmail = 'juan.student@gmail.com';
    workflow.state.studentAccounts = [{ email: 'juan.student@gmail.com', googleSubject: 'google-juan', studentNumber: '' }];
    workflow.state.backendSync.status = 'Loading workspace data.';
    renderDashboard();

    expect(screen.getByLabelText('Loading student dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Student Number/i })).not.toBeInTheDocument();
  });

  it('explains roster load failures and lets the student retry', () => {
    workflow.state.activeAccountEmail = 'juan.student@gmail.com';
    workflow.state.studentAccounts = [{ email: 'juan.student@gmail.com', googleSubject: 'google-juan', studentNumber: '' }];
    workflow.state.students = [];
    workflow.state.backendSync.lastError = 'The roster service is unavailable.';
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Student records are not available yet' })).toBeInTheDocument();
    expect(screen.getByText('The roster service is unavailable.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(workflow.refreshBackendData).toHaveBeenCalledTimes(1);
  });

  it('offers workspace selection before connecting a student record', () => {
    workflow.state.activeAccountEmail = 'cs.student@gmail.com';
    workflow.state.studentAccounts = [{ email: 'cs.student@gmail.com', googleSubject: 'google-cs', studentNumber: '' }];
    renderDashboard();

    expect(screen.getByRole('combobox', { name: 'Workspace' })).toHaveValue('workspace-it');
  });

  it('renders a loading dashboard while backend sync is hydrating (ticket 03)', () => {
    workflow.state.backendSync = { lastLoadedAt: null, enabled: true };
    renderDashboard();

    // Renders skeleton/loading without premature "Student records are not available yet"
    expect(screen.queryByText(/Student records are not available yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No student records are available to connect/i)).not.toBeInTheDocument();
  });

  it('lets a connected student choose the third workspace by name', async () => {
    associateAccount();
    renderDashboard();

    const picker = await screen.findByRole('combobox', { name: 'Workspace' });
    expect(screen.getByRole('option', { name: /IT Capstone Section 3.*2026-27.*Semester 1/ })).toBeInTheDocument();
    fireEvent.change(picker, { target: { value: 'workspace-third' } });
    await waitFor(() => expect(workflow.switchWorkspace).toHaveBeenCalledWith('workspace-third'));
  });

  it('requires an explicit workspace choice before showing student numbers', async () => {
    associateAccount({ studentNumber: '' });
    workflow.needsWorkspaceChoice = true;
    renderDashboard();
    expect(screen.getByRole('heading', { name: 'Choose your workspace' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Student Number/ })).not.toBeInTheDocument();
    const picker = screen.getByRole('combobox', { name: 'Workspace' });
    expect(picker).toHaveValue('');
    fireEvent.change(picker, { target: { value: 'workspace-it' } });
    await waitFor(() => expect(workflow.switchWorkspace).toHaveBeenCalledWith('workspace-it'));
  });

  it('shows a workspace load error with a retry instead of cached options', () => {
    associateAccount();
    workflow.workspaceCatalogStatus = 'error';
    workflow.workspaceCatalogError = 'Workspaces are temporarily unavailable.';
    renderDashboard();
    expect(screen.getByRole('alert')).toHaveTextContent(workflow.workspaceCatalogError);
    expect(screen.queryByRole('combobox', { name: 'Workspace' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(workflow.refreshWorkspaceCatalog).toHaveBeenCalledOnce();
  });

  it('shows an empty workspace state without student-record controls', () => {
    associateAccount();
    workflow.workspaces = [];
    renderDashboard();
    expect(screen.getByText(/No workspaces are available yet/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('identifies the only workspace without asking the student to select it', () => {
    associateAccount({ studentNumber: '' });
    workflow.workspaces = [workflow.workspaces[0]];
    renderDashboard();
    expect(screen.getByText('Workspace: IT Capstone')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Workspace' })).not.toBeInTheDocument();
  });

  it('shows a failed switch and keeps the picker available for retry', async () => {
    associateAccount({ studentNumber: '' });
    workflow.needsWorkspaceChoice = true;
    workflow.switchWorkspace.mockResolvedValue({ ok: false, error: 'Workspace was not found.' });
    renderDashboard();
    fireEvent.change(screen.getByRole('combobox', { name: 'Workspace' }), { target: { value: 'workspace-cs' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Workspace was not found.');
    expect(screen.getByRole('combobox', { name: 'Workspace' })).toBeEnabled();
  });

  it('persists a confirmed connection to the server association', async () => {
    const { confirmStudentAssociation } = await import('../lib/api.js');
    confirmStudentAssociation.mockResolvedValue({
      id: 'assoc-1',
      workspaceId: 'workspace-it',
      googleEmail: 'juan.student@gmail.com',
      studentRecordId: 'record-1',
      studentNumber: '22-1001-001',
      studentName: 'DELA CRUZ, JUAN CARLOS M.',
      teamCode: '2526-sem2-it332-11',
      assuranceLevel: 'SELF_DECLARED'
    });
    workflow.state.activeAccountEmail = 'juan.student@gmail.com';
    workflow.state.studentAccounts = [{ email: 'juan.student@gmail.com', googleSubject: 'google-juan', studentNumber: '' }];
    workflow.claimStudentNumber.mockReturnValue({ ok: true, student: workflow.state.students[0] });
    renderDashboard();

    const studentNumber = screen.getByRole('combobox', { name: /Student Number/i });
    fireEvent.focus(studentNumber);
    fireEvent.change(studentNumber, { target: { value: '22-1001' } });
    fireEvent.click(screen.getByRole('option', { name: /22-1001-001/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect student record' }));

    const dialog = await screen.findByRole('dialog', { name: 'Connect this student record?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Connect record' }));

    await waitFor(() => expect(confirmStudentAssociation).toHaveBeenCalledWith('workspace-it', '22-1001-001'));
  });

  it('shows an error and stays unconnected when the server rejects the association', async () => {
    const { confirmStudentAssociation } = await import('../lib/api.js');
    confirmStudentAssociation.mockRejectedValue(new Error('No Student Record with that number exists in this workspace.'));
    workflow.state.activeAccountEmail = 'juan.student@gmail.com';
    workflow.state.studentAccounts = [{ email: 'juan.student@gmail.com', googleSubject: 'google-juan', studentNumber: '' }];
    renderDashboard();

    const studentNumber = screen.getByRole('combobox', { name: /Student Number/i });
    fireEvent.focus(studentNumber);
    fireEvent.change(studentNumber, { target: { value: '22-1001' } });
    fireEvent.click(screen.getByRole('option', { name: /22-1001-001/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect student record' }));

    const dialog = await screen.findByRole('dialog', { name: 'Connect this student record?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Connect record' }));

    const alerts = await screen.findAllByRole('alert');
    const connectionAlert = alerts.find((node) => node.textContent.includes('No Student Record with that number exists'));
    expect(connectionAlert).toBeDefined();
    expect(workflow.claimStudentNumber).not.toHaveBeenCalled();
  });

  it('deactivates the association on the server when disconnecting', async () => {
    const { disconnectStudentAssociation } = await import('../lib/api.js');
    disconnectStudentAssociation.mockResolvedValue({});
    associateAccount();
    renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect record' }));
    const dialog = await screen.findByRole('dialog', { name: 'Disconnect this student record?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect record' }));

    await waitFor(() => expect(disconnectStudentAssociation).toHaveBeenCalledWith('workspace-it'));
    expect(await screen.findByRole('heading', { name: 'Connect your student record' })).toBeInTheDocument();
  });

  it('renders identity from the server association on a fresh browser with no local claim', async () => {
    const { getMyAssociation } = await import('../lib/api.js');
    getMyAssociation.mockResolvedValue({
      id: 'assoc-1',
      workspaceId: 'workspace-it',
      googleEmail: 'juan.student@gmail.com',
      studentNumber: '22-1001-001',
      studentName: 'DELA CRUZ, JUAN CARLOS M.',
      teamCode: '2526-sem2-it332-11',
      assuranceLevel: 'SELF_DECLARED'
    });
    workflow.state.activeAccountEmail = 'juan.student@gmail.com';
    workflow.state.activeStudentNumber = '';
    workflow.state.studentAccounts = [{ email: 'juan.student@gmail.com', googleSubject: 'google-juan' }];
    workflow.state.students = [];
    renderDashboard();

    await screen.findByText('DELA CRUZ, JUAN CARLOS M.');
    expect(screen.getByText('22-1001-001')).toBeInTheDocument();
  });

  it('reconnecting to another student record confirms with the new record', async () => {
    const { confirmStudentAssociation, disconnectStudentAssociation, getMyAssociation } = await import('../lib/api.js');
    let serverAssociation = {
      id: 'assoc-1',
      workspaceId: 'workspace-it',
      googleEmail: 'juan.student@gmail.com',
      studentNumber: '22-1001-001',
      studentName: 'DELA CRUZ, JUAN CARLOS M.',
      teamCode: '2526-sem2-it332-11',
      assuranceLevel: 'SELF_DECLARED'
    };
    getMyAssociation.mockImplementation(async () => serverAssociation);
    disconnectStudentAssociation.mockImplementation(async () => {
      serverAssociation = null;
      return {};
    });
    confirmStudentAssociation.mockImplementation(async () => {
      serverAssociation = {
        id: 'assoc-2',
        workspaceId: 'workspace-it',
        googleEmail: 'juan.student@gmail.com',
        studentNumber: '22-1002-002',
        studentName: 'SANTOS, MARIA L.',
        teamCode: '2526-sem2-it332-11',
        assuranceLevel: 'SELF_DECLARED'
      };
      return serverAssociation;
    });
    associateAccount(); // currently connected to 22-1001-001
    const firstBrowser = renderDashboard();

    // disconnect first (the connected dashboard has no selector by design)
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect record' }));
    let dialog = await screen.findByRole('dialog', { name: 'Disconnect this student record?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect record' }));
    await waitFor(() => expect(disconnectStudentAssociation).toHaveBeenCalledWith('workspace-it'));

    expect(await screen.findByRole('heading', { name: 'Connect your student record' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const studentNumber = screen.getByRole('combobox', { name: /Student Number/i });
    fireEvent.focus(studentNumber);
    fireEvent.change(studentNumber, { target: { value: '22-1002' } });
    // Mantine positions the dropdown with floating-ui; in jsdom the re-rendered
    // dropdown keeps display:none, so the option is queried including hidden nodes.
    fireEvent.click(await screen.findByRole('option', { name: /22-1002-002/i, hidden: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect student record' }));

    dialog = await screen.findByRole('dialog', { name: 'Connect this student record?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Connect record' }));

    await waitFor(() => expect(confirmStudentAssociation).toHaveBeenCalledWith('workspace-it', '22-1002-002'));
  });
});
