import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowProvider, useWorkflow } from './WorkflowContext.jsx';
import { seedWorkspaces } from '../lib/seedData.js';
import { getWorkspacePublicKey } from '../lib/workflow.js';
import { browserStorageKeys } from '../lib/browserStorage.js';

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
      <span data-testid="session-authenticated">{String(Boolean(workflow.session?.authenticated))}</span>
      <span data-testid="active-account">{workflow.state.activeAccountEmail || ''}</span>
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

describe('student workspace selection', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.values(api).forEach((mock) => mock.mockReset());
    api.getCurrentSession.mockResolvedValue({ authenticated: true, roles: [] });
    api.getWorkspaces.mockResolvedValue(seedWorkspaces);
    api.getBackendSnapshot.mockResolvedValue(emptySnapshot());
    api.logout.mockResolvedValue(undefined);
  });

  it('does not treat the initial fallback workspace as an explicit choice', async () => {
    renderProvider();
    await waitFor(() => expect(captured.workspaceCatalogStatus).toBe('ready'));
    expect(captured.needsWorkspaceChoice).toBe(true);
    expect(localStorage.getItem(browserStorageKeys.activeWorkspace)).toBeNull();
    await act(async () => { await captured.switchWorkspace(seedWorkspaces[0].id); });
    expect(captured.needsWorkspaceChoice).toBe(false);
    expect(localStorage.getItem(browserStorageKeys.activeWorkspace)).toBe(seedWorkspaces[0].id);
  });

  it('restores a remembered workspace on the next visit', async () => {
    localStorage.setItem(browserStorageKeys.activeWorkspace, seedWorkspaces[1].id);
    renderProvider();
    await waitFor(() => expect(captured.workspaceCatalogStatus).toBe('ready'));
    expect(captured.activeWorkspaceId).toBe(seedWorkspaces[1].id);
    expect(captured.needsWorkspaceChoice).toBe(false);
  });

  it('selects the sole workspace automatically', async () => {
    api.getWorkspaces.mockResolvedValue([seedWorkspaces[1]]);
    renderProvider();
    await waitFor(() => expect(captured.workspaceCatalogStatus).toBe('ready'));
    expect(captured.activeWorkspaceId).toBe(seedWorkspaces[1].id);
    expect(captured.needsWorkspaceChoice).toBe(false);
    expect(localStorage.getItem(browserStorageKeys.activeWorkspace)).toBe(seedWorkspaces[1].id);
  });

  it('asks again when the remembered workspace was removed', async () => {
    localStorage.setItem(browserStorageKeys.activeWorkspace, seedWorkspaces[0].id);
    api.getWorkspaces.mockResolvedValue([seedWorkspaces[1], { id: 'new-workspace', name: 'New class' }]);
    renderProvider();
    await waitFor(() => expect(captured.workspaceCatalogStatus).toBe('ready'));
    expect(captured.needsWorkspaceChoice).toBe(true);
  });

  it('preserves the signed-in account and clears the previous student claim when switching', async () => {
    renderProvider();
    await waitFor(() => expect(captured.workspaceCatalogStatus).toBe('ready'));
    await act(async () => {
      captured.authenticateGoogleAccount({ email: 'student@example.edu', subject: 'google-student' });
    });
    await act(async () => { await captured.switchWorkspace(seedWorkspaces[1].id); });
    expect(captured.state.activeAccountEmail).toBe('student@example.edu');
    expect(captured.state.studentAccounts[0].googleSubject).toBe('google-student');
    expect(captured.state.activeStudentNumber).toBe('');
    expect(captured.state.workspaceId).toBe(seedWorkspaces[1].id);
    expect(api.getBackendSnapshot).toHaveBeenLastCalledWith(seedWorkspaces[1].id);
  });

  it('keeps a form-link workspace through sign-in even when another workspace has a matching roster email', async () => {
    localStorage.setItem(browserStorageKeys.workspacePrefix + seedWorkspaces[0].id, JSON.stringify({
      workspaceId: seedWorkspaces[0].id,
      students: [{ studentNumber: '123', name: 'Student', email: 'student@example.edu' }]
    }));
    renderProvider();
    await waitFor(() => expect(captured.workspaceCatalogStatus).toBe('ready'));
    await act(async () => { await captured.switchWorkspace(getWorkspacePublicKey(seedWorkspaces[1])); });
    await act(async () => {
      captured.authenticateGoogleAccount({ email: 'student@example.edu', subject: 'google-student' });
    });
    expect(captured.activeWorkspaceId).toBe(seedWorkspaces[1].id);
    expect(captured.needsWorkspaceChoice).toBe(false);
  });

  it('reloads the workspace catalog after anonymous access fails and the student signs in', async () => {
    api.getCurrentSession.mockResolvedValue({ authenticated: false, roles: [] });
    api.getWorkspaces.mockRejectedValueOnce(new Error('Sign in required.'));
    renderProvider();
    await waitFor(() => expect(captured.workspaceCatalogStatus).toBe('error'));
    api.getCurrentSession.mockResolvedValue({ authenticated: true, roles: [] });
    await act(async () => { await captured.refreshSession(); });
    await waitFor(() => expect(captured.workspaceCatalogStatus).toBe('ready'));
    expect(captured.workspaces).toEqual(seedWorkspaces);
  });

  it('does not show seed workspaces when the server catalog is empty', async () => {
    api.getWorkspaces.mockResolvedValue([]);
    renderProvider();
    await waitFor(() => expect(captured.workspaceCatalogStatus).toBe('ready'));
    expect(captured.workspaces).toEqual([]);
    expect(captured.activeWorkspaceId).toBeNull();
  });
});

describe('backend failure visibility', () => {
  beforeEach(() => {
    localStorage.clear();
    captured = null;
    Object.values(api).forEach((mock) => mock.mockReset());
    api.getCurrentSession.mockResolvedValue({ authenticated: false, roles: [] });
    api.getWorkspaces.mockResolvedValue(seedWorkspaces);
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

describe('staff sign-out', () => {
  beforeEach(() => {
    localStorage.clear();
    captured = null;
    Object.values(api).forEach((mock) => mock.mockReset());
    api.getWorkspaces.mockResolvedValue(seedWorkspaces);
    api.getBackendSnapshot.mockResolvedValue(emptySnapshot());
    api.logout.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '' }));
  });

  it('ends the backend session and clears client session state', async () => {
    api.getCurrentSession.mockResolvedValue({ authenticated: true, email: 'ralph@example.edu', roles: ['ADMIN'] });
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('session-authenticated').textContent).toBe('true'));

    const result = await captured.logoutStaffSession();

    expect(result.ok).toBe(true);
    expect(api.logout).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByTestId('session-authenticated').textContent).toBe('false'));
    expect(screen.getByTestId('active-account').textContent).toBe('');
  });

  it('still clears the client session when the backend logout call fails', async () => {
    api.getCurrentSession.mockResolvedValue({ authenticated: true, email: 'ralph@example.edu', roles: ['ADMIN'] });
    api.logout.mockRejectedValue(Object.assign(new Error('Request failed with status 503'), { status: 503 }));
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('session-authenticated').textContent).toBe('true'));

    const result = await captured.logoutStaffSession();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('503');
    await waitFor(() => expect(screen.getByTestId('session-authenticated').textContent).toBe('false'));
  });
});
