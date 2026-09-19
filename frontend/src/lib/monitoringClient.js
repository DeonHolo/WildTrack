import { getStaffMonitoring } from './api.js';
import {
  applyFileCheck,
  applyFieldChecks,
  applyAiReview,
  applyFieldAiReviews,
  applyReviewState,
  applySubmissionProgress,
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
  const attempts = (payload.responses || []).map(raw => {
    let response = mapResponse(raw, payload.responseTimings?.[raw.id] || null);
    response = applyFileCheck(response, payload.fileChecks?.[raw.id]);
    response = applyFieldChecks(response, payload.fileChecksByField?.[raw.id]);
    response = {
      ...response,
      observedFileHistory: payload.observedFileHistory?.[raw.id] || null,
      observedFileHistoryByField: payload.observedFileHistoryByField?.[raw.id] || {}
    };
    response = applyReviewState(response, payload.reviewStates?.[raw.id]);
    response = applyAiReview(response, payload.aiReviews?.[raw.id]);
    response = applyFieldAiReviews(response, payload.aiReviewsByField?.[raw.id]);
    return response;
  });
  const deliverables = mapDeliverables(payload.deliverables || []);
  const students = applySubmissionProgress(
    mapStudents(payload.students || [], payload.trackerRows || []),
    deliverables,
    attempts
  );
  return {
    ...emptyDomainState(),
    students,
    projectMetadata: mapProjects(payload.projects || []),
    trackerColumns: mapTrackerColumns(payload.trackerColumns || []),
    deliverables,
    attempts: attempts.map(response => ({
      ...response,
      archiveStatus: (payload.archivedResponseIds || []).includes(response.id) ? 'Archived' : 'Not Archived'
    })),
    scopeTeamCodes: payload.teamCodes || [],
    allTeams: Boolean(payload.allTeams)
  };
}
