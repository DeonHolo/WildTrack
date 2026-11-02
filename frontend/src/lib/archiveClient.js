import { archiveResponses, getArchiveRecords, getArchiveStorage, getLatestArchiveBatch } from './api.js';
import { emptyMonitoringState, loadMonitoringState } from './monitoringClient.js';

export function emptyArchiveState() {
  return { ...emptyMonitoringState(), archives: [], archiveStorage: null };
}

export async function loadArchiveState(workspaceId) {
  const [monitoring, archives, archiveStorage, archiveBatch] = await Promise.all([
    loadMonitoringState(workspaceId),
    getArchiveRecords(workspaceId),
    getArchiveStorage().catch(() => ({ ready: false, message: 'The archive connection status could not be checked. Try loading it again.' })),
    getLatestArchiveBatch(workspaceId).catch(error => {
      // Keep existing records available during a frontend/backend rolling release.
      if (error?.status === 404) return null;
      throw error;
    })
  ]);
  return {
    ...monitoring,
    archives: archives || [],
    archiveStorage,
    archiveBatch
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
