import { getStudentDashboard } from './api.js';
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

export function emptyStudentDashboardState() {
  return { ...emptyDomainState(), association: null, rosterOptions: [] };
}

export async function loadStudentDashboard(workspaceId) {
  const dashboard = await getStudentDashboard(workspaceId);
  return {
    ...emptyDomainState(),
    association: dashboard.association || null,
    rosterOptions: mapStudents(dashboard.rosterOptions || []),
    students: mapStudents(dashboard.students || [], dashboard.trackerRows || []),
    projectMetadata: mapProjects(dashboard.projects || []),
    trackerColumns: mapTrackerColumns(dashboard.trackerColumns || []),
    deliverables: mapDeliverables(dashboard.deliverables || []),
    attempts: (dashboard.responses || []).map((raw) => {
      const response = mapResponse(raw);
      if (!raw.owned) return response;
      return applyReviewState(
        applyFileCheck(response, dashboard.fileChecks?.[raw.id]),
        dashboard.reviewStates?.[raw.id]
      );
    })
  };
}
