import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { FormsPage } from './FormsPage.jsx';

const workflow = vi.hoisted(() => ({
  state: null
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
  activeWorkspaceId: 'workspace-it'
}));

const submissionClient = vi.hoisted(() => ({
  listDeliverables: vi.fn(),
  saveDeliverable: vi.fn(),
  unpublishDeliverable: vi.fn()
}));

vi.mock('../app/WorkflowContext.jsx', () => ({
  useWorkflow: () => workflow
}));

vi.mock('../app/WorkspaceSession.jsx', () => ({
  useWorkspaceSession: () => workspaceSession
}));

vi.mock('../lib/submissionClient.js', () => submissionClient);

function createState() {
  return {
    classRecord: { pendingFormSuggestions: [] },
    trackerColumns: [
      { id: 'column-srs', key: 'SRS', label: 'SRS', active: true, pdfRequired: true },
      { id: 'column-sdd', key: 'SDD', label: 'SDD', active: true, pdfRequired: true },
      { id: 'column-code', key: 'SourceCode', label: 'Source Code', active: true, pdfRequired: false }
    ],
    deliverables: [
      {
        id: 'deliverable-srs',
        slug: 'week-9-srs',
        title: 'Software Requirements Specification',
        shortTitle: 'SRS',
        trackerColumn: 'SRS',
        dueAt: '2026-04-18T23:59:00+08:00',
        instructions: 'Submit the completed SRS as a PDF Drive file.',
        status: 'Published',
        fields: [{ id: 'documentPdf', label: 'PDF Drive Link', pdfRequired: true }]
      },
      {
        id: 'deliverable-sdd',
        slug: 'week-10-sdd',
        title: 'Software Design Description',
        shortTitle: 'SDD',
        trackerColumn: 'SDD',
        dueAt: '2026-04-25T23:59:00+08:00',
        instructions: 'Submit the completed SDD as a PDF Drive file.',
        status: 'Published',
        fields: [{ id: 'documentPdf', label: 'PDF Drive Link', pdfRequired: true }]
      }
    ],
    attempts: [{ id: 'response-srs', deliverableId: 'deliverable-srs' }]
  };
}

function PageHarness() {
  return (
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ModalsProvider>
        <Notifications />
        <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <FormsPage />
        </MemoryRouter>
      </ModalsProvider>
    </MantineProvider>
  );
}

function renderPage() {
  return render(<PageHarness />);
}

describe('forms management', () => {
  beforeEach(() => {
    workflow.state = createState();
    workspaceSession.activeWorkspace = {
      id: 'workspace-it',
      name: 'IT Capstone - IT332',
      program: 'IT',
      courseCode: 'IT332',
      semester: 'Semester 2',
      academicYear: '2025-26'
    };
    workspaceSession.activeWorkspaceId = 'workspace-it';
    submissionClient.listDeliverables.mockReset().mockImplementation(async () => workflow.state.deliverables);
    submissionClient.saveDeliverable.mockReset().mockImplementation(async (_workspaceId, payload) => ({
      ...payload,
      id: payload.id || 'deliverable-created'
    }));
    submissionClient.unpublishDeliverable.mockReset().mockImplementation(async (_workspaceId, item) => ({ ...item, status: 'Unpublished' }));
  });

  it('renders scalable rows with an opening link and a separate accessible copy action', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderPage();

    const table = await screen.findByRole('table', { name: 'Published submission forms' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    within(table).getAllByText('Published').forEach((label) => {
      expect(label.closest('.wt-status-indicator')).toHaveAttribute('data-tone', 'success');
    });
    expect(within(table).getByRole('link', { name: 'Open SRS submission form' })).toHaveAttribute(
      'href',
      '/w/it-it332-2025-26-semester-2/submit/week-9-srs'
    );

    fireEvent.click(within(table).getByRole('button', { name: 'Copy SRS form link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/submit/week-9-srs')));
    expect(screen.getByRole('status')).toHaveTextContent('SRS form link copied');
  });

  it('renders deliverables returned by the server even when the workflow mirror is empty', async () => {
    workflow.state.deliverables = [];
    submissionClient.listDeliverables.mockResolvedValue([{
      ...createState().deliverables[0],
      title: 'Server SRS'
    }]);

    renderPage();

    expect(await screen.findByText('Server SRS')).toBeInTheDocument();
    expect(screen.queryByText('Software Requirements Specification')).not.toBeInTheDocument();
  });

  it('edits an existing form in a prefilled dialog and preserves its identity in the payload', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit SRS form' }));

    const dialog = screen.getByRole('dialog', { name: 'Edit SRS form' });
    const title = within(dialog).getByRole('textbox', { name: 'Form title' });
    expect(title).toHaveValue('Software Requirements Specification');
    fireEvent.change(title, { target: { value: 'Revised SRS Submission' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(submissionClient.saveDeliverable).toHaveBeenCalledWith('workspace-it', expect.objectContaining({
      id: 'deliverable-srs',
      slug: 'week-9-srs',
      title: 'Revised SRS Submission'
    })));
  });

  it('shows a rejected server mutation without replacing the authoritative form row', async () => {
    submissionClient.saveDeliverable.mockRejectedValue(new Error('Server rejected the form update.'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit SRS form' }));

    const dialog = screen.getByRole('dialog', { name: 'Edit SRS form' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Form title' }), {
      target: { value: 'Rejected SRS Title' }
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Server rejected the form update.')).toBeInTheDocument();
    expect(screen.getByText('Software Requirements Specification')).toBeInTheDocument();
    expect(screen.queryByText('Rejected SRS Title')).not.toBeInTheDocument();
  });

  it('creates the first unconfigured deliverable with an 11:59 PM deadline by default', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Publish form' }));

    const dialog = screen.getByRole('dialog', { name: 'Publish a form' });
    expect(within(dialog).getByRole('textbox', { name: /Deliverable/ })).toHaveValue('Source Code');
    expect(within(dialog).getByLabelText('Due date')).not.toHaveValue('');
    expect(within(dialog).getByLabelText('Due time')).toHaveValue('23:59');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish form' }));

    await waitFor(() => expect(submissionClient.saveDeliverable).toHaveBeenCalledWith('workspace-it', expect.objectContaining({
      id: '',
      trackerColumn: 'SourceCode',
      dueAt: expect.stringMatching(/T23:59:00\+08:00$/)
    })));
  });

  it('unpublishes only the selected form after explaining that responses remain', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Unpublish SRS form' }));

    const confirmation = await screen.findByRole('dialog', { name: 'Unpublish SRS?' });
    expect(confirmation).toHaveTextContent('1 existing response will remain recorded');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Unpublish form' }));

    await waitFor(() => expect(submissionClient.unpublishDeliverable).toHaveBeenCalledWith('workspace-it', expect.objectContaining({ id: 'deliverable-srs' })));
  });

  it('shows one row per real deliverable when saved state still holds duplicate copies', async () => {
    workflow.state.deliverables = [
      ...workflow.state.deliverables,
      {
        id: '44444444-4444-4444-8444-444444444444',
        slug: 'srs',
        title: 'SRS Submission',
        shortTitle: 'SRS',
        trackerColumn: 'SRS',
        dueAt: '2026-04-18T23:59:00+08:00',
        status: 'Published',
        fields: [{ id: 'documentPdf', label: 'PDF Drive Link', pdfRequired: true }]
      },
      {
        id: 'deliv-generated-1780000000003',
        slug: 'sdd-submission',
        title: 'SDD Submission',
        shortTitle: 'SDD',
        trackerColumn: 'SDD',
        dueAt: '2026-04-25T23:59:00+08:00',
        status: 'Published',
        fields: [{ id: 'documentPdf', label: 'PDF Drive Link', pdfRequired: true }]
      }
    ];

    renderPage();

    const table = await screen.findByRole('table', { name: 'Published submission forms' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getAllByRole('link', { name: /submission form$/ })).toHaveLength(2);
  });

  it('ignores a deliverable load that finishes after the user switches workspaces', async () => {
    let resolveOldWorkspace;
    submissionClient.listDeliverables
      .mockReset()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOldWorkspace = resolve; }))
      .mockResolvedValueOnce([{
        id: 'deliverable-code',
        slug: 'source-code',
        title: 'CS Source Code',
        shortTitle: 'Source Code',
        trackerColumn: 'SourceCode',
        dueAt: '2026-05-01T23:59:00+08:00',
        instructions: 'Submit the repository link.',
        status: 'Published',
        fields: [{ id: 'primaryLink', label: 'Submission Link', pdfRequired: false }]
      }]);

    const view = renderPage();
    await waitFor(() => expect(submissionClient.listDeliverables).toHaveBeenCalledWith('workspace-it'));

    workspaceSession.activeWorkspace = {
      ...workspaceSession.activeWorkspace,
      id: 'workspace-cs',
      name: 'CS Capstone - CS332',
      program: 'CS',
      courseCode: 'CS332'
    };
    workspaceSession.activeWorkspaceId = 'workspace-cs';
    view.rerender(<PageHarness />);

    expect(await screen.findByText('CS Source Code')).toBeInTheDocument();
    resolveOldWorkspace([{
      ...createState().deliverables[0],
      title: 'Stale IT SRS'
    }]);

    await waitFor(() => expect(screen.queryByText('Stale IT SRS')).not.toBeInTheDocument());
    expect(screen.getByText('CS Source Code')).toBeInTheDocument();
  });

});
