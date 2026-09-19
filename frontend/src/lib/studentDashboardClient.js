import { getStudentDashboard } from './api.js';
import {
  applyFileCheck,
  applyFieldChecks,
  applyReviewState,
  applySubmissionProgress,
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
  const deliverables = mapDeliverables(dashboard.deliverables || []);
  const attempts = (dashboard.responses || []).map((raw) => {
    const response = mapResponse(raw, dashboard.responseTimings?.[raw.id] || null);
    if (!raw.owned) return response;
    return applyReviewState(
      applyFieldChecks(applyFileCheck(response, dashboard.fileChecks?.[raw.id]), dashboard.fileChecksByField?.[raw.id]),
      dashboard.reviewStates?.[raw.id]
    );
  });
  return {
    ...emptyDomainState(),
    association: dashboard.association || null,
    rosterOptions: mapStudents(dashboard.rosterOptions || []),
    students: applySubmissionProgress(
      mapStudents(dashboard.students || [], dashboard.trackerRows || []),
      deliverables,
      attempts
    ),
    projectMetadata: mapProjects(dashboard.projects || []),
    trackerColumns: mapTrackerColumns(dashboard.trackerColumns || []),
    deliverables,
    attempts
  };
}
