import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getStaffMonitoring: vi.fn(),
  getTemplates: vi.fn(),
  getWorkspaceSources: vi.fn(),
  previewSheetImportSource: vi.fn(),
  applySheetImportPreview: vi.fn()
}));
const submission = vi.hoisted(() => ({ saveDeliverable: vi.fn() }));

vi.mock('./api.js', () => ({
  createTrackerColumn: vi.fn(),
  applySheetImportPreview: api.applySheetImportPreview,
  getStaffMonitoring: api.getStaffMonitoring,
  getTemplates: api.getTemplates,
  getWorkspaceSources: api.getWorkspaceSources,
  importSheetSource: vi.fn(),
  previewSheetImportSource: api.previewSheetImportSource,
  updateTrackerColumn: vi.fn()
}));

vi.mock('./submissionClient.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, saveDeliverable: submission.saveDeliverable };
});

import {
  applyWorkspaceSheetPreview,
  loadWorkspaceArchiveReadiness,
  previewWorkspaceSheet,
  publishSuggestedForms
} from './workspaceAdminClient.js';

describe('workspace re-import reconciliation client', () => {
  beforeEach(() => {
    api.previewSheetImportSource.mockReset();
    api.applySheetImportPreview.mockReset();
    api.getStaffMonitoring.mockReset().mockResolvedValue({
      students: [], projects: [], trackerColumns: [], trackerRows: [], deliverables: [], responses: [], reviewStates: {}, fileChecks: {}
    });
    api.getTemplates.mockReset().mockResolvedValue([]);
    api.getWorkspaceSources.mockReset().mockResolvedValue([]);
  });

  it('returns the read-only preview with a stable UI source label', async () => {
    api.previewSheetImportSource.mockResolvedValue({ previewId: 'preview-1', changes: [] });
    await expect(previewWorkspaceSheet('workspace-it', 'tracker', { sheetUrl: 'https://docs.google.com/test' }))
      .resolves.toMatchObject({ previewId: 'preview-1', sourceKey: 'tracker', sourceLabel: 'Tracker' });
    expect(api.previewSheetImportSource).toHaveBeenCalledWith(
      'tracker',
      { sheetUrl: 'https://docs.google.com/test' },
      'workspace-it'
    );
  });

  it('applies exactly the preview id and explicit conflict resolutions before reloading workspace data', async () => {
    api.applySheetImportPreview.mockResolvedValue({
      studentsFound: 1,
      officialIdsFound: 1,
      groupsFound: 0,
      columnsFound: 2,
      warnings: [],
      deadlineSuggestions: [],
      details: { metrics: { students: 1 }, detectedFields: ['Student Number'], missingFields: [], deadlineRows: 0 }
    });
    const result = await applyWorkspaceSheetPreview('workspace-it', 'teamFormation', 'preview-1', {
      'student:one:studentName': 'LOCAL'
    });
    expect(api.applySheetImportPreview).toHaveBeenCalledWith(
      'teamFormation',
      'preview-1',
      { 'student:one:studentName': 'LOCAL' },
      'workspace-it'
    );
    expect(result).toMatchObject({ ok: true, importSummary: { sourceType: 'Team Formation', studentsFound: 1 } });
    expect(api.getStaffMonitoring).toHaveBeenCalledWith('workspace-it');
  });
});

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
