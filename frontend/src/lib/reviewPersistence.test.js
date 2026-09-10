import { afterEach, expect, it, vi } from 'vitest';
import { loadReviewDesk } from './reviewDeskClient.js';
import { loadMonitoringState } from './monitoringClient.js';
import { loadArchiveState } from './archiveClient.js';

afterEach(() => vi.restoreAllMocks());

it('restores current archived status in review, monitoring and archive after reload, but not for an older version', async () => {
  const updatedAt = '2026-09-07T01:00:00Z';
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const path = new URL(url, 'http://localhost').pathname;
    let body;
    if (path === '/api/monitoring') body = {
      responses: ['current', 'edited'].map(id => ({ id, updatedAt, valuesJson: '{}' })),
      archivedResponseIds: ['current'],
      reviewStates: {
        current: { acceptance: { sourceResponseUpdatedAt: updatedAt }, feedback: [] },
        edited: { acceptance: null, feedback: [] }
      },
      allTeams: true
    };
    else if (path === '/api/archive') body = [{ attemptId: 'current' }, { attemptId: 'edited' }];
    else if (path.endsWith('/review-state')) body = { acceptance: { sourceResponseUpdatedAt: updatedAt }, feedback: [] };
    else if (path.startsWith('/api/file-checks/')) return new Response('{}', { status: 404 });
    else throw new Error(`Unexpected request: ${path}`);
    return Response.json(body);
  });
  for (const load of [loadReviewDesk, loadMonitoringState, loadArchiveState]) {
    const state = await load('workspace');
    expect(state.attempts.map(item => [item.id, item.archiveStatus])).toEqual([
      ['current', 'Archived'], ['edited', 'Not Archived']
    ]);
  }
});
