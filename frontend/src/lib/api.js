const API_BASE_URL = '/api';

const SOURCE_TYPE_TO_API = {
  teamFormation: 'TEAM_FORMATION',
  tracker: 'TRACKER',
  projectMonitor: 'PROJECT_MONITOR'
};

const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'X-XSRF-TOKEN';

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

function readCookie(name) {
  const match = document.cookie.split('; ').find((row) => row.startsWith(name + '='));
  return match ? decodeURIComponent(match.substring(name.length + 1)) : null;
}

function csrfHeader() {
  const token = readCookie(CSRF_COOKIE);
  return token ? { [CSRF_HEADER]: token } : {};
}

function ensureCsrfToken() {
  if (!readCookie(CSRF_COOKIE)) {
    // Trigger the backend to set the CSRF cookie via a lightweight GET.
    return fetch(API_BASE_URL + '/auth/session', { credentials: 'include' }).catch(() => {});
  }
  return Promise.resolve();
}

export async function authenticateGoogle(credential) {
  await ensureCsrfToken();
  return request('/auth/google/session', {
    method: 'POST',
    body: { credential },
    skipCsrfPrecheck: true
  });
}

export async function getCurrentSession() {
  return request('/auth/session');
}

export async function logout() {
  return request('/auth/logout', { method: 'POST' });
}

export async function getWorkspaces() {
  return request('/workspaces');
}

export async function createWorkspace(payload) {
  return request('/workspaces', {
    method: 'POST',
    body: payload
  });
}

export async function getPublicSubmissionForm(workspaceKey, slug) {
  return request(`/public/forms/${encodeURIComponent(workspaceKey)}/${encodeURIComponent(slug)}`, {
    skipCsrfPrecheck: true
  });
}

export async function getDeliverables(workspaceId) {
  return request(withWorkspace('/deliverables', workspaceId));
}

export function toApiSourceType(sourceType) {
  return SOURCE_TYPE_TO_API[sourceType] || sourceType;
}

export async function getBackendHealth() {
  return request('/health');
}

export async function importSheetSource(sourceType, payload, workspaceId) {
  return request(withWorkspace(`/sheets/import/${toApiSourceType(sourceType)}`, workspaceId), {
    method: 'POST',
    body: {
      sheetUrl: payload.sheetUrl,
      displayName: payload.displayName || payload.trackerSheet || payload.name || '',
      mappingOverrides: payload.mappingOverrides || {}
    }
  });
}

const SNAPSHOT_SEGMENTS = [
  { segment: 'students', label: 'students', path: '/students' },
  { segment: 'projects', label: 'projects', path: '/projects' },
  { segment: 'trackerColumns', label: 'tracker columns', path: '/tracker/columns' },
  { segment: 'trackerRows', label: 'tracker rows', path: '/tracker/rows' },
  { segment: 'deliverables', label: 'deliverables', path: '/deliverables' },
  { segment: 'templates', label: 'templates', path: '/templates' },
  { segment: 'sources', label: 'workspace sources', path: '/workspace/sources' },
  { segment: 'staffResponses', label: 'workspace responses', path: '/workspace/responses/my-team' }
];

export function describeSnapshotFailures(failures = []) {
  if (!failures.length) return '';
  const detail = failures
    .map((failure) => `${failure.label || failure.segment}${failure.message ? ` (${failure.message})` : ''}`)
    .join(', ');
  return `Backend sync incomplete: ${detail}.`;
}

export async function getBackendSnapshot(workspaceId) {
  const scoped = (path) => withWorkspace(path, workspaceId);
  const failures = [];
  const results = await Promise.all(SNAPSHOT_SEGMENTS.map(async ({ segment, label, path }) => {
    try {
      return [segment, await request(scoped(path))];
    } catch (error) {
      failures.push({
        segment,
        label,
        status: error?.status ?? 0,
        message: error?.message || 'Request failed.'
      });
      return [segment, []];
    }
  }));

  const snapshot = Object.fromEntries(results);
  const orderedFailures = SNAPSHOT_SEGMENTS
    .map(({ segment }) => failures.find((failure) => failure.segment === segment))
    .filter(Boolean);

  return {
    ...snapshot,
    failures: orderedFailures,
    failureMessage: describeSnapshotFailures(orderedFailures)
  };
}

export async function saveBackendDeliverable(workspaceId, payload) {
  const dueAtIso = String(payload.dueAt || '').replace(/[+-]\d\d:\d\d$|Z$/i, '');
  const path = payload.id ? `/deliverables/${encodeURIComponent(payload.id)}` : '/deliverables';
  return request(withWorkspace(path, workspaceId), {
    method: payload.id ? 'PUT' : 'POST',
    body: {
      trackerColumnKey: payload.trackerColumn || payload.shortTitle || payload.trackerColumnKey,
      title: payload.title || payload.shortTitle,
      slug: payload.slug,
      instructions: payload.instructions || '',
      dueAt: dueAtIso.length === 16 ? `${dueAtIso}:00` : dueAtIso || '2026-04-18T23:59:00',
      pdfRequired: Boolean(payload.pdfRequired || payload.fields?.some((f) => f.pdfRequired || f.type === 'drive')),
      status: String(payload.status || 'PUBLISHED').toUpperCase()
    }
  });
}

export async function getDriveConnectionStatus() {
  return request('/file-checks/status');
}

export async function runDocumentCheck(workspaceId, payload) {
  return request(withWorkspace('/file-checks', workspaceId), {
    method: 'POST',
    body: payload
  });
}

export async function uploadDocumentTemplate(workspaceId, payload) {
  const formData = new FormData();
  formData.append('deliverableKey', payload.deliverableKey);
  formData.append('displayName', payload.displayName);
  formData.append('file', payload.file);
  return requestForm(withWorkspace('/templates', workspaceId), {
    method: 'POST',
    body: formData
  });
}

export async function uploadDriveDocumentTemplate(workspaceId, payload) {
  return request(withWorkspace('/templates/from-drive', workspaceId), {
    method: 'POST',
    body: {
      deliverableKey: payload.deliverableKey,
      displayName: payload.displayName,
      driveUrl: payload.driveUrl
    }
  });
}

export function getDocumentTemplateFileUrl(workspaceId, templateId) {
  return `${API_BASE_URL}${withWorkspace(`/templates/${templateId}/file`, workspaceId)}`;
}

export async function deleteDocumentTemplate(workspaceId, templateId) {
  return requestForm(withWorkspace(`/templates/${templateId}`, workspaceId), {
    method: 'DELETE'
  });
}

export async function writeTrackerValue(workspaceId, payload) {
  return request(withWorkspace('/tracker/writebacks', workspaceId), {
    method: 'POST',
    body: payload
  });
}

function withWorkspace(path, workspaceId) {
  if (!workspaceId) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}workspaceId=${encodeURIComponent(workspaceId)}`;
}

export async function request(path, options = {}) {
  const mutating = options.method && options.method !== 'GET';
  if (mutating && !options.skipCsrfPrecheck) {
    await ensureCsrfToken();
  }
  const headers = {
    Accept: 'application/json',
    ...(mutating && !options.skipCsrfPrecheck ? csrfHeader() : {}),
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    credentials: 'include',
    mode: 'same-origin',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    const text = await response.text().catch(() => '');
    if (text) {
      try {
        const error = JSON.parse(text);
        message = error.error || error.message || message;
      } catch {
        message = text;
      }
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function requestForm(path, options = {}) {
  const mutating = options.method && options.method !== 'GET';
  if (mutating && !options.skipCsrfPrecheck) {
    await ensureCsrfToken();
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    credentials: 'include',
    mode: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(mutating && !options.skipCsrfPrecheck ? csrfHeader() : {}),
      ...(options.headers || {})
    },
    body: options.body
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    const text = await response.text().catch(() => '');
    if (text) {
      try {
        const error = JSON.parse(text);
        message = error.error || error.message || message;
      } catch {
        message = text;
      }
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return null;
  return response.json();
}

export async function getMyAssociation(workspaceId) {
  return request(`/workspace/students/me?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export async function getRosterOptions(workspaceId) {
  return request(`/workspace/students/options?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export async function confirmStudentAssociation(workspaceId, studentNumber) {
  await ensureCsrfToken();
  return request(`/workspace/students/associate?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: 'POST',
    body: { studentNumber }
  });
}

export async function disconnectStudentAssociation(workspaceId) {
  await ensureCsrfToken();
  return request(`/workspace/students/associate?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: 'DELETE'
  });
}

export async function getMyResponse(workspaceId, deliverableId) {
  return request(`/workspace/responses/mine?workspaceId=${encodeURIComponent(workspaceId)}&deliverableId=${encodeURIComponent(deliverableId)}`);
}

export async function submitResponse(workspaceId, deliverableId, values) {
  await ensureCsrfToken();
  const response = await fetch(`${API_BASE_URL}/workspace/responses/submit?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: 'POST',
    credentials: 'include',
    mode: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...csrfHeader()
    },
    body: JSON.stringify({ deliverableId, valuesJson: JSON.stringify(values) })
  });
  if (response.status === 409) {
    return { conflict: true };
  }
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const error = await response.json();
      message = error.error || error.message || message;
    } catch {}
    throw new ApiError(message, response.status);
  }
  return response.json();
}

export async function getResponseHistory(workspaceId, deliverableId) {
  return request(`/workspace/responses/${encodeURIComponent(deliverableId)}/history?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export async function saveDraft(workspaceId, deliverableId, values, revision) {
  const response = await fetch(`${API_BASE_URL}/workspace/drafts/save?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: 'POST',
    credentials: 'include',
    mode: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...csrfHeader()
    },
    body: JSON.stringify({ deliverableId, valuesJson: JSON.stringify(values), revision: revision ?? null })
  });
  if (response.status === 409) return { conflict: true };
  if (!response.ok) throw new ApiError(`Draft could not be saved (${response.status})`, response.status);
  return response.json();
}

export async function getDraft(workspaceId, deliverableId) {
  return request(`/workspace/drafts?workspaceId=${encodeURIComponent(workspaceId)}&deliverableId=${encodeURIComponent(deliverableId)}`);
}

export async function clearDraft(workspaceId, deliverableId) {
  await ensureCsrfToken();
  return request(`/workspace/drafts?workspaceId=${encodeURIComponent(workspaceId)}&deliverableId=${encodeURIComponent(deliverableId)}`, {
    method: 'DELETE'
  });
}

export async function getIdentityConflicts(workspaceId) {
  return request(`/workspace/students/identity-conflicts?workspaceId=${encodeURIComponent(workspaceId)}`);
}

/** Admin-only: records RESOLVED or DISMISSED for one identity conflict. */
export async function decideIdentityConflict(workspaceId, conflictId, decision, note) {
  await ensureCsrfToken();
  return request(
    `/workspace/students/identity-conflicts/${encodeURIComponent(conflictId)}/decision?workspaceId=${encodeURIComponent(workspaceId)}`,
    { method: 'POST', body: note ? { decision, note } : { decision } }
  );
}

export async function selectCanonicalResponse(workspaceId, payload) {
  await ensureCsrfToken();
  return request(`/workspace/responses/canonical/select?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: 'POST',
    body: payload
  });
}

export async function getStaffProfiles(workspaceId) {
  return request(`/workspace/staff?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export async function upsertStaffEmail(workspaceId, googleEmail, roles) {
  await ensureCsrfToken();
  return request(`/workspace/staff?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: 'POST',
    body: { googleEmail, roles }
  });
}

export async function assignAdviserTeam(workspaceId, googleSubject, teamCode) {
  await ensureCsrfToken();
  return request(`/workspace/staff/assignments?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: 'POST',
    body: { googleSubject, teamCode }
  });
}

export async function unassignAdviserTeam(workspaceId, googleSubject, teamCode) {
  await ensureCsrfToken();
  return request(`/workspace/staff/assignments?workspaceId=${encodeURIComponent(workspaceId)}&googleSubject=${encodeURIComponent(googleSubject)}&teamCode=${encodeURIComponent(teamCode)}`, {
    method: 'DELETE'
  });
}

export async function revokeStaffAccess(workspaceId, googleSubject) {
  await ensureCsrfToken();
  return request(`/workspace/staff/${encodeURIComponent(googleSubject)}?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: 'DELETE'
  });
}
