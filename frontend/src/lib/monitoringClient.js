import { getLatestFileCheck, getReviewState, getStaffMonitoring } from './api.js';
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
  const payload = await getStaffMonitoring(workspaceId);
  const attempts = await Promise.all((payload.responses || []).map(async (raw) => {
    let response = mapResponse(raw);
    const reviewState = await getReviewState(response.id);
    response = applyReviewState(response, reviewState);
    try {
      const report = await getLatestFileCheck(workspaceId, response.id);
      response = applyReviewState(applyFileCheck(response, report), reviewState);
    } catch (error) {
      if (error?.status !== 404) throw error;
    }
    return response;
  }));
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
