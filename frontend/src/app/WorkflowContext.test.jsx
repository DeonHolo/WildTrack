import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowProvider, useWorkflow } from './WorkflowContext.jsx';

const api = vi.hoisted(() => ({
  getBackendSnapshot: vi.fn(),
  importSheetSource: vi.fn(),
  getCurrentSession: vi.fn(),
  getWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  deleteDocumentTemplate: vi.fn(),
  logout: vi.fn(),
  runDocumentCheck: vi.fn(),
  saveBackendDeliverable: vi.fn(),
  uploadDocumentTemplate: vi.fn(),
  uploadDriveDocumentTemplate: vi.fn(),
  writeTrackerValue: vi.fn()
}));

vi.mock('../lib/api.js', () => ({
  ...api,
  getApiBaseUrl: () => '/api',
  describeSnapshotFailures: (failures = []) => (
    failures.length
      ? `Backend sync incomplete: ${failures.map((failure) => `${failure.label || failure.segment} (${failure.message})`).join(', ')}.`
      : ''
  )
}));

function emptySnapshot(failures = []) {
  return {
    students: [],
    projects: [],
    trackerColumns: [],
    trackerRows: [],
    deliverables: [],
    templates: [],
    sources: [],
    staffResponses: [],
    failures
  };
}

let captured = null;

function Probe() {
  const workflow = useWorkflow();
  captured = workflow;
  return (
    <div>
      <span data-testid="sync-status">{workflow.state.backendSync?.status || ''}</span>
      <span data-testid="sync-error">{workflow.state.backendSync?.lastError || ''}</span>
      <span data-testid="tracker-status">{workflow.state.classRecord?.sources?.tracker?.status || ''}</span>
    </div>
  );
}

function renderProvider(props = {}) {
  return render(
    <WorkflowProvider {...props}>
      <Probe />
    </WorkflowProvider>
  );
}

describe('backend failure visibility', () => {
  beforeEach(() => {
    localStorage.clear();
    captured = null;
    Object.values(api).forEach((mock) => mock.mockReset());
    api.getCurrentSession.mockResolvedValue({ authenticated: false, roles: [] });
    api.getWorkspaces.mockResolvedValue([]);
    api.getBackendSnapshot.mockResolvedValue(emptySnapshot());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => 'NAME OF STUDENT,TEAM FORMATION,MEMBER#\nDOE JANE,IT-01,1' }));
  });

  it('surfaces a partial snapshot as a visible backend-sync error naming the failed segment', async () => {
    api.getBackendSnapshot.mockResolvedValue(emptySnapshot([
      { segment: 'students', label: 'students', status: 503, message: 'Roster service is down.' }
    ]));
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('sync-error').textContent).toContain('students (Roster service is down.)'));
    expect(screen.getByTestId('sync-status').textContent).toContain('Backend sync incomplete');

    const result = await captured.refreshBackendData();
    expect(result.ok).toBe(false);
    expect(result.partial).toBe(true);
    expect(result.error).toContain('students');
  });

  it('keeps the normal loaded status when every snapshot segment succeeds', async () => {
    renderProvider();

    const result = await captured.refreshBackendData();
    expect(result.ok).toBe(true);
    await waitFor(() => expect(screen.getByTestId('sync-status').textContent).toBe('Backend data loaded.'));
    expect(screen.getByTestId('sync-error').textContent).toBe('');
  });

  it('does not fall back to a browser-only Sheet import when the backend import fails in production', async () => {
    api.importSheetSource.mockRejectedValue(Object.assign(new Error('Request failed with status 401'), { status: 401 }));
    renderProvider({ allowLocalImportFallback: false });
    await waitFor(() => expect(captured).not.toBeNull());

    const result = await captured.connectSheetSource('tracker', {
      name: 'IT Capstone',
      trackerSheet: 'IT332 Tracker',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-id/edit'
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Request failed with status 401');
    await waitFor(() => expect(screen.getByTestId('sync-error').textContent).toContain('Request failed with status 401'));
    expect(screen.getByTestId('sync-status').textContent).toContain('Tracker import failed');
    expect(screen.getByTestId('tracker-status').textContent).not.toBe('Imported');
  });

  it('reports a successful backend Sheet import through the visible status', async () => {
    api.importSheetSource.mockResolvedValue({ warnings: [], deadlineSuggestions: [], details: {} });
    renderProvider({ allowLocalImportFallback: false });
    await waitFor(() => expect(captured).not.toBeNull());

    const result = await captured.connectSheetSource('tracker', {
      name: 'IT Capstone',
      trackerSheet: 'IT332 Tracker',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-id/edit'
    });

    expect(result.ok).toBe(true);
    await waitFor(() => expect(screen.getByTestId('sync-status').textContent).toBe('Tracker imported through backend.'));
    expect(screen.getByTestId('sync-error').textContent).toBe('');
  });
});
