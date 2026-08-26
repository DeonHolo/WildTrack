import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { FormsPage } from './FormsPage.jsx';

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
  publishDeliverable: vi.fn(),
  removeDeliverable: vi.fn(),
  generateFormsFromSuggestions: vi.fn()
}));

vi.mock('../app/WorkflowContext.jsx', () => ({
  useWorkflow: () => workflow
}));

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

function renderPage() {
  return render(
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

describe('forms management', () => {
  beforeEach(() => {
    workflow.state = createState();
    Object.values(workflow).forEach((value) => value?.mockReset?.());
  });

  it('renders scalable rows with an opening link and a separate accessible copy action', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderPage();

    const table = screen.getByRole('table', { name: 'Published submission forms' });
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

  it('edits an existing form in a prefilled dialog and preserves its identity in the payload', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Edit SRS form' }));

    const dialog = screen.getByRole('dialog', { name: 'Edit SRS form' });
    const title = within(dialog).getByRole('textbox', { name: 'Form title' });
    expect(title).toHaveValue('Software Requirements Specification');
    fireEvent.change(title, { target: { value: 'Revised SRS Submission' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(workflow.publishDeliverable).toHaveBeenCalledWith(expect.objectContaining({
      id: 'deliverable-srs',
      slug: 'week-9-srs',
      title: 'Revised SRS Submission'
    }));
  });

  it('creates the first unconfigured deliverable with an 11:59 PM deadline by default', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Publish form' }));

    const dialog = screen.getByRole('dialog', { name: 'Publish a form' });
    expect(within(dialog).getByRole('textbox', { name: /Deliverable/ })).toHaveValue('Source Code');
    expect(within(dialog).getByLabelText('Due date')).not.toHaveValue('');
    expect(within(dialog).getByLabelText('Due time')).toHaveValue('23:59');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish form' }));

    expect(workflow.publishDeliverable).toHaveBeenCalledWith(expect.objectContaining({
      id: '',
      trackerColumn: 'SourceCode',
      dueAt: expect.stringMatching(/T23:59:00\+08:00$/)
    }));
  });

  it('unpublishes only the selected form after explaining that responses remain', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish SRS form' }));

    const confirmation = await screen.findByRole('dialog', { name: 'Unpublish SRS?' });
    expect(confirmation).toHaveTextContent('1 existing response will remain recorded');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Unpublish form' }));

    expect(workflow.removeDeliverable).toHaveBeenCalledOnce();
    expect(workflow.removeDeliverable).toHaveBeenCalledWith('deliverable-srs');
  });

  it('shows one row per real deliverable when saved state still holds duplicate copies', () => {
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

    const table = screen.getByRole('table', { name: 'Published submission forms' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getAllByRole('link', { name: /submission form$/ })).toHaveLength(2);
  });

});
