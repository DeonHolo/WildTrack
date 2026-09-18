import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications, notifications } from '@mantine/notifications';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
  saveDeliverable: vi.fn(),
  unpublishAllDeliverables: vi.fn(),
  unpublishDeliverable: vi.fn()
}));

const formsClient = vi.hoisted(() => ({ loadFormsState: vi.fn() }));

vi.mock('../app/WorkspaceSession.jsx', () => ({
  useWorkspaceSession: () => workspaceSession
}));

vi.mock('../lib/formsClient.js', () => ({
  emptyFormsState: () => ({ trackerColumns: [], deliverables: [], students: [], attempts: [] }),
  loadFormsState: (...args) => formsClient.loadFormsState(...args)
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

function mvpValidationFields() {
  return [
    { id: 'validationInstrument', definitionId: 'field-form', label: 'Validation Instrument', type: 'googleForm', required: true, pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false, active: true },
    { id: 'frameworkModel', definitionId: 'field-framework', label: 'Framework / Model', type: 'drive', required: true, pdfRequired: true, documentCheckPolicy: 'AUTO', aiReviewEnabled: true, active: true },
    { id: 'responseSheet', definitionId: 'field-sheet', label: 'Validation Response Sheet', type: 'googleSheet', required: true, pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false, active: true },
    { id: 'validationHighlights', definitionId: 'field-highlights', label: 'MVP Validation Highlights', type: 'drive', required: true, pdfRequired: true, documentCheckPolicy: 'MANUAL', aiReviewEnabled: true, active: true },
    { id: 'validationEvidence', definitionId: 'field-folder', label: 'Validation Evidence', type: 'driveFolder', required: true, pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false, active: true }
  ];
}

function PageHarness() {
  return (
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ModalsProvider>
        <Notifications />
        <MemoryRouter initialEntries={['/forms']} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <Routes>
            <Route path="/forms" element={<FormsPage />} />
            <Route path="/forms/new" element={<h1>New form editor</h1>} />
            <Route path="/forms/:formId/edit" element={<h1>Edit form editor</h1>} />
          </Routes>
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
    Element.prototype.scrollIntoView = vi.fn();
    notifications.clean();
    workspaceSession.session = { authenticated: true, email: 'admin@example.com' };
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
    formsClient.loadFormsState.mockReset().mockImplementation(async () => workflow.state);
    submissionClient.saveDeliverable.mockReset().mockImplementation(async (_workspaceId, payload) => ({
      ...payload,
      id: payload.id || 'deliverable-created'
    }));
    submissionClient.unpublishDeliverable.mockReset().mockImplementation(async (_workspaceId, item) => ({ ...item, status: 'Unpublished' }));
    submissionClient.unpublishAllDeliverables.mockReset().mockImplementation(async () => (
      workflow.state.deliverables.map((item) => ({ ...item, status: 'Unpublished' }))
    ));
  });

  it('renders scalable rows with an opening link and a separate accessible copy action', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderPage();

    const table = await screen.findByRole('table', { name: 'Submission forms' });
    expect(screen.getByRole('heading', { name: 'Submission forms' })).toBeInTheDocument();
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3));
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

  it('does not claim there are zero forms while the first request is pending', () => {
    formsClient.loadFormsState.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.queryByText('0 forms')).not.toBeInTheDocument();
  });

  it('renders deliverables returned by the forms client without a local workflow mirror', async () => {
    workflow.state.deliverables = [];
    formsClient.loadFormsState.mockResolvedValue({ ...createState(), deliverables: [{
      ...createState().deliverables[0],
      title: 'Server SRS'
    }] });

    renderPage();

    expect(await screen.findByText('Server SRS')).toBeInTheDocument();
    expect(screen.queryByText('Software Requirements Specification')).not.toBeInTheDocument();
  });

  it('opens an existing form in the full-page editor route', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit SRS form' }));
    expect(await screen.findByRole('heading', { name: 'Edit form editor' })).toBeInTheDocument();
  });

  it('opens create in the full-page new form route', async () => {
    renderPage();
    const create = await screen.findByRole('button', { name: 'New form' });
    expect(create).toBeEnabled();
    fireEvent.click(create);
    expect(await screen.findByRole('heading', { name: 'New form editor' })).toBeInTheDocument();
  });

  it('unpublishes only the selected form after explaining that responses remain', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Unpublish SRS form' }));

    const confirmation = await screen.findByRole('dialog', { name: 'Unpublish SRS?' });
    expect(confirmation).toHaveTextContent('1 existing response will remain recorded');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Unpublish form' }));

    await waitFor(() => expect(submissionClient.unpublishDeliverable).toHaveBeenCalledWith('workspace-it', expect.objectContaining({ id: 'deliverable-srs' })));
  });

  it('unpublishes every currently published form in one confirmed end-of-semester cleanup action', async () => {
    let finishBatch;
    submissionClient.unpublishAllDeliverables.mockImplementationOnce(() => new Promise((resolve) => { finishBatch = resolve; }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Unpublish all' }));

    const confirmation = await screen.findByRole('dialog', { name: 'Unpublish all 2 published forms?' });
    expect(confirmation).toHaveTextContent('1 existing response will remain recorded');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Unpublish all' }));

    const progress = await screen.findByRole('status', { name: 'Unpublishing all forms' });
    expect(progress).toHaveTextContent('Unpublishing 2 forms');
    expect(progress).toHaveTextContent('one server-side batch');
    expect(submissionClient.unpublishAllDeliverables).toHaveBeenCalledTimes(1);
    expect(submissionClient.unpublishAllDeliverables).toHaveBeenCalledWith('workspace-it');
    expect(submissionClient.unpublishDeliverable).not.toHaveBeenCalled();
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);

    await act(async () => finishBatch(workflow.state.deliverables.map((item) => ({ ...item, status: 'Unpublished' }))));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Unpublish all' })).not.toBeInTheDocument());
    expect(screen.queryByRole('status', { name: 'Unpublishing all forms' })).not.toBeInTheDocument();
  });

  it('restores controls and reports failure when bulk cleanup cannot be confirmed by a reload', async () => {
    submissionClient.unpublishAllDeliverables.mockRejectedValueOnce(new Error('Bulk cleanup failed.'));
    formsClient.loadFormsState
      .mockReset()
      .mockResolvedValueOnce(workflow.state)
      .mockRejectedValueOnce(new Error('Authoritative reload unavailable.'));

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Unpublish all' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Unpublish all 2 published forms?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Unpublish all' }));

    expect(await screen.findByRole('alert', { name: 'Form error' })).toHaveTextContent('Bulk cleanup failed.');
    expect(screen.queryByRole('status', { name: 'Unpublishing all forms' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Unpublish all 2 published forms?' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Unpublish all' })).toBeEnabled();
    expect(screen.getByText('Software Requirements Specification')).toBeInTheDocument();
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

    const table = await screen.findByRole('table', { name: 'Submission forms' });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3));
    expect(within(table).getAllByRole('link', { name: /submission form$/ })).toHaveLength(2);
  });

  it('ignores a deliverable load that finishes after the user switches workspaces', async () => {
    let resolveOldWorkspace;
    formsClient.loadFormsState
      .mockReset()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOldWorkspace = resolve; }))
      .mockResolvedValueOnce({ ...createState(), deliverables: [{
        id: 'deliverable-code',
        slug: 'source-code',
        title: 'CS Source Code',
        shortTitle: 'Source Code',
        trackerColumn: 'SourceCode',
        dueAt: '2026-05-01T23:59:00+08:00',
        instructions: 'Submit the repository link.',
        status: 'Published',
        fields: [{ id: 'primaryLink', label: 'Submission Link', pdfRequired: false }]
      }] });

    const view = renderPage();
    await waitFor(() => expect(formsClient.loadFormsState).toHaveBeenCalledWith('workspace-it'));

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
    await act(async () => resolveOldWorkspace({ ...createState(), deliverables: [{
      ...createState().deliverables[0],
      title: 'Stale IT SRS'
    }] }));

    await waitFor(() => expect(screen.queryByText('Stale IT SRS')).not.toBeInTheDocument());
    expect(screen.getByText('CS Source Code')).toBeInTheDocument();
  });

});
