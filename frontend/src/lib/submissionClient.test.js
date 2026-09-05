import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSubmissionDraft,
  commitSubmission,
  confirmSubmissionAssociation,
  describeSubmissionError,
  listDeliverables,
  loadSubmissionState,
  openPublicSubmission,
  removeSubmissionTemplate,
  saveDeliverable,
  saveSubmissionDraft,
  saveSubmissionTemplate,
  unpublishDeliverable
} from './submissionClient.js';

const api = vi.hoisted(() => ({
  clearDraft: vi.fn(),
  confirmStudentAssociation: vi.fn(),
  deleteDocumentTemplate: vi.fn(),
  getDeliverables: vi.fn(),
  getDraft: vi.fn(),
  getMyAssociation: vi.fn(),
  getMyResponse: vi.fn(),
  getPublicSubmissionForm: vi.fn(),
  saveBackendDeliverable: vi.fn(),
  saveDraft: vi.fn(),
  submitResponse: vi.fn(),
  uploadDocumentTemplate: vi.fn(),
  uploadDriveDocumentTemplate: vi.fn()
}));

vi.mock('./api.js', () => api);

describe('SubmissionClient deliverables', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
  });

  it('loads server deliverables in the form-facing shape', async () => {
    api.getDeliverables.mockResolvedValue([{
      id: 'deliverable-1',
      trackerColumnKey: 'SRS',
      title: 'SRS Submission',
      slug: 'srs',
      dueAt: '2026-09-30T23:59:00',
      status: 'PUBLISHED',
      instructions: 'Submit the SRS.',
      pdfRequired: true
    }]);

    await expect(listDeliverables('workspace-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'deliverable-1',
        shortTitle: 'SRS',
        trackerColumn: 'SRS',
        status: 'Published',
        fields: [expect.objectContaining({ id: 'documentPdf', pdfRequired: true })]
      })
    ]);
  });

  it('returns the authoritative server result after saving', async () => {
    api.saveBackendDeliverable.mockResolvedValue({
      id: 'deliverable-1',
      trackerColumnKey: 'SRS',
      title: 'Updated SRS',
      slug: 'srs',
      dueAt: '2026-09-30T23:59:00',
      status: 'PUBLISHED',
      instructions: 'Updated.',
      pdfRequired: false
    });

    const saved = await saveDeliverable('workspace-1', { id: 'deliverable-1', title: 'Updated SRS' });

    expect(api.saveBackendDeliverable).toHaveBeenCalledWith('workspace-1', expect.objectContaining({ id: 'deliverable-1' }));
    expect(saved).toEqual(expect.objectContaining({ id: 'deliverable-1', title: 'Updated SRS', status: 'Published' }));
  });

  it('unpublishes through the server instead of changing only local state', async () => {
    api.saveBackendDeliverable.mockResolvedValue({
      id: 'deliverable-1',
      trackerColumnKey: 'SRS',
      title: 'SRS',
      slug: 'srs',
      dueAt: '2026-09-30T23:59:00',
      status: 'UNPUBLISHED',
      instructions: '',
      pdfRequired: false
    });

    const saved = await unpublishDeliverable('workspace-1', { id: 'deliverable-1', trackerColumn: 'SRS', title: 'SRS', slug: 'srs' });

    expect(api.saveBackendDeliverable).toHaveBeenCalledWith('workspace-1', expect.objectContaining({ status: 'Unpublished' }));
    expect(saved.status).toBe('Unpublished');
  });

  it('keeps template mutations behind the same focused server boundary', async () => {
    api.uploadDriveDocumentTemplate.mockResolvedValue({ id: 'template-1' });
    api.deleteDocumentTemplate.mockResolvedValue(undefined);

    await expect(saveSubmissionTemplate('workspace-1', {
      sourceType: 'drive',
      deliverable: 'SRS',
      name: 'SRS Template',
      driveUrl: 'https://drive.google.com/file/d/template/view'
    })).resolves.toEqual({ id: 'template-1' });
    expect(api.uploadDriveDocumentTemplate).toHaveBeenCalledWith('workspace-1', {
      deliverableKey: 'SRS',
      displayName: 'SRS Template',
      driveUrl: 'https://drive.google.com/file/d/template/view'
    });

    await removeSubmissionTemplate('workspace-1', 'template-1');
    expect(api.deleteDocumentTemplate).toHaveBeenCalledWith('workspace-1', 'template-1');
  });
});

describe('SubmissionClient intake', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
  });

  it('opens a public form using only the public server contract', async () => {
    api.getPublicSubmissionForm.mockResolvedValue({
      workspace: { id: 'workspace-1', name: 'IT Capstone' },
      deliverable: {
        id: 'deliverable-1',
        trackerColumnKey: 'SRS',
        title: 'SRS Submission',
        slug: 'srs',
        dueAt: '2026-09-30T23:59:00',
        status: 'PUBLISHED',
        instructions: 'Submit the SRS.',
        pdfRequired: true
      }
    });

    await expect(openPublicSubmission('it-it332', 'srs')).resolves.toEqual({
      workspace: expect.objectContaining({ id: 'workspace-1' }),
      deliverable: expect.objectContaining({ id: 'deliverable-1', status: 'Published' })
    });
  });

  it('loads association, draft, and existing response together from the server', async () => {
    api.getMyAssociation.mockResolvedValue({ studentNumber: '22-1001-001', studentName: 'Juan', teamCode: 'IT-01' });
    api.getDraft.mockResolvedValue({ present: true, values: { documentPdf: 'draft-link' }, revision: 4 });
    api.getMyResponse.mockResolvedValue({ id: 'response-1', valuesJson: '{"documentPdf":"submitted-link"}', revision: 2 });

    const state = await loadSubmissionState('workspace-1', 'deliverable-1');

    expect(state.association.studentNumber).toBe('22-1001-001');
    expect(state.draft).toEqual(expect.objectContaining({ revision: 4, values: { documentPdf: 'draft-link' } }));
    expect(state.response).toEqual(expect.objectContaining({ id: 'response-1', values: { documentPdf: 'submitted-link' } }));
  });

  it('preserves stale draft and submission conflicts from the backend', async () => {
    api.saveDraft.mockResolvedValue({ conflict: true });
    api.submitResponse.mockResolvedValue({ conflict: true });

    await expect(saveSubmissionDraft('workspace-1', 'deliverable-1', { primaryLink: 'https://example.test' }, 3))
      .resolves.toEqual({ conflict: true });
    await expect(commitSubmission('workspace-1', 'deliverable-1', { primaryLink: 'https://example.test' }))
      .resolves.toEqual({ conflict: true });
  });

  it('clears the server draft only through the draft endpoint', async () => {
    api.clearDraft.mockResolvedValue(undefined);

    await clearSubmissionDraft('workspace-1', 'deliverable-1');

    expect(api.clearDraft).toHaveBeenCalledWith('workspace-1', 'deliverable-1');
  });

  it('confirms the selected class-record identity through the server association seam', async () => {
    api.confirmStudentAssociation.mockResolvedValue({ studentNumber: '22-1001-001' });

    await expect(confirmSubmissionAssociation('workspace-1', '22-1001-001'))
      .resolves.toEqual({ studentNumber: '22-1001-001' });
    expect(api.confirmStudentAssociation).toHaveBeenCalledWith('workspace-1', '22-1001-001');
  });

  it('normalizes session and authorization errors for the form surface', () => {
    expect(describeSubmissionError({ status: 401 })).toContain('session expired');
    expect(describeSubmissionError({ status: 403 })).toContain('not allowed');
    expect(describeSubmissionError({ status: 404 })).toContain('no longer available');
    expect(describeSubmissionError(new Error('Network unavailable.'))).toBe('Network unavailable.');
  });
});
