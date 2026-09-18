import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getStaffMonitoring: vi.fn()
}));
const submission = vi.hoisted(() => ({ saveDeliverable: vi.fn() }));

vi.mock('./api.js', () => ({
  createTrackerColumn: vi.fn(),
  getStaffMonitoring: api.getStaffMonitoring,
  getTemplates: vi.fn(),
  getWorkspaceSources: vi.fn(),
  importSheetSource: vi.fn(),
  updateTrackerColumn: vi.fn()
}));

vi.mock('./submissionClient.js', () => ({
  saveDeliverable: submission.saveDeliverable
}));

import { loadWorkspaceArchiveReadiness, publishSuggestedForms } from './workspaceAdminClient.js';

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

describe('workspace form suggestions', () => {
  beforeEach(() => submission.saveDeliverable.mockReset().mockImplementation(async (_workspaceId, payload) => payload));

  it('updates source deadline suggestions without replacing customized fields or publication state', async () => {
    const existing = {
      id: 'form-srs',
      slug: 'stable-srs',
      title: 'Customized SRS title',
      trackerColumn: 'SRS',
      dueAt: '2026-09-20T23:59:00+08:00',
      status: 'Published',
      updatedAt: '2026-09-19T01:00:00',
      instructions: 'Custom instructions',
      fields: [
        { id: 'summary', definitionId: 'field-summary', label: 'My custom question', type: 'shortText', active: true },
        {
          id: 'savedPdf', definitionId: 'field-pdf', label: 'Saved PDF', type: 'drive', active: true,
          required: true, pdfRequired: true, documentCheckPolicy: 'OFF', aiReviewEnabled: false
        }
      ],
      retiredFields: [{ id: 'old', definitionId: 'field-old', label: 'Old question', type: 'shortText', active: false }]
    };
    const state = {
      trackerColumns: [{ key: 'SRS', label: 'SRS' }],
      deliverables: [existing]
    };

    await publishSuggestedForms('workspace-it', state, [{
      trackerColumn: 'SRS', title: 'Generated SRS', dueAt: '2026-09-30T23:59', pdfRequired: true
    }]);

    expect(submission.saveDeliverable).toHaveBeenCalledWith('workspace-it', expect.objectContaining({
      id: 'form-srs',
      slug: 'stable-srs',
      title: 'Customized SRS title',
      dueAt: '2026-09-20T23:59:00+08:00',
      status: 'Published',
      instructions: 'Custom instructions',
      expectedUpdatedAt: '2026-09-19T01:00:00',
      fields: [existing.fields[0], existing.fields[1], existing.retiredFields[0]]
    }));
  });

  it('uses standard PDF checking and AI Review defaults only for a new suggested PDF form', async () => {
    const state = {
      trackerColumns: [{ key: 'SRS', label: 'SRS' }],
      deliverables: []
    };

    await publishSuggestedForms('workspace-it', state, [{
      trackerColumn: 'SRS', title: 'Generated SRS', dueAt: '2026-09-30T23:59', pdfRequired: true
    }]);

    expect(submission.saveDeliverable).toHaveBeenCalledWith('workspace-it', expect.objectContaining({
      status: 'Unpublished',
      fields: [expect.objectContaining({
        id: 'documentPdf',
        type: 'drive',
        required: true,
        pdfRequired: true,
        documentCheckPolicy: 'AUTO',
        aiReviewEnabled: true
      })]
    }));
  });
});
