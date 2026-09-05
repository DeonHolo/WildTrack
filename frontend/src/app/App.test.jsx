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
  session: null,
  sessionStatus: 'ready',
  sessionError: '',
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
  logoutStaffSession: vi.fn(),
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
    workflow.session = { authenticated: false, roles: [] };
    workflow.sessionStatus = 'ready';
    workflow.sessionError = '';
    workflow.state = {
      studentAccounts: [],
      activeAccountEmail: '',
      activeStudentNumber: ''
    };
    workflow.switchWorkspace.mockReset();
    workflow.logoutStaffSession.mockReset();
    workflow.logoutStudentAccount.mockReset();
  });

  it('gives Sir institution-wide navigation and direct access to his advised teams', () => {
    workflow.needsWorkspaceChoice = true;
    setRole('admin');
    renderApp('/');

    expect(screen.getAllByText('WildTrack').length).toBeGreaterThan(0);
    expect(screen.queryByRole('region', { name: 'Choose a capstone section' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "Today's work page" })).toBeInTheDocument();
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

  it('lets Sir end his staff session from the account area and returns him to login', async () => {
    setRole('admin');
    renderApp('/');

    const account = screen.getByRole('group', { name: 'Signed-in staff account' });
    fireEvent.click(within(account).getByRole('button', { name: 'Log out' }));

    expect(workflow.logoutStaffSession).toHaveBeenCalledOnce();
    expect(await screen.findByRole('heading', { name: 'Student access page' })).toBeInTheDocument();
  });

  it('offers the same logout control to an adviser', () => {
    setRole('adviser');
    renderApp('/adviser');

    const account = screen.getByRole('group', { name: 'Signed-in staff account' });
    expect(within(account).getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('does not flash an early redirect while production session is resolving', () => {
    const originalDev = import.meta.env.DEV;
    import.meta.env.DEV = false;
    workflow.session = null;
    workflow.sessionStatus = 'loading';
    try {
      const { container } = renderApp('/workspace');
      expect(screen.queryByRole('heading', { name: 'Student access page' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Workspace page' })).not.toBeInTheDocument();
    } finally {
      import.meta.env.DEV = originalDev;
      workflow.session = { authenticated: true, roles: ['ADMIN'] };
      workflow.sessionStatus = 'ready';
    }
  });

  it('shows a session load failure instead of treating backend unavailability as anonymous', () => {
    const originalDev = import.meta.env.DEV;
    import.meta.env.DEV = false;
    workflow.session = { authenticated: false, roles: [] };
    workflow.sessionStatus = 'error';
    workflow.sessionError = 'Session service is temporarily unavailable.';
    try {
      renderApp('/workspace');
      expect(screen.getByRole('alert')).toHaveTextContent('Session service is temporarily unavailable.');
      expect(screen.queryByRole('heading', { name: 'Student access page' })).not.toBeInTheDocument();
    } finally {
      import.meta.env.DEV = originalDev;
      workflow.sessionStatus = 'ready';
      workflow.sessionError = '';
    }
  });

  it('sends an unauthenticated visitor from protected staff routes to login', async () => {
    setRole('anonymous');
    renderApp('/workspace');

    expect(await screen.findByRole('heading', { name: 'Student access page' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Staff navigation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Workspace page' })).not.toBeInTheDocument();
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
    workflow.session = { authenticated: true, email: 'student@gmail.com', roles: [] };
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
