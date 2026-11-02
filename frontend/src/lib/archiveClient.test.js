import { beforeEach, expect, it, vi } from 'vitest';
const api=vi.hoisted(() => ({ archiveResponses: vi.fn(), getArchiveRecords: vi.fn(), getArchiveStorage: vi.fn(), prepareArchiveResponses: vi.fn() }));
const checks = vi.hoisted(() => ({ runDocumentCheck: vi.fn() }));
vi.mock('./api.js', () => api);
vi.mock('./reviewDeskClient.js', () => checks);
vi.mock('./monitoringClient.js', () => ({ emptyMonitoringState: () => ({}), loadMonitoringState: vi.fn() }));
import { archiveAttempts, prepareArchiveAttempts } from './archiveClient.js';
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

it('checks each submitted PDF, keeps non-PDF links as metadata, and continues past inaccessible files', async () => {
  const fields = [{ id: 'pdf', type: 'drive', pdfRequired: true, required: true }, { id: 'sheet', type: 'googlesheet' }];
  const deliverables = [{ id: 'deliverable', fields }];
  const responses = ['blocked', 'ready'].map(id => ({ id, deliverableId: 'deliverable', values: { pdf: 'https://drive.google.com/file/d/' + id + '/view' } }));
  checks.runDocumentCheck.mockResolvedValueOnce({ ok: true, report: { status: 'BLOCKED', summary: 'Drive HTTP 404' } })
    .mockResolvedValueOnce({ ok: true, report: { status: 'COMPLETED', document: { readable: true } } });
  api.prepareArchiveResponses.mockResolvedValue([{ responseId: 'ready', ready: true, pdfCount: 1 }]);
  const results = await prepareArchiveAttempts('workspace', responses, deliverables);
  expect(results).toEqual([{ responseId: 'blocked', ready: false, message: 'Drive HTTP 404' }, { responseId: 'ready', ready: true, pdfCount: 1 }]);
  expect(checks.runDocumentCheck).toHaveBeenCalledTimes(2);
  expect(api.prepareArchiveResponses).toHaveBeenCalledTimes(1);
  expect(api.prepareArchiveResponses).toHaveBeenCalledWith('workspace', ['ready']);
  expect(api.archiveResponses).not.toHaveBeenCalled();
});

it('stops preparing unstarted responses after closing the summary', async () => {
  await prepareArchiveAttempts('workspace', [{ id: 'first' }], [], { shouldContinue: () => false });
  expect(checks.runDocumentCheck).not.toHaveBeenCalled();
  expect(api.prepareArchiveResponses).not.toHaveBeenCalled();
});
