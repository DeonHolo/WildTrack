import { afterEach, expect, it, vi } from 'vitest';
import { retryArchiveRecord, unarchiveRecord, verifyArchiveRecord } from './api.js';

afterEach(() => vi.unstubAllGlobals());

it('sends versioned archive actions to encoded workspace and record paths', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(), text: async () => '{}' });
  vi.stubGlobal('fetch', fetchMock);
  document.cookie = 'XSRF-TOKEN=test';
  await retryArchiveRecord('workspace 1', 'record/1', 4);
  await unarchiveRecord('workspace 1', 'record/1', 5);
  await verifyArchiveRecord('workspace 1', 'record/1');
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    '/api/archive/record%2F1/retry?workspaceId=workspace%201',
    '/api/archive/record%2F1/unarchive?workspaceId=workspace%201',
    '/api/archive/record%2F1/verify?workspaceId=workspace%201'
  ]);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ stateVersion: 4 });
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ stateVersion: 5 });
});
