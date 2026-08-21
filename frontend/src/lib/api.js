const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080/api').replace(/\/+$/, '');

const SOURCE_TYPE_TO_API = {
  teamFormation: 'TEAM_FORMATION',
  tracker: 'TRACKER',
  projectMonitor: 'PROJECT_MONITOR'
};

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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    },
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
    headers: {
      Accept: 'application/json',
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
