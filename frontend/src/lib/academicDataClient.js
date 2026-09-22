import { createTrackerColumn, request } from './api.js';

const snapshots = new Map();
const snapshotVersions = new Map();

function cacheKey(workspaceId, cacheScope) {
  return workspaceId && cacheScope ? `${cacheScope}\u0000${workspaceId}` : null;
}

export function getAcademicDataSnapshot(workspaceId, cacheScope) {
  const key = cacheKey(workspaceId, cacheScope);
  return key ? snapshots.get(key) || null : null;
}

export function clearAcademicDataSnapshot(workspaceId, cacheScope) {
  const key = cacheKey(workspaceId, cacheScope);
  if (key) invalidateSnapshot(key);
}

export async function loadAcademicData(workspaceId, cacheScope) {
  const key = cacheKey(workspaceId, cacheScope);
  const version = key ? (snapshotVersions.get(key) || 0) + 1 : null;
  if (key) snapshotVersions.set(key, version);
  const snapshot = await request(`/academic-data?workspaceId=${encodeURIComponent(workspaceId)}`);
  // Older refreshes must not replace the snapshot fetched after a save or
  // tracker-column creation, even when their responses arrive out of order.
  if (key && snapshotVersions.get(key) === version) snapshots.set(key, snapshot);
  return snapshot;
}

function invalidateSnapshot(key) {
  snapshots.delete(key);
  snapshotVersions.set(key, (snapshotVersions.get(key) || 0) + 1);
}

function invalidateWorkspace(workspaceId) {
  for (const key of snapshotVersions.keys()) {
    if (key.endsWith(`\u0000${workspaceId}`)) invalidateSnapshot(key);
  }
}

export async function saveAcademicRows(workspaceId, kind, rows) {
  if (!['students', 'projects', 'deliverables'].includes(kind)) {
    throw new Error('Unknown academic data grid.');
  }
  const saved = await request(`/academic-data/${kind}?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: 'PUT',
    body: { rows }
  });
  invalidateWorkspace(workspaceId);
  return saved;
}

export async function deleteAcademicRow(workspaceId, kind, rowId, expectedUpdatedAt) {
  if (!['students', 'projects', 'deliverables'].includes(kind)) {
    throw new Error('Unknown academic data grid.');
  }
  if (!rowId || !expectedUpdatedAt) {
    throw new Error('Reload this row before deleting it.');
  }
  const result = await request(`/academic-data/${kind}/${encodeURIComponent(rowId)}?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: 'DELETE',
    body: { expectedUpdatedAt }
  });
  invalidateWorkspace(workspaceId);
  return result;
}

export async function addAcademicDeliverableColumn(workspaceId, label, pdfRequired, currentColumns = []) {
  const clean = String(label || '').trim();
  if (!clean) throw new Error('Enter a deliverable name.');
  if (currentColumns.some((column) => String(column.columnKey).trim().toLowerCase() === clean.toLowerCase())) {
    throw new Error('A tracker column with this name already exists.');
  }
  const nextOrder = currentColumns.length;
  const created = await createTrackerColumn(workspaceId, {
    columnKey: clean,
    label: clean,
    sourceColumn: clean,
    sourceColumnIndex: nextOrder,
    displayOrder: nextOrder,
    active: true,
    pdfRequired: Boolean(pdfRequired)
  });
  invalidateWorkspace(workspaceId);
  return created;
}
