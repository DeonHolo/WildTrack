import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getStaffMonitoring: vi.fn()
}));

vi.mock('./api.js', () => ({
  createTrackerColumn: vi.fn(),
  getStaffMonitoring: api.getStaffMonitoring,
  getTemplates: vi.fn(),
  getWorkspaceSources: vi.fn(),
  importSheetSource: vi.fn(),
  updateTrackerColumn: vi.fn()
}));

vi.mock('./submissionClient.js', () => ({
  saveDeliverable: vi.fn()
}));

import { loadWorkspaceArchiveReadiness } from './workspaceAdminClient.js';

describe('workspace archive readiness', () => {
  beforeEach(() => api.getStaffMonitoring.mockReset());

  it('counts only current archived responses and published forms as closeout blockers', async () => {
    api.getStaffMonitoring.mockResolvedValue({
      responses: [
        { id: 'response-1', updatedAt: '2026-09-01T01:00:00Z' },
        { id: 'response-2', updatedAt: '2026-09-02T01:00:00Z' },
        { id: 'response-3', updatedAt: '2026-09-03T01:00:00Z' }
      ],
      archivedResponseIds: ['response-1', 'response-3'],
      reviewStates: {
        'response-1': { acceptance: { sourceResponseUpdatedAt: '2026-09-01T01:00:00Z' } },
        'response-2': { acceptance: { sourceResponseUpdatedAt: '2026-09-01T01:00:00Z' } },
        'response-3': { acceptance: { sourceResponseUpdatedAt: '2026-09-03T01:00:00Z' } }
      },
      deliverables: [
        { id: 'form-1', status: 'PUBLISHED' },
        { id: 'form-2', status: 'UNPUBLISHED' },
        { id: 'form-3', status: 'PUBLISHED' }
      ]
    });

    await expect(loadWorkspaceArchiveReadiness('workspace-it')).resolves.toEqual({
      responseCount: 3,
      archivedResponseCount: 2,
      unarchivedResponseCount: 1,
      unacceptedResponseCount: 1,
      acceptedUnarchivedResponseCount: 0,
      deliverableCount: 3,
      publishedFormCount: 2,
      ready: false
    });
    expect(api.getStaffMonitoring).toHaveBeenCalledWith('workspace-it', true);
  });

  it('is ready when every current response is archived and no form is published', async () => {
    api.getStaffMonitoring.mockResolvedValue({
      responses: [{ id: 'response-1', updatedAt: '2026-09-01T01:00:00Z' }],
      archivedResponseIds: ['response-1'],
      reviewStates: {
        'response-1': { acceptance: { sourceResponseUpdatedAt: '2026-09-01T01:00:00Z' } }
      },
      deliverables: [{ id: 'form-1', status: 'UNPUBLISHED' }]
    });

    await expect(loadWorkspaceArchiveReadiness('workspace-it')).resolves.toMatchObject({
      unarchivedResponseCount: 0,
      unacceptedResponseCount: 0,
      acceptedUnarchivedResponseCount: 0,
      publishedFormCount: 0,
      ready: true
    });
  });
});
