import { request } from './api.js';

export function loadAcademicData(workspaceId) {
  return request(`/academic-data?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export function saveAcademicRows(workspaceId, kind, rows) {
  if (!['students', 'projects', 'deliverables'].includes(kind)) {
    throw new Error('Unknown academic data grid.');
  }
  return request(`/academic-data/${kind}?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: 'PUT',
    body: { rows }
  });
}
