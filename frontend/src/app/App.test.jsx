import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';
import { wildTrackTheme } from './theme.js';
import { GlobalDevPreview } from '../components/ui.jsx';

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
      name: 'CS Capstone - CS342',
      program: 'CS',
      courseCode: 'CS342',
      semester: 'Semester 2',
      academicYear: '2025-26'
    }
  ],
  state: {
    studentAccounts: [],
    activeAccountEmail: '',
    activeStudentNumber: ''
  },
  switchWorkspace: vi.fn(),
  logoutStudentAccount: vi.fn()
}));

vi.mock('./WorkflowContext.jsx', () => ({
  WorkflowProvider: ({ children }) => children,
  useWorkflow: () => workflow
}));

vi.mock('../pages/ArchivePage.jsx', () => ({ ArchivePage: () => <h1>Archive page</h1> }));
vi.mock('../pages/AdviserViewPage.jsx', () => ({ AdviserViewPage: () => <h1>Team review page</h1> }));
vi.mock('../pages/CommandCenterPage.jsx', () => ({ CommandCenterPage: () => <h1>Today&apos;s work page</h1> }));
vi.mock('../pages/FormsPage.jsx', () => ({ FormsPage: () => <h1>Forms page</h1> }));
vi.mock('../pages/PublicSubmissionPage.jsx', () => ({ PublicSubmissionPage: () => <h1>Public submission form</h1> }));
vi.mock('../pages/RegisterPage.jsx', () => ({ RegisterPage: () => <h1>Student access page</h1> }));
vi.mock('../pages/ReviewPage.jsx', () => ({ ReviewPage: () => <h1>Review page</h1> }));
vi.mock('../pages/StudentStatusPage.jsx', () => ({ StudentStatusPage: () => <h1>Student dashboard page</h1> }));
vi.mock('../pages/TrackerPage.jsx', () => ({ TrackerPage: () => <h1>Tracker page</h1> }));
vi.mock('../pages/WorkspacePage.jsx', () => ({ WorkspacePage: () => <h1>Workspace page</h1> }));

function setRole(role) {
  localStorage.setItem('wildtrack.v2.preview-role', role);
}

function renderApp(path) {
  return render(
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <MemoryRouter
        initialEntries={[path]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    </MantineProvider>
  );
}

describe('role-specific application shells', () => {
  beforeEach(() => {
    localStorage.clear();
    workflow.state = {
      studentAccounts: [],
      activeAccountEmail: '',
      activeStudentNumber: ''
    };
    workflow.switchWorkspace.mockReset();
    workflow.logoutStudentAccount.mockReset();
  });

  it('gives Sir institution-wide navigation and direct access to his advised teams', () => {
    setRole('admin');
    renderApp('/');

    expect(screen.getAllByText('WildTrack').length).toBeGreaterThan(0);
    expect(screen.getByRole('textbox', { name: 'Academic workspace' })).toHaveValue('IT Capstone - IT332');
    expect(screen.getByText('Ralph Laviste')).toBeInTheDocument();

    const navigation = screen.getByRole('navigation', { name: 'Staff navigation' });
    expect(within(navigation).getByRole('link', { name: "Today's work" })).toHaveAttribute('aria-current', 'page');
    expect(within(navigation).getByRole('link', { name: 'Forms' })).toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: 'Review' })).toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: 'My advised teams' })).toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: 'Tracker' })).toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: 'Archive' })).toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: 'Workspace' })).toBeInTheDocument();
  });

  it('limits adviser navigation and redirects an adviser away from admin-only routes', async () => {
    setRole('adviser');
    renderApp('/review');

    expect(await screen.findByRole('heading', { name: 'Team review page' })).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'Staff navigation' });
    screen.getAllByRole('link', { name: 'WildTrack home' })
      .forEach((link) => expect(link).toHaveAttribute('href', '/adviser'));
    expect(within(navigation).getByRole('link', { name: 'My teams' })).toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: 'Tracker' })).toBeInTheDocument();
    expect(within(navigation).queryByRole('link', { name: 'Forms' })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole('link', { name: 'Review' })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole('link', { name: 'Archive' })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole('link', { name: 'Workspace' })).not.toBeInTheDocument();
  });

  it('uses a lightweight student shell and redirects students away from staff routes', async () => {
    setRole('student');
    renderApp('/review');

    expect(await screen.findByRole('heading', { name: 'Student dashboard page' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Staff navigation' })).not.toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'Student navigation' });
    expect(within(navigation).getByRole('link', { name: 'Student dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(within(navigation).getByRole('link', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  it('makes the signed-in student account and sign-out action clear', async () => {
    setRole('student');
    workflow.state = {
      studentAccounts: [{ email: 'student@gmail.com', googleSubject: 'google-student' }],
      activeAccountEmail: 'student@gmail.com',
      activeStudentNumber: '22-1001-001'
    };
    renderApp('/student');

    expect(screen.getByText('student@gmail.com')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Student dashboard' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    expect(workflow.logoutStudentAccount).toHaveBeenCalledOnce();
    expect(await screen.findByRole('heading', { name: 'Student access page' })).toBeInTheDocument();
  });

  it('keeps public submission routes outside both application shells', () => {
    setRole('admin');
    renderApp('/submit/week-9-srs');

    expect(screen.getByRole('heading', { name: 'Public submission form' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Staff navigation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Student navigation' })).not.toBeInTheDocument();
  });

  it('keeps the preview switcher separate and allows production builds to omit it', async () => {
    renderApp('/');
    expect(screen.getByRole('button', { name: 'Open role preview' })).toBeInTheDocument();

    render(
      <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
        <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <GlobalDevPreview enabled={false} />
        </MemoryRouter>
      </MantineProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Open role preview' })).toHaveLength(1);
    });
  });
});
