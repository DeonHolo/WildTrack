import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { CommandCenterPage } from './CommandCenterPage.jsx';

const workflow = vi.hoisted(() => ({
  state: null,
  activeWorkspaceId: null,
  runDocumentCheck: vi.fn(),
  runDocumentChecks: vi.fn(),
  archiveAttempt: vi.fn()
}));

const api = vi.hoisted(() => ({
  getIdentityConflicts: vi.fn(),
  decideIdentityConflict: vi.fn()
}));

vi.mock('../app/WorkflowContext.jsx', () => ({
  useWorkflow: () => workflow
}));

vi.mock('../lib/api.js', () => api);

const submittedAt = '2026-04-19T11:04:00+08:00';

function response(id, overrides = {}) {
  return {
    id,
    deliverableId: 'deliv-srs',
    studentNumber: `23-${id.slice(-3)}0-001`,
    studentName: `Student ${id}`,
    teamCode: '2526-sem2-it332-07',
    submittedAt,
    updatedAt: submittedAt,
    values: { documentPdf: `https://drive.google.com/file/d/${id}/view` },
    flags: ['Received'],
    reviewStatus: 'Received',
    archiveStatus: 'Not Archived',
    documentCheck: null,
    ...overrides
  };
}

function checkedResponse(id, overrides = {}) {
  return response(id, {
    reviewStatus: 'Needs Review',
    documentCheck: {
      status: 'Current',
      checkedAt: '2026-04-20T09:00:00+08:00',
      sourceResponseUpdatedAt: submittedAt,
      summary: 'Readable PDF with sections requiring a staff decision.'
    },
    ...overrides
  });
}

function makeState(attempts = []) {
  return {
    students: attempts.map((item, index) => ({
      studentNumber: item.studentNumber,
      name: item.studentName,
      teamCode: item.teamCode,
      memberNumber: index + 1
    })),
    deliverables: [{
      id: 'deliv-srs',
      shortTitle: 'SRS',
      title: 'Week 9: Software Requirements Specification',
      trackerColumn: 'SRS',
      status: 'Published',
      fields: [{ id: 'documentPdf', label: 'PDF Drive link', pdfRequired: true }]
    }],
    attempts,
    archives: [],
    classRecord: { importSummary: null, importWarnings: [], sources: {} }
  };
}

function renderPage() {
  return render(
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ModalsProvider>
        <Notifications />
        <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <CommandCenterPage />
        </MemoryRouter>
      </ModalsProvider>
    </MantineProvider>
  );
}

describe("today's work queues", () => {
  beforeEach(() => {
    workflow.state = makeState([
      response('unchecked-001'),
      checkedResponse('review-002'),
      response('identity-003', { identityConflict: true }),
      response('accepted-004', { reviewStatus: 'Accepted' }),
      response('archived-005', { reviewStatus: 'Accepted', archiveStatus: 'Archived' })
    ]);
    workflow.state.classRecord.importSummary = {
      sourceType: 'Tracker',
      resultStatus: 'Imported with warnings',
      warnings: ['No deadline row was detected.']
    };
    workflow.runDocumentCheck.mockReset().mockResolvedValue({ ok: true });
    workflow.runDocumentChecks.mockReset().mockResolvedValue({ completed: 1, total: 1, failed: 0, results: [] });
    workflow.archiveAttempt.mockReset().mockResolvedValue({ ok: true, archived: 1 });
    workflow.activeWorkspaceId = null;
    api.getIdentityConflicts.mockReset().mockResolvedValue([]);
    api.decideIdentityConflict.mockReset().mockResolvedValue({ status: 'RESOLVED' });
  });

  it('shows only unresolved operational work without metric cards or recent activity', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: "Today's work" })).toBeInTheDocument();
    expect(screen.queryByText('Open forms')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent activity')).not.toBeInTheDocument();

    const queue = screen.getByRole('table', { name: "Today's work queue" });
    expect(within(queue).getByText('Document Check')).toBeInTheDocument();
    expect(within(queue).getByText('Review decision')).toBeInTheDocument();
    expect(within(queue).getByText('Identity conflict')).toBeInTheDocument();
    expect(within(queue).getByText('Import warning')).toBeInTheDocument();
    expect(within(queue).getAllByText('Archive final')).toHaveLength(2);
    expect(within(queue).queryByText('archived-005')).not.toBeInTheDocument();
  });

  it('removes checked and archived tasks immediately after their in-place actions', async () => {
    workflow.runDocumentCheck.mockImplementation(async (id) => {
      workflow.state = makeState(workflow.state.attempts.map((item) => item.id === id ? checkedResponse(id) : item));
      return { ok: true };
    });
    workflow.archiveAttempt.mockImplementation(async (id) => {
      workflow.state = makeState(workflow.state.attempts.map((item) => item.id === id ? { ...item, archiveStatus: 'Archived' } : item));
      return { ok: true, archived: 1 };
    });
    const view = renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Check Student unchecked-001 document' }));
    await waitFor(() => expect(workflow.runDocumentCheck).toHaveBeenCalledWith('unchecked-001'));
    view.rerender(
      <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
        <ModalsProvider><Notifications /><MemoryRouter><CommandCenterPage /></MemoryRouter></ModalsProvider>
      </MantineProvider>
    );
    expect(screen.queryByRole('button', { name: 'Check Student unchecked-001 document' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archive Student accepted-004 final' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Archive this accepted response?' });
    expect(confirmation).toHaveTextContent('one archive metadata record');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Archive response' }));
    await waitFor(() => expect(workflow.archiveAttempt).toHaveBeenCalledWith('accepted-004'));
  });

  it('opens destination pages with the exact response, deliverable, source, or archive record in context', () => {
    workflow.state.archives = [{
      id: 'archive-failed-1',
      attemptId: 'archived-005',
      storageStatus: 'Failed',
      integrityStatus: 'Unavailable',
      teamCode: '2526-sem2-it332-07',
      deliverableTitle: 'Software Requirements Specification',
      archivedAt: submittedAt
    }];
    renderPage();

    expect(screen.getByRole('link', { name: 'Review Student review-002 response' }))
      .toHaveAttribute('href', '/review?deliverable=deliv-srs&response=review-002');
    expect(screen.getByRole('link', { name: 'Resolve Student identity-003 identity conflict' }))
      .toHaveAttribute('href', '/review?deliverable=deliv-srs&response=identity-003');
    expect(screen.getByRole('link', { name: 'Open Tracker import warning' }))
      .toHaveAttribute('href', '/workspace?source=tracker');
    expect(screen.getByRole('link', { name: 'Open failed archive record' }))
      .toHaveAttribute('href', '/archive?record=archive-failed-1');
  });

  it('stays compact at realistic workload volume and filters by work type', () => {
    workflow.state = makeState(Array.from({ length: 318 }, (_, index) => response(`unchecked-${String(index + 1).padStart(3, '0')}`)));
    renderPage();

    const queue = screen.getByRole('table', { name: "Today's work queue" });
    expect(within(queue).getAllByRole('row')).toHaveLength(51);
    expect(screen.getByText('Showing 1-50 of 318')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 7')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByText('No review work')).toBeInTheDocument();
  });

  it('shows a concise all-clear state when no actionable work exists', () => {
    workflow.state = makeState([
      checkedResponse('accepted-001', { reviewStatus: 'Accepted', archiveStatus: 'Archived' })
    ]);
    renderPage();

    expect(screen.getByText('All clear for this workspace')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: "Today's work queue" })).not.toBeInTheDocument();
  });
});

describe('identity conflicts from the server', () => {
  const conflict = {
    id: 'conflict-1',
    studentRecordId: 'record-1',
    studentNumber: '20-0649-750',
    studentName: 'Deon Holo',
    teamCode: '2526-sem2-it332-07',
    status: 'OPEN',
    createdAt: '2026-04-21T08:30:00+08:00',
    existingIdentity: { googleSubject: 'sub-first', googleEmail: 'rontaghoy@gmail.com', active: true },
    conflictingIdentity: { googleSubject: 'sub-second', googleEmail: 'impostor@gmail.com', active: true }
  };

  beforeEach(() => {
    workflow.state = makeState([]);
    // The page must read the workspace from the workflow context root, as production does.
    workflow.activeWorkspaceId = 'workspace-1';
    api.getIdentityConflicts.mockReset().mockResolvedValue([conflict]);
    api.decideIdentityConflict.mockReset().mockResolvedValue({ ...conflict, status: 'RESOLVED' });
  });

  it('renders each open conflict with its Student Record and both competing identities', async () => {
    renderPage();

    await waitFor(() => expect(api.getIdentityConflicts).toHaveBeenCalledWith('workspace-1'));
    const queue = await screen.findByRole('table', { name: "Today's work queue" });
    expect(within(queue).getByText('Identity conflict')).toBeInTheDocument();
    expect(within(queue).getByText(/Deon Holo/)).toBeInTheDocument();
    expect(within(queue).getByText(/20-0649-750/)).toBeInTheDocument();
    expect(within(queue).getByText(/rontaghoy@gmail.com/)).toBeInTheDocument();
    expect(within(queue).getByText(/impostor@gmail.com/)).toBeInTheDocument();
  });

  it('records a resolve decision and drops the conflict from the open list', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Resolve 20-0649-750 identity conflict' }));
    await waitFor(() => expect(api.decideIdentityConflict)
      .toHaveBeenCalledWith('workspace-1', 'conflict-1', 'RESOLVED'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Resolve 20-0649-750 identity conflict' })).not.toBeInTheDocument());
    expect(screen.getByText('All clear for this workspace')).toBeInTheDocument();
  });

  it('records a dismiss decision and drops the conflict from the open list', async () => {
    api.decideIdentityConflict.mockResolvedValue({ ...conflict, status: 'DISMISSED' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss 20-0649-750 identity conflict' }));
    await waitFor(() => expect(api.decideIdentityConflict)
      .toHaveBeenCalledWith('workspace-1', 'conflict-1', 'DISMISSED'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Dismiss 20-0649-750 identity conflict' })).not.toBeInTheDocument());
  });

  it('keeps the conflict listed when the decision fails', async () => {
    api.decideIdentityConflict.mockRejectedValue(new Error('Admin authorization required.'));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Resolve 20-0649-750 identity conflict' }));
    await waitFor(() => expect(api.decideIdentityConflict).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Resolve 20-0649-750 identity conflict' })).toBeInTheDocument();
  });

  it('says the queue is incomplete instead of all clear when conflicts cannot be loaded', async () => {
    api.getIdentityConflicts.mockRejectedValue(new Error('Identity conflicts service is unavailable.'));
    renderPage();

    expect(await screen.findByText('Identity conflicts could not be loaded')).toBeInTheDocument();
    expect(screen.getByText('Work queue is incomplete')).toBeInTheDocument();
    expect(screen.queryByText('All clear for this workspace')).not.toBeInTheDocument();
  });
});
