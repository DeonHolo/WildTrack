import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultValidationStudyDeliverableId, loadValidationStudyEvidence } from './ValidationStudyClient.js';

describe('Validation Study client', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('prefers Refactored SRS without depending on a database id', () => {
    expect(defaultValidationStudyDeliverableId([
      { id: 'mvp-id', trackerColumnKey: 'MVP Validation', title: 'MVP Validation' },
      { id: 'runtime-srs-id', trackerColumnKey: 'Refactored SRS', title: 'Current SRS form' }
    ])).toBe('runtime-srs-id');
  });

  it('loads one selected deliverable evidence endpoint with session cookies', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      deliverableId: 'runtime-srs-id', responses: []
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(loadValidationStudyEvidence('workspace-1', 'runtime-srs-id'))
      .resolves.toEqual({ deliverableId: 'runtime-srs-id', responses: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/validation-study/evidence?workspaceId=workspace-1&deliverableId=runtime-srs-id',
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
  });
});
