import { archiveResponses, getArchiveRecords } from './api.js';
import { emptyMonitoringState, loadMonitoringState } from './monitoringClient.js';

export function emptyArchiveState() {
  return { ...emptyMonitoringState(), archives: [], archiveStorage: { configured: false } };
}

export async function loadArchiveState(workspaceId) {
  const [monitoring, archives] = await Promise.all([
    loadMonitoringState(workspaceId),
    getArchiveRecords(workspaceId)
  ]);
  return {
    ...monitoring,
    archives: archives || [],
    archiveStorage: { configured: false }
  };
}

export async function archiveAttempts(workspaceId, responseIds) {
  const records = await archiveResponses(workspaceId, responseIds);
  return { ok: true, archived: records.length, records };
}
