import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { useReducer } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
          checkedAt: '2026-04-18T20:35:00+08:00',
          metadata: {
            name: 'SRS.pdf',
            mimeType: 'application/pdf',
            canDownload: true,
            size: 327680,
            modifiedTime: '2026-04-18T20:20:00+08:00'
          },
          document: { readable: true, pageCount: 24, extractedCharacterCount: 6787 },
          templateComparison: {
            available: true,
            templateCoverage: 0.92,
            addedContentRatio: 0.64,
            unchangedInstructionCount: 2
          },
          missingSections: ['Risk management']
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

function createMultiArtifactState() {
  const state = createState();
  const deliverable = state.deliverables.find((item) => item.id === 'deliv-srs');
  deliverable.id = 'deliv-mvp-validation';
  deliverable.slug = 'mvp-validation';
  deliverable.title = 'MVP Validation';
  deliverable.shortTitle = 'MVP Validation';
  deliverable.trackerColumn = 'MVPValidation';
  deliverable.fields = [
    { definitionId: 'field-student-number', id: 'studentNumber', label: 'Student Number', type: 'academicStudentNumber', pdfRequired: false, documentCheckPolicy: 'OFF' },
    { definitionId: 'field-student-name', id: 'studentName', label: 'Student Name', type: 'academicStudentName', pdfRequired: false, documentCheckPolicy: 'OFF' },
    { definitionId: 'field-team-code', id: 'teamCode', label: 'Team Code', type: 'academicTeamCode', pdfRequired: false, documentCheckPolicy: 'OFF' },
    { definitionId: 'field-section', id: 'section', label: 'Section', type: 'academicSection', pdfRequired: false, documentCheckPolicy: 'OFF' },
    { definitionId: 'field-validation-step', id: 'validationStep', label: 'Validation step', type: 'multipleChoice', pdfRequired: false, documentCheckPolicy: 'OFF' },
    { definitionId: 'field-form', id: 'validationInstrument', label: 'Validation Instrument', type: 'googleForm', pdfRequired: false, documentCheckPolicy: 'OFF' },
    { definitionId: 'field-framework', id: 'frameworkModel', label: 'Framework / Model', type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO' },
    { definitionId: 'field-sheet', id: 'validationResponseSheet', label: 'Validation Response Sheet', type: 'googleSheet', pdfRequired: false, documentCheckPolicy: 'OFF' },
    { definitionId: 'field-highlights', id: 'validationHighlights', label: 'MVP Validation Highlights', type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO' },
    { definitionId: 'field-evidence', id: 'validationEvidence', label: 'Validation Evidence', type: 'driveFolder', pdfRequired: false, documentCheckPolicy: 'OFF' }
  ];
  state.attempts = state.attempts.map((response) => {
    if (response.deliverableId !== 'deliv-srs') return response;
    if (response.id !== 'owned-srs') return { ...response, deliverableId: 'deliv-mvp-validation' };
    const values = {
      studentNumber: '22-1001-001',
      studentName: 'DELA CRUZ, JUAN CARLOS M.',
      teamCode: '2526-sem2-it332-41',
      section: 'G7',
      validationStep: 'Initial submission',
      validationInstrument: 'https://docs.google.com/forms/d/e/student-validation/viewform',
      frameworkModel: 'https://drive.google.com/file/d/student-framework/view',
      validationResponseSheet: 'https://docs.google.com/spreadsheets/d/student-validation-sheet/edit',
      validationHighlights: 'https://drive.google.com/file/d/student-highlights/view',
      validationEvidence: 'https://drive.google.com/drive/folders/student-validation-evidence'
    };
    return {
      ...response,
      deliverableId: 'deliv-mvp-validation',
      values,
      documentCheck: null,
      artifactChecks: {
        'field-framework': {
          fieldId: 'field-framework',
          status: 'Current',
          checkedAt: '2026-04-18T20:40:00+08:00',
          sourceUrl: values.frameworkModel,
          sourceResponseUpdatedAt: response.updatedAt,
          summary: 'Framework PDF is readable and accessible.'
        }
      }
    };
  });
  return state;
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

vi.mock('../app/WorkspaceSession.jsx', () => ({
  useWorkspaceSession: () => ({
    account: workflow.session?.authenticated && workflow.session?.email
      ? { email: workflow.session.email, name: workflow.session.name || '' }
      : null,
    session: workflow.session,
    activeWorkspace: workflow.workspaces.find((workspace) => workspace.id === workflow.activeWorkspaceId) || workflow.workspaces[0] || null,
    activeWorkspaceId: workflow.activeWorkspaceId,
    workspaces: workflow.workspaces,
    needsWorkspaceChoice: workflow.needsWorkspaceChoice,
    workspaceCatalogStatus: workflow.workspaceCatalogStatus,
    workspaceCatalogError: workflow.workspaceCatalogError,
    refreshWorkspaceCatalog: workflow.refreshWorkspaceCatalog,
    refreshSession: vi.fn().mockImplementation(async () => workflow.session),
    switchWorkspace: workflow.switchWorkspace,
    logoutStudentAccount: workflow.logoutStudentAccount
  })
}));

vi.mock('../hooks/useWorkspaceResource.js', () => ({
  useWorkspaceResource: () => {
    const [, refresh] = useReducer((value) => value + 1, 0);
    return ({
    data: {
      ...workflow.state,
      association: workflow.state?.association || null,
      rosterOptions: workflow.state?.rosterOptions || workflow.state?.students || []
    },
    status: workflow.dashboardStatus || 'ready',
    error: workflow.dashboardError || '',
    reload: async () => {
      await workflow.refreshBackendData();
      refresh();
    }
  });
  }
}));

vi.mock('../lib/api.js', () => ({
  disconnectStudentAssociation: vi.fn().mockResolvedValue({}),
  confirmStudentAssociation: vi.fn(),
  getDriveHistoryConsentStatus: vi.fn().mockResolvedValue({ configured: false, connected: false }),
  getSubmittedFileHistory: vi.fn().mockResolvedValue({ status: 'UNAVAILABLE', revisions: [] })
}));

function dashboardTree() {
  return (
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

function renderDashboard() { return render(dashboardTree()); }

function associateAccount(overrides = {}) {
  workflow.session = { authenticated: true, email: 'juan.student@gmail.com', roles: [] };
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
  workflow.state.association = workflow.state.students.find((student) => student.studentNumber === workflow.state.studentAccounts[0].studentNumber)
    ? {
        id: 'association-current',
        workspaceId: workflow.activeWorkspaceId,
        googleEmail: 'juan.student@gmail.com',
        studentNumber: workflow.state.studentAccounts[0].studentNumber,
        studentName: workflow.state.studentAccounts[0].studentName || 'DELA CRUZ, JUAN CARLOS M.',
        teamCode: workflow.state.studentAccounts[0].teamCode || '2526-sem2-it332-11',
        assuranceLevel: 'SELF_DECLARED'
      }
    : null;
}

describe('student dashboard', () => {
  beforeEach(async () => {
    const { confirmStudentAssociation, disconnectStudentAssociation } = await import('../lib/api.js');
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
    workflow.dashboardStatus = 'ready';
    workflow.dashboardError = '';
    workflow.session = { authenticated: false, roles: [] };
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
    workflow.logoutStudentAccount.mockReset();
    workflow.refreshBackendData.mockReset().mockResolvedValue(workflow.state);
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

  it('leaves an unbound account unclaimed until a published form is successfully submitted', async () => {
    const { confirmStudentAssociation } = await import('../lib/api.js');
    workflow.session = { authenticated: true, email: 'juan.student@gmail.com', roles: [] };
    workflow.state.activeAccountEmail = 'juan.student@gmail.com';
    workflow.state.studentAccounts = [{
      email: 'juan.student@gmail.com',
      googleSubject: 'google-juan',
      studentNumber: ''
    }];
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Submit your first form' })).toBeInTheDocument();
    expect(screen.getByText(/only when your first valid submission is successfully saved/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Student Number/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open SRS' })).toHaveAttribute('href', '/w/workspace-it/submit/week-9-srs');
    expect(confirmStudentAssociation).not.toHaveBeenCalled();
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

  it('moves multi-artifact details into the deliverable-row modal and keeps identity/ordinary fields out', async () => {
    workflow.state = createMultiArtifactState();
    associateAccount();
    renderDashboard();

    expect(screen.queryByLabelText('Submitted artifacts')).not.toBeInTheDocument();
    const openArtifacts = screen.getByRole('button', { name: 'View submitted artifacts' });
    const row = openArtifacts.closest('article');
    expect(row).toHaveTextContent('Checks pending');
    expect(within(row).queryByRole('link', { name: 'Open file' })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'View Document Check' })).not.toBeInTheDocument();

    fireEvent.click(openArtifacts);
    const artifacts = await screen.findByRole('dialog', { name: 'Submitted artifacts' });
    expect(within(artifacts).queryByRole('group', { name: 'Student Number artifact' })).not.toBeInTheDocument();
    expect(within(artifacts).queryByRole('group', { name: 'Student Name artifact' })).not.toBeInTheDocument();
    expect(within(artifacts).queryByRole('group', { name: 'Team Code artifact' })).not.toBeInTheDocument();
    expect(within(artifacts).queryByRole('group', { name: 'Section artifact' })).not.toBeInTheDocument();
    expect(within(artifacts).queryByRole('group', { name: 'Validation step artifact' })).not.toBeInTheDocument();
    expect(within(artifacts).getByRole('group', { name: 'Validation Instrument artifact' })).toHaveTextContent('Google Form');
    expect(within(artifacts).getByRole('link', { name: 'Open Validation Instrument' })).toHaveAttribute(
      'href',
      'https://docs.google.com/forms/d/e/student-validation/viewform'
    );
    const framework = within(artifacts).getByRole('group', { name: 'Framework / Model artifact' });
    const highlights = within(artifacts).getByRole('group', { name: 'MVP Validation Highlights artifact' });
    expect(framework).toHaveTextContent('Google Drive PDF');
    expect(framework).toHaveTextContent('Ready for review');
    expect(framework).toHaveTextContent('Framework PDF is readable and accessible.');
    expect(within(framework).getByRole('button', { name: 'View Document Check' })).toBeInTheDocument();
    expect(highlights).toHaveTextContent('Google Drive PDF');
    expect(highlights).toHaveTextContent('Not checked');
    expect(within(artifacts).getByRole('link', { name: 'Open Validation Response Sheet' })).toHaveAttribute(
      'href',
      'https://docs.google.com/spreadsheets/d/student-validation-sheet/edit'
    );
    expect(within(artifacts).getByRole('link', { name: 'Open Validation Evidence' })).toHaveAttribute(
      'href',
      'https://drive.google.com/drive/folders/student-validation-evidence'
    );
    fireEvent.click(within(framework).getByRole('button', { name: 'View Document Check' }));
    const checkDialog = await screen.findByRole('dialog', { name: /Document Check/i });
    expect(checkDialog).toHaveTextContent('Framework PDF is readable and accessible.');
    expect(within(checkDialog).getByRole('tab', { name: 'File history' })).toBeInTheDocument();
    expect(within(checkDialog).queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open file' })).not.toBeInTheDocument();
  });

  it('summarizes all-current multi-PDF checks as accessible and attention states as aggregate warnings', () => {
    workflow.state = createMultiArtifactState();
    const response = workflow.state.attempts.find((item) => item.id === 'owned-srs');
    response.artifactChecks['field-highlights'] = {
      fieldId: 'field-highlights',
      status: 'Current',
      checkedAt: '2026-04-18T20:45:00+08:00',
      sourceUrl: response.values.validationHighlights,
      sourceResponseUpdatedAt: response.updatedAt,
      summary: 'Highlights PDF is readable and accessible.'
    };
    associateAccount();
    const view = renderDashboard();
    expect(screen.getByRole('button', { name: 'View submitted artifacts' }).closest('article')).toHaveTextContent('All files accessible');

    response.artifactChecks['field-highlights'] = {
      ...response.artifactChecks['field-highlights'],
      attentionRequired: true,
      summary: 'Highlights PDF needs attention.'
    };
    view.rerender(dashboardTree());
    expect(screen.getByRole('button', { name: 'View submitted artifacts' }).closest('article')).toHaveTextContent('Some files need attention');
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

  it('counts server-redacted responses without exposing private details', () => {
    associateAccount();
    workflow.state.attempts = workflow.state.attempts.map((response) => (
      response.id === 'owned-srs' ? response : {
        id: response.id,
        deliverableId: response.deliverableId,
        studentNumber: response.studentNumber,
        googleSubject: '',
        googleEmailSnapshot: '',
        values: {},
        feedback: []
      }
    ));
    renderDashboard();

    const deliverables = screen.getByRole('list', { name: 'Your deliverables' });
    expect(within(deliverables).getByText('SRS').closest('article')).toHaveTextContent('All 2 team members submitted');
    const sdd = within(deliverables).getByText('SDD').closest('article');
    expect(sdd).toHaveTextContent('Response recorded');
    expect(within(sdd).queryByRole('link', { name: 'Open file' })).not.toBeInTheDocument();
    expect(within(sdd).queryByRole('button', { name: 'Read feedback' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open file' })).toHaveLength(1);
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
    const dialog = await screen.findByRole('dialog', { name: /Document Check/i });

    expect(dialog).toHaveTextContent('SRS.pdf');
    expect(dialog).toHaveTextContent('Drive accessAccessible');
    expect(dialog).toHaveTextContent('File typePDF');
    expect(dialog).toHaveTextContent('DownloadAllowed');
    expect(dialog).toHaveTextContent('PDF integrityReadable');
    expect(dialog).toHaveTextContent('Readable text6,787 characters');
    expect(dialog).toHaveTextContent('Pages24');
    expect(dialog).toHaveTextContent('Official template structure');
    expect(dialog).not.toHaveTextContent('Template coverage');
    expect(dialog).not.toHaveTextContent('Unchanged instructions');
    expect(dialog).toHaveTextContent('Risk management');
    expect(within(dialog).getByRole('tab', { name: 'File history' })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('Last modified by');
    expect(dialog).toHaveTextContent('It does not grade your work or decide whether it is accepted.');
    expect(within(dialog).queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('STAFF ONLY AI ANALYSIS');
  });

  it('renders a server association snapshot without exposing student-side disconnect', async () => {
    const { disconnectStudentAssociation } = await import('../lib/api.js');
    workflow.state.association = {
      id: 'association-stale-roster',
      workspaceId: 'workspace-it',
      googleEmail: 'juan.student@gmail.com',
      studentNumber: '99-9999-999',
      studentName: 'SERVER ASSOCIATED STUDENT',
      teamCode: '2526-sem2-it332-99',
      assuranceLevel: 'SELF_DECLARED'
    };
    associateAccount({ studentNumber: '99-9999-999' });
    workflow.state.association = {
      id: 'association-stale-roster',
      workspaceId: 'workspace-it',
      googleEmail: 'juan.student@gmail.com',
      studentNumber: '99-9999-999',
      studentName: 'SERVER ASSOCIATED STUDENT',
      teamCode: '2526-sem2-it332-99',
      assuranceLevel: 'SELF_DECLARED'
    };
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'SERVER ASSOCIATED STUDENT' })).toBeInTheDocument();
    expect(screen.getByText('99-9999-999')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disconnect record' })).not.toBeInTheDocument();
    expect(disconnectStudentAssociation).not.toHaveBeenCalled();
  });

  it('renders a stable loading state while workspace data is being fetched', () => {
    workflow.session = { authenticated: true, email: 'juan.student@gmail.com', roles: [] };
    workflow.state.activeAccountEmail = 'juan.student@gmail.com';
    workflow.state.studentAccounts = [{ email: 'juan.student@gmail.com', googleSubject: 'google-juan', studentNumber: '' }];
    workflow.dashboardStatus = 'loading';
    renderDashboard();

    expect(screen.getByLabelText('Loading student dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Student Number/i })).not.toBeInTheDocument();
  });

  it('explains roster load failures and lets the student retry', () => {
    workflow.session = { authenticated: true, email: 'juan.student@gmail.com', roles: [] };
    workflow.state.activeAccountEmail = 'juan.student@gmail.com';
    workflow.state.studentAccounts = [{ email: 'juan.student@gmail.com', googleSubject: 'google-juan', studentNumber: '' }];
    workflow.state.students = [];
    workflow.dashboardStatus = 'error';
    workflow.dashboardError = 'The roster service is unavailable.';
    renderDashboard();

    expect(screen.getByRole('alert')).toHaveTextContent('The roster service is unavailable.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(workflow.refreshBackendData).toHaveBeenCalledTimes(1);
  });

  it('offers workspace selection before connecting a student record', () => {
    workflow.session = { authenticated: true, email: 'cs.student@gmail.com', roles: [] };
    workflow.state.activeAccountEmail = 'cs.student@gmail.com';
    workflow.state.studentAccounts = [{ email: 'cs.student@gmail.com', googleSubject: 'google-cs', studentNumber: '' }];
    renderDashboard();

    expect(screen.getByRole('combobox', { name: 'Workspace' })).toHaveValue('workspace-it');
  });

  it('renders a loading dashboard while backend sync is hydrating (ticket 03)', () => {
    associateAccount();
    workflow.dashboardStatus = 'loading';
    renderDashboard();

    expect(screen.getByLabelText('Loading student dashboard')).toBeInTheDocument();
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
    expect(screen.getByRole('combobox', { name: 'Workspace' })).toHaveValue('workspace-it');
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

  it('does not create a server association from the dashboard before a submission', async () => {
    const { confirmStudentAssociation } = await import('../lib/api.js');
    workflow.session = { authenticated: true, email: 'juan.student@gmail.com', roles: [] };
    workflow.state.activeAccountEmail = 'juan.student@gmail.com';
    workflow.state.studentAccounts = [{ email: 'juan.student@gmail.com', googleSubject: 'google-juan', studentNumber: '' }];
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Submit your first form' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^Open /i }).length).toBeGreaterThan(0);
    expect(confirmStudentAssociation).not.toHaveBeenCalled();
  });

  it('explains that opening or selecting a form does not reserve a Student Number', async () => {
    const { confirmStudentAssociation } = await import('../lib/api.js');
    workflow.session = { authenticated: true, email: 'juan.student@gmail.com', roles: [] };
    workflow.state.activeAccountEmail = 'juan.student@gmail.com';
    workflow.state.studentAccounts = [{ email: 'juan.student@gmail.com', googleSubject: 'google-juan', studentNumber: '' }];
    renderDashboard();

    expect(screen.getByRole('alert')).toHaveTextContent(/does not reserve the record/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/administrator recovery/i);
    expect(confirmStudentAssociation).not.toHaveBeenCalled();
  });

  it('does not start an identity mutation that could leak across account switches', async () => {
    const { confirmStudentAssociation } = await import('../lib/api.js');
    workflow.session = { authenticated: true, email: 'juan.student@gmail.com', roles: [] };
    const view = renderDashboard();
    workflow.session = { authenticated: true, email: 'other.student@example.com', roles: [] };
    view.rerender(dashboardTree());
    expect(confirmStudentAssociation).not.toHaveBeenCalled();
    expect(screen.getByText('other.student@example.com')).toBeInTheDocument();
  });

  it('requires administrator recovery instead of student-side disconnect', async () => {
    const { disconnectStudentAssociation } = await import('../lib/api.js');
    associateAccount();
    renderDashboard();

    expect(screen.queryByRole('button', { name: 'Disconnect record' })).not.toBeInTheDocument();
    expect(disconnectStudentAssociation).not.toHaveBeenCalled();
  });

  it('renders identity from the server association on a fresh browser with no local claim', async () => {
    workflow.state.association = {
      id: 'assoc-1',
      workspaceId: 'workspace-it',
      googleEmail: 'juan.student@gmail.com',
      studentNumber: '22-1001-001',
      studentName: 'DELA CRUZ, JUAN CARLOS M.',
      teamCode: '2526-sem2-it332-11',
      assuranceLevel: 'SELF_DECLARED'
    };
    workflow.session = { authenticated: true, email: 'juan.student@gmail.com', roles: [] };
    workflow.state.activeAccountEmail = 'juan.student@gmail.com';
    workflow.state.activeStudentNumber = '';
    workflow.state.studentAccounts = [{ email: 'juan.student@gmail.com', googleSubject: 'google-juan' }];
    workflow.state.students = [];
    renderDashboard();

    await screen.findByText('DELA CRUZ, JUAN CARLOS M.');
    expect(screen.getByText('22-1001-001')).toBeInTheDocument();
  });

  it('does not let a connected student switch the bound Student Number from the dashboard', async () => {
    const { confirmStudentAssociation, disconnectStudentAssociation } = await import('../lib/api.js');
    associateAccount();
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'DELA CRUZ, JUAN CARLOS M.' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Student Number/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disconnect record' })).not.toBeInTheDocument();
    expect(confirmStudentAssociation).not.toHaveBeenCalled();
    expect(disconnectStudentAssociation).not.toHaveBeenCalled();
  });
});
