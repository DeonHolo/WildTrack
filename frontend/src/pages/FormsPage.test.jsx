import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications, notifications } from '@mantine/notifications';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  saveDeliverable: vi.fn(),
  unpublishAllDeliverables: vi.fn(),
  unpublishDeliverable: vi.fn()
}));

const formsClient = vi.hoisted(() => ({ loadFormsState: vi.fn() }));

vi.mock('../app/WorkspaceSession.jsx', () => ({
  useWorkspaceSession: () => workspaceSession
}));

vi.mock('../lib/formsClient.js', () => ({
  emptyFormsState: () => ({ trackerColumns: [], deliverables: [], attempts: [] }),
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

  it('preserves one MVP Validation form with exactly five typed artifact fields', async () => {
    workflow.state.deliverables[0] = {
      ...workflow.state.deliverables[0],
      title: 'MVP Validation',
      shortTitle: 'MVP Validation',
      fields: mvpValidationFields()
    };
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit MVP Validation form' }));

    const dialog = screen.getByRole('dialog', { name: 'Edit MVP Validation form' });
    expect(within(dialog).getAllByRole('textbox', { name: 'Field label' })).toHaveLength(5);
    expect(within(dialog).getAllByRole('textbox', { name: 'Field type' })).toHaveLength(5);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(submissionClient.saveDeliverable).toHaveBeenCalledWith('workspace-it', expect.objectContaining({
      id: 'deliverable-srs',
      title: 'MVP Validation',
      fields: mvpValidationFields()
    })));
    const savedFields = submissionClient.saveDeliverable.mock.calls[0][1].fields;
    expect(savedFields.map(field => field.type)).toEqual(['googleForm', 'drive', 'googleSheet', 'drive', 'driveFolder']);
    expect(savedFields.filter(field => field.pdfRequired).map(field => field.definitionId)).toEqual(['field-framework', 'field-highlights']);
  });

  it('defaults newly added PDF fields to AI Review while preserving a saved disabled value', async () => {
    workflow.state.deliverables[0] = {
      ...workflow.state.deliverables[0],
      fields: [
        {
          id: 'savedPdf', definitionId: 'field-saved-pdf', label: 'Saved PDF', type: 'drive', required: true,
          pdfRequired: true, documentCheckPolicy: 'AUTO', aiReviewEnabled: false, active: true
        },
        {
          id: 'savedLink', definitionId: 'field-saved-link', label: 'Saved link', type: 'url', required: true,
          pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false, active: true
        }
      ]
    };
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit SRS form' }));

    const dialog = screen.getByRole('dialog', { name: 'Edit SRS form' });
    const savedAiReview = within(dialog).getByRole('checkbox', { name: 'Allow AI Review' });
    expect(savedAiReview).not.toBeChecked();
    expect(within(dialog).queryByRole('checkbox', { name: 'Allow Admin AI Review' })).not.toBeInTheDocument();

    const existingLinkCard = within(dialog).getAllByRole('textbox', { name: 'Field label' })[1].closest('.mantine-Paper-root');
    fireEvent.click(within(existingLinkCard).getByRole('textbox', { name: 'Field type' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Google Drive PDF' }));
    expect(within(existingLinkCard).getByRole('checkbox', { name: 'Allow AI Review' })).toBeChecked();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add field' }));
    const labels = within(dialog).getAllByRole('textbox', { name: 'Field label' });
    const newFieldCard = labels[2].closest('.mantine-Paper-root');
    const typeSelect = within(newFieldCard).getByRole('textbox', { name: 'Field type' });
    fireEvent.click(typeSelect);
    fireEvent.click(await screen.findByRole('option', { name: 'Google Drive PDF' }));

    expect(within(newFieldCard).getByRole('checkbox', { name: 'Allow AI Review' })).toBeChecked();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(submissionClient.saveDeliverable).toHaveBeenCalled());
    const savedFields = submissionClient.saveDeliverable.mock.calls[0][1].fields;
    expect(savedFields[0].aiReviewEnabled).toBe(false);
    expect(savedFields[1]).toEqual(expect.objectContaining({
      type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO', aiReviewEnabled: true
    }));
    expect(savedFields[2]).toEqual(expect.objectContaining({
      type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO', aiReviewEnabled: true
    }));
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

    expect(await screen.findByRole('alert', { name: 'Form error' })).toHaveTextContent('Server rejected the form update.');
    expect(screen.getByText('Software Requirements Specification')).toBeInTheDocument();
    expect(screen.queryByText('Rejected SRS Title')).not.toBeInTheDocument();
  });

  it('discards a private form failure after the signed-in account changes', async () => {
    let fail;
    submissionClient.saveDeliverable.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    const view = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit SRS form' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    workspaceSession.session = { authenticated: true, email: 'other@example.com' };
    view.rerender(<PageHarness />);
    await act(async () => { fail(new Error('Private previous account form failure')); });
    expect(screen.queryAllByText('Private previous account form failure')).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit SRS form' })).not.toBeInTheDocument());
  });

  it('creates the first unconfigured deliverable with an 11:59 PM deadline by default', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish form' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Publish form' }));

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
