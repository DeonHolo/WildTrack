import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addAcademicDeliverableColumn, clearAcademicDataSnapshot, deleteAcademicRow, getAcademicDataSnapshot, loadAcademicData, saveAcademicRows } from './academicDataClient.js';

const api = vi.hoisted(() => ({ request: vi.fn(), createTrackerColumn: vi.fn() }));

vi.mock('./api.js', () => ({
  request: (...args) => api.request(...args),
  createTrackerColumn: (...args) => api.createTrackerColumn(...args)
}));

describe('Academic Data server operations and scoped snapshot', () => {
  beforeEach(() => {
    api.request.mockReset();
    api.createTrackerColumn.mockReset();
  });

  it('stores the latest server snapshot only for the authenticated account and workspace', async () => {
    const original = { students: [{ studentNumber: '26-0001' }] };
    api.request.mockResolvedValueOnce(original);
    await loadAcademicData('workspace-a', 'admin-a');
    expect(getAcademicDataSnapshot('workspace-a', 'admin-a')).toEqual(original);
    expect(getAcademicDataSnapshot('workspace-a', 'admin-b')).toBeNull();
    expect(getAcademicDataSnapshot('workspace-b', 'admin-a')).toBeNull();
    expect(getAcademicDataSnapshot('workspace-a')).toBeNull();

    const updated = { students: [{ studentNumber: '26-0002' }] };
    api.request.mockResolvedValueOnce(updated);
    await loadAcademicData('workspace-a', 'admin-a');
    expect(getAcademicDataSnapshot('workspace-a', 'admin-a')).toEqual(updated);
  });

  it('creates a real manual tracker column before an unsaved form row can appear', async () => {
    api.createTrackerColumn.mockResolvedValueOnce({ columnKey: 'MVP Validation', label: 'MVP Validation' });
    const created = await addAcademicDeliverableColumn('workspace-b', ' MVP Validation ', true, [
      { columnKey: 'SRS' }, { columnKey: 'SDD' }
    ]);
    expect(created).toEqual({ columnKey: 'MVP Validation', label: 'MVP Validation' });
    expect(api.createTrackerColumn).toHaveBeenCalledWith('workspace-b', {
      columnKey: 'MVP Validation', label: 'MVP Validation', sourceColumn: 'MVP Validation',
      sourceColumnIndex: 2, displayOrder: 2, active: true, pdfRequired: true
    });
    await expect(addAcademicDeliverableColumn('workspace-b', 'srs', true, [{ columnKey: 'SRS' }]))
      .rejects.toThrow('already exists');
    expect(api.createTrackerColumn).toHaveBeenCalledTimes(1);
  });

  it('invalidates saved snapshots after an actual row update', async () => {
    api.request.mockResolvedValueOnce({ students: [{ studentNumber: '26-0003' }] });
    await loadAcademicData('workspace-c', 'admin-c');
    api.request.mockResolvedValueOnce([]);
    await saveAcademicRows('workspace-c', 'students', [{ studentNumber: '26-0004' }]);
    expect(api.request).toHaveBeenLastCalledWith('/academic-data/students?workspaceId=workspace-c', {
      method: 'PUT', body: { rows: [{ studentNumber: '26-0004' }] }
    });
    expect(getAcademicDataSnapshot('workspace-c', 'admin-c')).toBeNull();
  });

  it('deletes a saved row by stable id and optimistic version and invalidates its cached dataset', async () => {
    api.request.mockResolvedValueOnce({ students: [{ id: 'row-1' }] });
    await loadAcademicData('workspace-delete', 'admin-delete');
    api.request.mockResolvedValueOnce({});
    await deleteAcademicRow('workspace-delete', 'students', 'row-1', '2026-09-22T12:00:00');
    expect(api.request).toHaveBeenLastCalledWith('/academic-data/students/row-1?workspaceId=workspace-delete', {
      method: 'DELETE', body: { expectedUpdatedAt: '2026-09-22T12:00:00' }
    });
    expect(getAcademicDataSnapshot('workspace-delete', 'admin-delete')).toBeNull();
    await expect(deleteAcademicRow('workspace-delete', 'unknown', 'row-1', 'date')).rejects.toThrow('Unknown academic data grid');
    await expect(deleteAcademicRow('workspace-delete', 'students', null, null)).rejects.toThrow('Reload this row');
  });

  it('does not allow a delayed older refresh to overwrite a newer snapshot after a save', async () => {
    let resolveStale;
    api.request.mockImplementationOnce(() => new Promise((resolve) => { resolveStale = resolve; }));
    const stale = loadAcademicData('workspace-race', 'admin-race');
    api.request.mockResolvedValueOnce([]);
    await saveAcademicRows('workspace-race', 'students', [{ studentNumber: '26-1000' }]);
    const fresh = { students: [{ studentNumber: '26-1000' }] };
    api.request.mockResolvedValueOnce(fresh);
    await loadAcademicData('workspace-race', 'admin-race');
    resolveStale({ students: [{ studentNumber: '26-0001' }] });
    await stale;
    expect(getAcademicDataSnapshot('workspace-race', 'admin-race')).toEqual(fresh);
  });

  it('clearing a scoped snapshot invalidates its outstanding refresh without touching a different account', async () => {
    let resolveStale;
    api.request.mockResolvedValueOnce({ students: [{ studentNumber: '26-2000' }] });
    await loadAcademicData('workspace-revoked', 'admin-other');
    api.request.mockImplementationOnce(() => new Promise((resolve) => { resolveStale = resolve; }));
    const stale = loadAcademicData('workspace-revoked', 'admin-revoked');
    clearAcademicDataSnapshot('workspace-revoked', 'admin-revoked');
    resolveStale({ students: [{ studentNumber: '26-0001' }] });
    await stale;
    expect(getAcademicDataSnapshot('workspace-revoked', 'admin-revoked')).toBeNull();
    expect(getAcademicDataSnapshot('workspace-revoked', 'admin-other')).toEqual({
      students: [{ studentNumber: '26-2000' }]
    });
  });
});
