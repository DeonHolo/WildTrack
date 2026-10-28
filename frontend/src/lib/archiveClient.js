import { archiveResponses, getArchiveRecords, getArchiveStorage } from './api.js';
import { emptyMonitoringState, loadMonitoringState } from './monitoringClient.js';

export function emptyArchiveState() {
  return { ...emptyMonitoringState(), archives: [], archiveStorage: { configured: false, ready: false } };
}

export async function loadArchiveState(workspaceId) {
  const [monitoring, archives, archiveStorage] = await Promise.all([
    loadMonitoringState(workspaceId),
    getArchiveRecords(workspaceId),
    getArchiveStorage().catch(() => ({ configured: false, ready: false, message: 'Storage status could not be loaded.' }))
  ]);
  return {
    ...monitoring,
    archives: archives || [],
    archiveStorage
  };
}

export async function archiveAttempts(workspaceId, responseIds) {
  const records = await archiveResponses(workspaceId, responseIds);
  return {
    ok: true,
    archived: records.filter(record => record.captureState === 'COMPLETE' && record.lifecycleState === 'Archived').length,
    queued: records.filter(record => ['QUEUED', 'COPYING'].includes(record.captureState)).length,
    records
  };
}
