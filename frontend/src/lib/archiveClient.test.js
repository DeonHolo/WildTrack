import { beforeEach, expect, it, vi } from 'vitest';
const api=vi.hoisted(() => ({ archiveResponses: vi.fn(), getArchiveRecords: vi.fn(), getArchiveStorage: vi.fn(), getLatestArchiveBatch: vi.fn() }));
const monitoring=vi.hoisted(() => ({ emptyMonitoringState: () => ({}), loadMonitoringState: vi.fn() }));
vi.mock('./api.js', () => api);
vi.mock('./monitoringClient.js', () => monitoring);
import { archiveAttempts, loadArchiveState } from './archiveClient.js';
beforeEach(() => vi.clearAllMocks());
it('counts queued copies separately from completed archives', async () => {
  api.archiveResponses.mockResolvedValue([
    { captureState: 'QUEUED', lifecycleState: 'Archived' },
    { captureState: 'COPYING', lifecycleState: 'Archived' },
    { captureState: 'COMPLETE', lifecycleState: 'Archived' },
    { captureState: 'COMPLETE', lifecycleState: 'Active' }
  ]);
  expect(await archiveAttempts('workspace', ['response'])).toMatchObject({ ok: true, archived: 1, queued: 2 });
  expect(api.archiveResponses).toHaveBeenCalledWith('workspace', ['response']);
});

it('restores the server archive job together with saved records when returning to the page', async () => {
  monitoring.loadMonitoringState.mockResolvedValue({ attempts: [{ id: 'response' }] });
  api.getArchiveRecords.mockResolvedValue([{ id: 'record', captureState: 'COPYING' }]);
  api.getArchiveStorage.mockResolvedValue({ ready: true });
  api.getLatestArchiveBatch.mockResolvedValue({ id: 'job', state: 'CHECKING', items: [] });
  expect(await loadArchiveState('workspace')).toMatchObject({
    attempts: [{ id: 'response' }], archives: [{ id: 'record', captureState: 'COPYING' }],
    archiveBatch: { id: 'job', state: 'CHECKING' }
  });
  expect(api.getLatestArchiveBatch).toHaveBeenCalledWith('workspace');
  expect(api.archiveResponses).not.toHaveBeenCalled();
});
