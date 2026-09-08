import { getStaffMonitoring } from './api.js';
import { mapDeliverables, mapTrackerColumns } from './backendDomain.js';

export function emptyFormsState() {
  return { deliverables: [], trackerColumns: [], attempts: [] };
}

export async function loadFormsState(workspaceId) {
  const payload = await getStaffMonitoring(workspaceId);
  // Forms needs response counts, not each response's review or document report.
  return {
    deliverables: mapDeliverables(payload.deliverables || []),
    trackerColumns: mapTrackerColumns(payload.trackerColumns || []),
    attempts: (payload.responses || []).map(({ id, deliverableId }) => ({ id, deliverableId }))
  };
}
