import { beforeEach, expect, it, vi } from 'vitest';
const api=vi.hoisted(() => ({ archiveResponses: vi.fn(), getArchiveRecords: vi.fn(), getArchiveStorage: vi.fn() }));
vi.mock('./api.js', () => api);
vi.mock('./monitoringClient.js', () => ({ emptyMonitoringState: () => ({}), loadMonitoringState: vi.fn() }));
import { archiveAttempts } from './archiveClient.js';
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
