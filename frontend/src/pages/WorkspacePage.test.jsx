import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { wildTrackTheme } from '../app/theme.js';
import { WorkspacePage } from './WorkspacePage.jsx';

const workflow = vi.hoisted(() => ({
  session: { authenticated: true, email: 'admin@school.edu' },
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

vi.mock('../app/WorkspaceSession.jsx', () => ({
  useWorkspaceSession: () => ({
    session: workflow.session,
    activeWorkspace: workflow.activeWorkspace,
    activeWorkspaceId: workflow.activeWorkspaceId,
    workspaces: workflow.workspaces,
    switchWorkspace: workflow.switchWorkspace,
    createWorkspace: workflow.createWorkspace,
    refreshWorkspaceCatalog: vi.fn()
  })
}));

vi.mock('../hooks/useWorkspaceResource.js', async () => {
  const { useState } = await import('react');
  return { useWorkspaceResource: () => {
    const [data, setData] = useState(() => workflow.state);
    return {
    data,
    setData,
    status: 'ready',
    error: '',
    reload: workflow.refreshBackendData
    };
  } };
});

vi.mock('../lib/workspaceAdminClient.js', () => ({
  emptyWorkspaceAdmin: () => ({}),
  loadWorkspaceAdmin: vi.fn(),
  importWorkspaceSheet: (_workspaceId, sourceType, payload) => workflow.connectSheetSource(sourceType, payload),
  publishSuggestedForms: (...args) => workflow.generateFormsFromSuggestions(...args),
  addTrackerColumn: (_workspaceId, column) => workflow.addTrackerColumn(column),
  updateTrackerColumn: (...args) => workflow.updateTrackerColumn(...args)
}));

vi.mock('../lib/submissionClient.js', () => ({
  saveSubmissionTemplate: (_workspaceId, template) => workflow.saveTemplate(template),
  removeSubmissionTemplate: (_workspaceId, templateId) => workflow.removeTemplate(templateId)
}));
vi.mock('../lib/api.js', () => ({
  getDriveConnectionStatus: vi.fn().mockResolvedValue({ configured: true, message: 'Google Drive connected.' }),
  getDocumentTemplateFileUrl: vi.fn(() => '/api/templates/template/file'),
  getStaffProfiles: vi.fn().mockResolvedValue([
    {
      id: 'staff-1',
      googleSubject: 'sub-admin',
      googleEmail: 'admin@school.edu',
      roles: ['ADMIN'],
      enabled: true,
      assignedTeams: []
    }
  ]),
  upsertStaffEmail: vi.fn(),
  assignAdviserTeam: vi.fn(),
  unassignAdviserTeam: vi.fn(),
  revokeStaffAccess: vi.fn()
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

// Exercise the real hook independently of the page's synchronous resource fixture.
const { useWorkspaceResource: useRealWorkspaceResource } = await vi.importActual('../hooks/useWorkspaceResource.js');
const makeEmpty = () => ({ rows: [] });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('workspace resource isolation', () => {
  beforeEach(() => { workflow.session = { authenticated: true, email: 'admin@school.edu' }; });

  it('lets the latest reload win and ignores an older rejection', async () => {
    const first = deferred(), second = deferred();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useRealWorkspaceResource('it', load, makeEmpty));
    let reload;
    act(() => { reload = result.current.reload(); });
    await act(async () => { second.resolve({ rows: ['new'] }); await reload; });
    await act(async () => { first.reject(new Error('old failure')); });
    expect(result.current).toMatchObject({ data: { rows: ['new'] }, status: 'ready', error: '' });
  });

  it.each(['workspace', 'account', 'logout'])('clears data and rejects old callbacks after a %s change', async (change) => {
    const pending = deferred();
    const load = vi.fn().mockResolvedValueOnce({ rows: ['private'] }).mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(({ id }) => useRealWorkspaceResource(id, load, makeEmpty), { initialProps: { id: 'it' } });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const previous = result.current;
    if (change === 'account') workflow.session = { authenticated: true, email: 'other@school.edu' };
    if (change === 'logout') workflow.session = { authenticated: false };
    rerender({ id: change === 'workspace' ? 'cs' : change === 'logout' ? '' : 'it' });
    expect(result.current.data).toEqual({ rows: [] });
    await act(async () => {
      previous.setData({ rows: ['stale mutation'] });
      expect(await previous.reload()).toBeNull();
    });
    expect(load).toHaveBeenCalledTimes(change === 'logout' ? 1 : 2);
    expect(result.current.data).toEqual({ rows: [] });
    if (change !== 'logout') {
      await act(async () => { pending.resolve({ rows: ['current'] }); });
      expect(result.current.data.rows).toEqual(['current']);
    } else expect(result.current.status).toBe('idle');
  });

  it('ignores pending results from the previous workspace and after unmount', async () => {
    const old = deferred(), current = deferred();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const { result, rerender, unmount } = renderHook(({ id }) => useRealWorkspaceResource(id, load, makeEmpty), { initialProps: { id: 'it' } });
    rerender({ id: 'cs' });
    await act(async () => { old.resolve({ rows: ['old'] }); });
    expect(result.current).toMatchObject({ data: { rows: [] }, status: 'loading' });
    const previous = result.current;
    unmount();
    await act(async () => {
      current.resolve({ rows: ['unmounted'] });
      previous.setData({ rows: ['late'] });
      expect(await previous.reload()).toBeNull();
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reports a current failure and recovers on retry', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue({ rows: ['recovered'] });
    const { result } = renderHook(() => useRealWorkspaceResource('it', load, makeEmpty));
    await waitFor(() => expect(result.current.error).toBe('Unavailable'));
    expect(result.current.status).toBe('error');
    await act(async () => { await result.current.reload(); });
    expect(result.current).toMatchObject({ data: { rows: ['recovered'] }, status: 'ready', error: '' });
  });
});

function renderPage(initialEntry = '/workspace', pageProps = {}) {
  return render(workspaceTree(initialEntry, pageProps));
}

function workspaceTree(initialEntry = '/workspace', pageProps = {}) {
  return (
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ModalsProvider>
        <MemoryRouter initialEntries={[initialEntry]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <WorkspacePage {...pageProps} />
        </MemoryRouter>
      </ModalsProvider>
    </MantineProvider>
  );
}

describe('workspace operations', () => {
  beforeEach(() => {
    workflow.activeWorkspaceId = 'workspace-it';
    workflow.session = { authenticated: true, email: 'admin@school.edu' };
    workflow.state = createState();
    Object.values(workflow).forEach((value) => value?.mockReset?.());
  });

  it.each(['workspace', 'account'])('discards a late import summary after the %s changes', async (changed) => {
    let finish;
    workflow.connectSheetSource.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const view = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Import Tracker' }));
    if (changed === 'workspace') workflow.activeWorkspaceId = 'workspace-cs';
    else workflow.session = { authenticated: true, email: 'other@school.edu' };
    view.rerender(workspaceTree());
    await act(async () => finish({ ok: true, state: createState(), importSummary: { sourceType: 'Tracker', suggestedForms: [], mappings: [] } }));
    expect(screen.queryByRole('dialog', { name: 'Tracker import summary' })).not.toBeInTheDocument();
    expect(screen.queryByText('Tracker imported.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import Tracker' })).toBeEnabled();
  });

  it('renders equal source controls with responsibilities and accurate state labels', () => {
    renderPage();
    const sources = screen.getByRole('table', { name: 'Workspace source sheets' });
    expect(within(sources).getByText('Team Formation')).toBeInTheDocument();
    expect(within(sources).getByText(/Student identities and team membership/)).toBeInTheDocument();
    expect(within(sources).getByText(/Progress, deliverables, and deadline row/)).toBeInTheDocument();
    expect(within(sources).getByText(/Project titles, advisers, and remarks/)).toBeInTheDocument();
    expect(within(sources).getByText('Imported').closest('.wt-status-indicator')).toHaveAttribute('data-tone', 'success');
    within(sources).getAllByText('Not connected').forEach((label) => {
      expect(label.closest('.wt-status-indicator')).toHaveAttribute('data-tone', 'neutral');
    });
    expect(within(sources).getAllByText('Import')).toHaveLength(3);
    expect(within(sources).getByRole('button', { name: 'Import Team Formation' })).toHaveClass('mantine-Button-root');
    expect(within(sources).getByRole('button', { name: 'Import Tracker' })).toHaveClass('mantine-Button-root');
    expect(within(sources).getByRole('button', { name: 'Import Project Monitor' })).toHaveClass('mantine-Button-root');
  });

  it('updates published sheet URL inputs without crashing when typing', () => {
    renderPage();
    const teamInput = screen.getByLabelText('Team Formation published Google Sheet link');
    fireEvent.change(teamInput, { target: { value: 'https://docs.google.com/spreadsheets/d/test-sheet-12345/edit' } });
    expect(teamInput).toHaveValue('https://docs.google.com/spreadsheets/d/test-sheet-12345/edit');
    expect(screen.getByText('Sheet ID: test-sheet-12345')).toBeInTheDocument();
  });

  it('shows source-specific mapping, missing, optional, unrecognized, skipped, and deadline details', async () => {
    workflow.connectSheetSource.mockResolvedValue({
      ok: true,
      state: createState(),
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

  it('keeps edits local until blur and saves the edited column to its workspace', async () => {
    workflow.updateTrackerColumn.mockImplementation(async (_id, column, updates) => ({ ...column, ...updates }));
    renderPage();
    const toggle = screen.getByRole('button', { name: /Deliverable columns/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.change(screen.getByLabelText('SRS display name'), { target: { value: 'Requirements' } });
    expect(workflow.updateTrackerColumn).not.toHaveBeenCalled();
    fireEvent.blur(screen.getByLabelText('Requirements display name'));
    await waitFor(() => expect(workflow.updateTrackerColumn).toHaveBeenCalledWith(
      'workspace-it', expect.objectContaining({ id: 'col-srs', label: 'Requirements' }), {}
    ));
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

  it('renders the Staff & Advisers section on the workspace setup page', async () => {
    renderPage();
    expect(screen.getByRole('region', { name: 'Staff and advisers' })).toBeInTheDocument();
    expect(await screen.findByText('admin@school.edu')).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
  });

  it('shows a visible backend sync alert naming the failed snapshot segments', () => {
    workflow.state.backendSync = {
      enabled: true,
      status: 'Backend sync incomplete: students (Roster service is down.), workspace sources (Failed to fetch).',
      lastError: 'Backend sync incomplete: students (Roster service is down.), workspace sources (Failed to fetch).',
      failedSegments: ['students', 'workspace sources']
    };
    renderPage();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('students (Roster service is down.)');
    expect(alert).toHaveTextContent('workspace sources (Failed to fetch)');
    expect(alert).toHaveClass('danger');
  });

  it('reports a failed Sheet import instead of claiming success', async () => {
    workflow.connectSheetSource.mockRejectedValue(new Error('Request failed with status 401'));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Import Tracker' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Request failed with status 401'));
    expect(screen.getByRole('status')).toHaveClass('danger');
  });

  it('stays quiet about backend sync when every segment loaded', () => {
    renderPage();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('highlights the exact source requested by an operational queue link', () => {
    renderPage('/workspace?source=tracker');

    const trackerRow = screen.getByText('Tracker').closest('tr');
    expect(trackerRow).toHaveAttribute('aria-current', 'true');
  });
});
