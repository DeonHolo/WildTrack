import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { WorkspacePage } from './WorkspacePage.jsx';

const workflow = vi.hoisted(() => ({
  activeWorkspace: { id: 'workspace-it', name: 'IT Capstone - IT332', program: 'IT', courseCode: 'IT332', semester: 'Semester 2', academicYear: '2025-26' },
  activeWorkspaceId: 'workspace-it',
  workspaces: [
    { id: 'workspace-it', name: 'IT Capstone - IT332', program: 'IT', courseCode: 'IT332', semester: 'Semester 2', academicYear: '2025-26' },
    { id: 'workspace-cs', name: 'CS Capstone', program: 'CS', courseCode: 'CS', semester: 'Semester 2', academicYear: '2025-26' }
  ],
  state: null,
  switchWorkspace: vi.fn(),
  createWorkspace: vi.fn(),
  connectSheetSource: vi.fn(),
  generateFormsFromSuggestions: vi.fn(),
  refreshBackendData: vi.fn(),
  reset: vi.fn(),
  updateTrackerColumn: vi.fn(),
  addTrackerColumn: vi.fn(),
  saveTemplate: vi.fn(),
  removeTemplate: vi.fn()
}));

vi.mock('../app/WorkflowContext.jsx', () => ({ useWorkflow: () => workflow }));
vi.mock('../lib/api.js', () => ({
  getDriveConnectionStatus: vi.fn().mockResolvedValue({ configured: true, message: 'Google Drive connected.' }),
  getDocumentTemplateFileUrl: vi.fn(() => '/api/templates/template/file')
}));

function createState() {
  return {
    classRecord: {
      name: 'IT Capstone - IT332',
      trackerSheet: 'IT332 Tracker',
      status: 'Starter data',
      sources: {
        teamFormation: { status: 'Not connected', sheetUrl: '' },
        tracker: { status: 'Imported', sheetUrl: 'https://docs.google.com/spreadsheets/d/tracker' },
        projectMonitor: { status: 'Not connected', sheetUrl: '' }
      },
      pendingFormSuggestions: [],
      importWarnings: []
    },
    students: [{ studentNumber: '23-0001-001' }],
    projectMetadata: [],
    attempts: [],
    archives: [],
    backendSync: {},
    trackerColumns: [
      { id: 'col-srs', key: 'SRS', label: 'SRS', sourceColumn: 'SRS', active: true, pdfRequired: true },
      { id: 'col-sdd', key: 'SDD', label: 'SDD', sourceColumn: 'SDD', active: true, pdfRequired: true }
    ],
    deliverables: [],
    templates: []
  };
}

function renderPage() {
  return render(
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ModalsProvider><WorkspacePage /></ModalsProvider>
    </MantineProvider>
  );
}

describe('workspace operations', () => {
  beforeEach(() => {
    workflow.state = createState();
    Object.values(workflow).forEach((value) => value?.mockReset?.());
  });

  it('renders equal source controls with responsibilities and accurate state labels', () => {
    renderPage();
    const sources = screen.getByRole('table', { name: 'Workspace source sheets' });
    expect(within(sources).getByText('Team Formation')).toBeInTheDocument();
    expect(within(sources).getByText(/Student identities and team membership/)).toBeInTheDocument();
    expect(within(sources).getByText(/Progress, deliverables, and deadline row/)).toBeInTheDocument();
    expect(within(sources).getByText(/Project titles, advisers, and remarks/)).toBeInTheDocument();
    expect(within(sources).getByText('Imported')).toBeInTheDocument();
    expect(within(sources).getAllByText('Not connected')).toHaveLength(2);
  });

  it('shows source-specific mapping, missing, optional, unrecognized, skipped, and deadline details', async () => {
    workflow.connectSheetSource.mockResolvedValue({
      ok: true,
      importSummary: {
        sourceType: 'Tracker',
        resultStatus: 'Imported with warnings',
        headers: ['NAME OF STUDENT', 'TEAM FORMATION', 'SRS', 'Mystery'],
        mappings: [
          { key: 'studentName', label: 'Student name', sourceColumn: 'NAME OF STUDENT', required: true },
          { key: 'teamCode', label: 'Team code', sourceColumn: 'TEAM FORMATION', required: true }
        ],
        detectedFields: ['Student Name', 'Team Code', '1 deliverable column'],
        missingFields: [],
        optionalFields: ['Student Number'],
        unrecognizedFields: ['Mystery'],
        skippedRows: [{ rowNumber: 4, reason: 'No student identity' }],
        deadlineRows: [{ rowNumber: 10, suggestions: [] }],
        metrics: { studentRows: 2 },
        suggestedForms: [],
        warnings: []
      }
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Import Tracker' }));

    const dialog = await screen.findByRole('dialog', { name: 'Tracker import summary' });
    expect(within(dialog).getByText('Field mapping')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Student name source column')).toHaveValue('NAME OF STUDENT');
    expect(within(dialog).getByText('Student Number')).toBeInTheDocument();
    const unrecognized = within(dialog).getByText('Unrecognized columns').parentElement;
    expect(within(unrecognized).getByText('Mystery')).toBeInTheDocument();
    expect(within(dialog).getByText(/Row 4/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Row 10/)).toBeInTheDocument();
  });

  it('keeps deliverable columns collapsible and editable', () => {
    renderPage();
    const toggle = screen.getByRole('button', { name: /Deliverable columns/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.change(screen.getByLabelText('SRS display name'), { target: { value: 'Requirements' } });
    expect(workflow.updateTrackerColumn).toHaveBeenCalledWith('col-srs', { label: 'Requirements' });
  });

  it('adds uploaded or Drive-linked templates from a focused dialog', async () => {
    workflow.saveTemplate.mockResolvedValue({ ok: true, template: { name: 'SRS official template' } });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add official template' }));
    const dialog = await screen.findByRole('form', { name: 'Add official template' });

    const file = new File(['template'], 'SRS Official Template.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    fireEvent.change(within(dialog).getByLabelText('Template file'), { target: { files: [file] } });
    expect(within(dialog).getByLabelText('Template name')).toHaveValue('SRS Official Template');

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Google Drive link' }));
    fireEvent.change(within(dialog).getByLabelText('Template name'), { target: { value: '' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Google Drive link' }), { target: { value: 'https://drive.google.com/file/d/template-id/view' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(workflow.saveTemplate).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: 'drive',
      name: '',
      driveUrl: 'https://drive.google.com/file/d/template-id/view'
    })));
  });

  it('keeps a replacement attached to its original deliverable', async () => {
    workflow.state.templates = [{
      id: 'template-srs',
      deliverable: 'SRS',
      name: 'SRS official template',
      originalFilename: 'srs.docx'
    }];
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    const dialog = await screen.findByRole('form', { name: 'Replace official template' });
    expect(within(dialog).getByLabelText('Template deliverable')).toHaveValue('SRS');
    expect(within(dialog).getByLabelText('Template deliverable')).toBeDisabled();
  });

  it('names the active workspace and requires RESET before restoring only that workspace', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Restore starter data' }));
    const dialog = screen.getByRole('dialog', { name: 'Restore IT Capstone - IT332 starter data?' });
    expect(within(dialog).getByText(/Only IT Capstone - IT332/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Restore starter data' });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Type RESET to continue'), { target: { value: 'RESET' } });
    fireEvent.click(confirm);
    expect(workflow.reset).toHaveBeenCalledOnce();
  });
});
