import { getStaffMonitoring } from './api.js';
import {
  applyFileCheck,
  applyReviewState,
  emptyDomainState,
  mapDeliverables,
  mapProjects,
  mapResponse,
  mapStudents,
  mapTrackerColumns
} from './backendDomain.js';

export function emptyMonitoringState() {
  return { ...emptyDomainState(), scopeTeamCodes: [], allTeams: false };
}

export async function loadMonitoringState(workspaceId) {
  const payload = await getStaffMonitoring(workspaceId, true);
  if ((payload.responses || []).some(raw => !Object.hasOwn(payload.reviewStates || {}, raw.id))) {
    throw new Error('Review status is not available. Reload after the server update finishes.');
  }
  const attempts = (payload.responses || []).map(raw => applyReviewState(
    applyFileCheck(mapResponse(raw), payload.fileChecks?.[raw.id]), payload.reviewStates?.[raw.id]
  ));
  return {
    ...emptyDomainState(),
    students: mapStudents(payload.students || [], payload.trackerRows || []),
    projectMetadata: mapProjects(payload.projects || []),
    trackerColumns: mapTrackerColumns(payload.trackerColumns || []),
    deliverables: mapDeliverables(payload.deliverables || []),
    attempts: attempts.map(response => ({
      ...response,
      archiveStatus: (payload.archivedResponseIds || []).includes(response.id) ? 'Archived' : 'Not Archived'
    })),
    scopeTeamCodes: payload.teamCodes || [],
    allTeams: Boolean(payload.allTeams)
  };
}
