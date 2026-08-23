const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080/api').replace(/\/+$/, '');

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

export async function getBackendSnapshot(workspaceId) {
  const scoped = (path) => withWorkspace(path, workspaceId);
  const [students, projects, trackerColumns, trackerRows, deliverables, templates] = await Promise.all([
    request(scoped('/students')),
    request(scoped('/projects')),
    request(scoped('/tracker/columns')),
    request(scoped('/tracker/rows')),
    request(scoped('/deliverables')),
    request(scoped('/templates'))
  ]);

  return {
    students,
    projects,
    trackerColumns,
    trackerRows,
    deliverables,
    templates
  };
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
  const headers = {
    Accept: 'application/json',
    ...(mutating && !options.skipCsrfPrecheck ? csrfHeader() : {}),
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    credentials: 'include',
    mode: 'cors',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const error = await response.json();
      message = error.error || error.message || message;
    } catch {
      const text = await response.text();
      if (text) message = text;
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function requestForm(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    credentials: 'include',
    mode: 'cors',
    headers: {
      Accept: 'application/json',
      ...(options.method !== 'GET' ? csrfHeader() : {}),
      ...(options.headers || {})
    },
    body: options.body
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const error = await response.json();
      message = error.error || error.message || message;
    } catch {
      const text = await response.text();
      if (text) message = text;
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
    mode: 'cors',
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
