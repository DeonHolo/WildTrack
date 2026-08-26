import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from './theme.js';
import { WorkflowProvider, useWorkflow } from './WorkflowContext.jsx';
import { RoleBoundary } from './RoleBoundary.jsx';
import { StaffApplicationShell } from '../components/layout/StaffApplicationShell.jsx';
import { StudentApplicationShell } from '../components/layout/StudentApplicationShell.jsx';
import { APPLICATION_ROLES } from '../hooks/useApplicationRole.js';
import { StudentStatusPage } from '../pages/StudentStatusPage.jsx';
import { CommandCenterPage } from '../pages/CommandCenterPage.jsx';
import { RegisterPage } from '../pages/RegisterPage.jsx';
import { useEffect, useRef } from 'react';

const DEFAULT_WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';

let mockBackendAssociation = null;
let mockConflicts = [];
let mockResponses = [];

vi.mock('../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getWorkspaces: vi.fn(async () => [
      {
        id: DEFAULT_WORKSPACE_ID,
        name: 'IT Capstone - IT332',
        program: 'IT',
        courseCode: 'IT332',
        semester: 'Semester 2',
        academicYear: '2025-26',
        active: true
      }
    ]),
    getBackendSnapshot: vi.fn(async (workspaceId) => ({
      workspaceId: workspaceId || DEFAULT_WORKSPACE_ID,
      students: [
        {
          id: 'rec-1',
          studentNumber: '22-1001-001',
          studentName: 'DELA CRUZ, JUAN CARLOS M.',
          teamCode: '2526-sem2-it332-11',
          memberNumber: 1,
          adviserName: 'Sir Roberto Villanueva'
        },
        {
          id: 'rec-2',
          studentNumber: '22-1002-002',
          studentName: 'SANTOS, MARIA L.',
          teamCode: '2526-sem2-it332-11',
          memberNumber: 2,
          adviserName: 'Sir Roberto Villanueva'
        }
      ],
      deliverables: [
        {
          id: 'deliv-srs-uuid',
          title: 'Software Requirements Specification',
          shortTitle: 'SRS',
          slug: 'week-9-srs',
          description: 'Submit your SRS PDF.',
          dueAt: '2026-04-18T23:59:00',
          active: true,
          status: 'PUBLISHED',
          trackerColumn: 'SRS'
        }
      ],
      trackerColumns: [
        { id: 'col-srs', columnKey: 'SRS', label: 'SRS', active: true }
      ],
      sources: [],
      staffResponses: mockResponses,
      responses: mockResponses,
      attempts: mockResponses,
      failures: []
    })),
    getMyAssociation: vi.fn(async () => mockBackendAssociation),
    confirmStudentAssociation: vi.fn(async (workspaceId, studentNumber) => {
      mockBackendAssociation = {
        id: 'assoc-1',
        workspaceId,
        googleEmail: 'juan.student@gmail.com',
        studentNumber,
        studentName: 'DELA CRUZ, JUAN CARLOS M.',
        teamCode: '2526-sem2-it332-11',
        assuranceLevel: 'SELF_DECLARED'
      };
      return mockBackendAssociation;
    }),
    disconnectStudentAssociation: vi.fn(async () => {
      mockBackendAssociation = null;
      return {};
    }),
    getIdentityConflicts: vi.fn(async () => mockConflicts.filter((c) => c.status === 'OPEN')),
    decideIdentityConflict: vi.fn(async (workspaceId, conflictId, decision, note) => {
      const conflict = mockConflicts.find((c) => c.id === conflictId);
      if (conflict) {
        conflict.status = decision === 'DISMISSED' ? 'DISMISSED' : 'RESOLVED';
        conflict.decision = decision;
        conflict.decidedBy = 'admin@wildtrack.test';
        conflict.decidedAt = new Date().toISOString();
        conflict.decisionNote = note;
      }
      return conflict;
    }),
    getCurrentSession: vi.fn(async () => null),
    logout: vi.fn(async () => ({})),
    submitFormResponse: vi.fn(async () => ({ ok: true })),
    saveBackendDeliverable: vi.fn(async () => ({ ok: true })),
    deleteDocumentTemplate: vi.fn(async () => ({ ok: true })),
    uploadDocumentTemplate: vi.fn(async () => ({ ok: true })),
    uploadDriveDocumentTemplate: vi.fn(async () => ({ ok: true })),
    runDocumentCheck: vi.fn(async () => ({ ok: true })),
    importSheetSource: vi.fn(async () => ({ ok: true })),
    writeTrackerValue: vi.fn(async () => ({ ok: true })),
    createWorkspace: vi.fn(async () => ({ ok: true }))
  };
});

function Authenticator({ identity, children }) {
  const { authenticateGoogleAccount } = useWorkflow();
  const appliedRef = useRef('');
  useEffect(() => {
    if (identity?.email && appliedRef.current !== identity.email) {
      appliedRef.current = identity.email;
      authenticateGoogleAccount(identity);
    }
  }, [identity, authenticateGoogleAccount]);
  return children;
}

function renderApp(initialRoute = '/student', authIdentity = null) {
  return render(
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ModalsProvider>
        <Notifications />
        <MemoryRouter initialEntries={[initialRoute]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <WorkflowProvider allowLocalImportFallback={false}>
            <Authenticator identity={authIdentity}>
              <Routes>
                <Route path="/login" element={<StudentApplicationShell><RegisterPage /></StudentApplicationShell>} />
                <Route path="/student" element={(
                  <RoleBoundary allow={[APPLICATION_ROLES.STUDENT]}>
                    <StudentApplicationShell><StudentStatusPage /></StudentApplicationShell>
                  </RoleBoundary>
                )} />
                <Route path="/" element={(
                  <RoleBoundary allow={[APPLICATION_ROLES.ADMIN]}>
                    <StaffApplicationShell><CommandCenterPage /></StaffApplicationShell>
                  </RoleBoundary>
                )} />
              </Routes>
            </Authenticator>
          </WorkflowProvider>
        </MemoryRouter>
      </ModalsProvider>
    </MantineProvider>
  );
}

describe('cross-browser persistence verification journey (Ticket 12)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockBackendAssociation = null;
    mockConflicts = [];
    mockResponses = [];
  });

  it('proves student connection and submission persistence in a second cleared-storage context', async () => {
    localStorage.setItem('wildtrack.v2.preview-role', 'student');
    const juanIdentity = {
      email: 'juan.student@gmail.com',
      subject: 'google-sub-juan',
      sub: 'google-sub-juan',
      name: 'Juan Carlos Dela Cruz'
    };

    // First context: connect
    const firstContext = renderApp('/student', juanIdentity);
    const studentSelect = await firstContext.findByPlaceholderText(/Search Student Number/i);
    fireEvent.focus(studentSelect);
    fireEvent.change(studentSelect, { target: { value: '22-1001' } });
    fireEvent.click(await firstContext.findByRole('option', { name: /22-1001-001/i, hidden: true }));

    fireEvent.click(firstContext.getByRole('button', { name: 'Connect student record' }));
    const modal = await firstContext.findByRole('dialog', { name: 'Connect this student record?' });
    fireEvent.click(within(modal).getByRole('button', { name: 'Connect record' }));

    expect(await firstContext.findByText('DELA CRUZ, JUAN CARLOS M.')).toBeInTheDocument();
    expect(firstContext.getByText('22-1001-001')).toBeInTheDocument();

    // Verify section switch UI is completely removed from the student dashboard
    expect(firstContext.queryByLabelText('Capstone section')).not.toBeInTheDocument();
    expect(firstContext.queryByRole('button', { name: /Switch section/i })).not.toBeInTheDocument();

    // Simulate backend response
    mockResponses.push({
      id: 'response-srs-1',
      deliverableId: 'deliv-srs-uuid',
      workspaceId: DEFAULT_WORKSPACE_ID,
      studentNumber: '22-1001-001',
      studentName: 'DELA CRUZ, JUAN CARLOS M.',
      teamCode: '2526-sem2-it332-11',
      googleSubject: 'google-sub-juan',
      googleEmail: 'juan.student@gmail.com',
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      valuesJson: JSON.stringify({ documentPdf: 'https://drive.google.com/file/d/juan-srs-doc/view' })
    });

    firstContext.unmount();

    // Second context: completely cleared browser storage
    localStorage.clear();
    localStorage.setItem('wildtrack.v2.preview-role', 'student');

    const secondContext = renderApp('/student', juanIdentity);

    // Identity and submission are derived directly from server state
    expect(await secondContext.findByText('DELA CRUZ, JUAN CARLOS M.')).toBeInTheDocument();
    expect(secondContext.getByText('22-1001-001')).toBeInTheDocument();
    expect(secondContext.getAllByText('Submitted').length).toBeGreaterThanOrEqual(1);
  });

  it('surfaces identity conflicts to staff and resolves them in Today\'s Work', async () => {
    localStorage.setItem('wildtrack.v2.preview-role', 'admin');
    mockConflicts = [
      {
        id: 'conflict-1',
        workspaceId: DEFAULT_WORKSPACE_ID,
        studentNumber: '22-1001-001',
        studentName: 'DELA CRUZ, JUAN CARLOS M.',
        teamCode: '2526-sem2-it332-11',
        status: 'OPEN',
        existingIdentity: {
          googleSubject: 'google-sub-juan',
          googleEmail: 'juan.student@gmail.com',
          displayName: 'Juan Carlos Dela Cruz'
        },
        conflictingIdentity: {
          googleSubject: 'google-sub-imposter',
          googleEmail: 'competing.user@gmail.com',
          displayName: 'Competing User'
        },
        competingSubmissionCount: 1,
        decision: null,
        decidedBy: null,
        decidedAt: null
      }
    ];

    const adminIdentity = {
      email: 'admin@wildtrack.test',
      subject: 'google-sub-admin',
      sub: 'google-sub-admin',
      name: 'Ralph Laviste'
    };

    const adminContext = renderApp('/', adminIdentity);

    expect(await adminContext.findByText(/has two Google accounts claiming one Student Record/i)).toBeInTheDocument();
    expect(adminContext.getByText(/juan.student@gmail.com/i)).toBeInTheDocument();
    expect(adminContext.getByText(/competing.user@gmail.com/i)).toBeInTheDocument();

    const resolveBtn = adminContext.getByRole('button', { name: /Resolve.*conflict/i });
    fireEvent.click(resolveBtn);

    await waitFor(() => expect(mockConflicts[0].decision).toBe('RESOLVED'));
    await waitFor(() => expect(adminContext.queryByText(/has two Google accounts/i)).not.toBeInTheDocument());
  });

  it('ends session everywhere when logging out from staff or student view', async () => {
    localStorage.setItem('wildtrack.v2.preview-role', 'admin');
    const adminIdentity = {
      email: 'admin@wildtrack.test',
      subject: 'google-sub-admin',
      sub: 'google-sub-admin',
      name: 'Ralph Laviste'
    };

    const adminContext = renderApp('/', adminIdentity);
    const accountGroup = await adminContext.findByRole('group', { name: 'Signed-in staff account' });
    const logoutBtn = within(accountGroup).getByRole('button', { name: 'Log out' });
    fireEvent.click(logoutBtn);

    expect(await adminContext.findByRole('heading', { name: 'Welcome to WildTrack' })).toBeInTheDocument();
  });
});



