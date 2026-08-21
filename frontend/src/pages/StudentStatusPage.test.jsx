import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { StudentApplicationShell } from '../components/layout/StudentApplicationShell.jsx';
import { StudentStatusPage } from './StudentStatusPage.jsx';

const LONG_FEEDBACK = 'Clarify the authentication boundary and connect every requirement to a testable acceptance criterion. '.repeat(8);

function createState() {
  return {
    backendSync: { enabled: true, status: 'Backend data loaded.', lastError: '' },
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
  beforeEach(() => {
    workflow.state = createState();
    workflow.claimStudentNumber.mockReset();
    workflow.disconnectStudentNumber.mockReset();
    workflow.logoutStudentAccount.mockReset();
    workflow.refreshBackendData.mockReset();
    workflow.setActiveStudentNumber.mockReset();
  });

  it('keeps student records and response links private while signed out', () => {
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Sign in to see your dashboard' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Sign in or register' })).toHaveLength(2);
    screen.getAllByRole('link', { name: 'Sign in or register' }).forEach((link) => {
      expect(link).toHaveAttribute('href', '/login');
    });
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
    expect(workflow.claimStudentNumber).toHaveBeenCalledWith('22-1001-001');
  });

  it('shows team submission progress in the context of each deliverable', () => {
    associateAccount();
    renderDashboard();

    const deliverables = screen.getByRole('list', { name: 'Your deliverables' });
    const srs = within(deliverables).getByText('SRS').closest('article');
    const sdd = within(deliverables).getByText('SDD').closest('article');
    const source = within(deliverables).getByText('Source Code', { selector: '.wt-student-deliverable-title *' }).closest('article');

    expect(srs).toHaveTextContent('Team 2/2 submitted');
    expect(sdd).toHaveTextContent('Team 1/2 submitted');
    expect(source).toHaveTextContent('Team 0/2 submitted');
    expect(screen.queryByText(/Members with a recorded response/i)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('teammate-private-response');
  });

  it('welcomes the connected student with useful progress and student-facing artwork', () => {
    associateAccount();
    renderDashboard();

    const welcome = screen.getByRole('region', { name: 'Student dashboard welcome' });
    expect(within(welcome).getByRole('heading', { name: 'Welcome back, Juan' })).toBeInTheDocument();
    expect(welcome).toHaveTextContent('2 of 3 deliverables submitted');
    expect(welcome).toHaveTextContent('Next to submit: Source Code');
    expect(within(welcome).getByRole('img', { name: 'WildTrack mascot finding quest nodes' })).toBeInTheDocument();
  });

  it('shows only response details owned by the active Google account', () => {
    associateAccount();
    renderDashboard();

    expect(screen.getByText('DELA CRUZ, JUAN CARLOS M.')).toBeInTheDocument();
    expect(screen.getAllByText('juan.student@gmail.com')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Open submitted file link' })).toHaveAttribute(
      'href',
      'https://drive.google.com/file/d/owned-response/view'
    );
    expect(document.body).not.toHaveTextContent('foreign-private-response');
    expect(document.body).not.toHaveTextContent('teammate-private-response');
    expect(document.body).not.toHaveTextContent('PRIVATE FEEDBACK FOR ANOTHER GOOGLE ACCOUNT');
    expect(document.body).not.toHaveTextContent('STAFF ONLY AI ANALYSIS');
    expect(screen.queryByText(/Needs review/i)).not.toBeInTheDocument();

    screen.getAllByRole('link', { name: /Open form|Edit response|Open submitted file link/i }).forEach((link) => {
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

  it('offers self-service disconnection when an associated record is no longer in the roster', async () => {
    associateAccount({ studentNumber: '99-9999-999' });
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Student record unavailable' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect record' }));
    const dialog = await screen.findByRole('dialog', { name: 'Disconnect this student record?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect record' }));
    expect(workflow.disconnectStudentNumber).toHaveBeenCalledTimes(1);
  });

  it('renders a stable loading state while workspace data is being fetched', () => {
    workflow.state.activeAccountEmail = 'juan.student@gmail.com';
    workflow.state.studentAccounts = [{ email: 'juan.student@gmail.com', studentNumber: '' }];
    workflow.state.backendSync.status = 'Loading workspace data.';
    renderDashboard();

    expect(screen.getByLabelText('Loading student dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Student Number/i })).not.toBeInTheDocument();
  });

  it('explains roster load failures and lets the student retry', () => {
    workflow.state.activeAccountEmail = 'juan.student@gmail.com';
    workflow.state.studentAccounts = [{ email: 'juan.student@gmail.com', studentNumber: '' }];
    workflow.state.students = [];
    workflow.state.backendSync.lastError = 'The roster service is unavailable.';
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Student records are not available yet' })).toBeInTheDocument();
    expect(screen.getByText('The roster service is unavailable.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(workflow.refreshBackendData).toHaveBeenCalledTimes(1);
  });
});
