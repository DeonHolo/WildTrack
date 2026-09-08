import {
  acceptReviewResponse,
  getLatestFileCheck,
  getReviewState,
  getStaffMonitoring,
  revokeReviewResponse,
  runDocumentCheck as requestDocumentCheck,
  saveReviewFeedback
} from './api.js';
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
import { firstSubmissionLink } from './workflow.js';

export function emptyReviewDesk() {
  return { ...emptyDomainState(), scopeTeamCodes: [], allTeams: false };
}

export async function loadReviewDesk(workspaceId) {
  const scope = await getStaffMonitoring(workspaceId);
  const responses = await Promise.all((scope.responses || []).map((item) => loadReviewResponse(workspaceId, item)));
  return {
    ...emptyDomainState(),
    students: mapStudents(scope.students || [], scope.trackerRows || []),
    projectMetadata: mapProjects(scope.projects || []),
    trackerColumns: mapTrackerColumns(scope.trackerColumns || []),
    deliverables: mapDeliverables(scope.deliverables || []),
    attempts: responses.map(response => ({
      ...response,
      archiveStatus: (scope.archivedResponseIds || []).includes(response.id) ? 'Archived' : 'Not Archived'
    })),
    scopeTeamCodes: scope.teamCodes || [],
    allTeams: Boolean(scope.allTeams)
  };
}

export async function saveFeedback(responseId, payload) {
  await saveReviewFeedback(responseId, {
    note: String(payload.note || '').trim(),
    visibility: payload.visibility || 'Student'
  });
  return getReviewState(responseId);
}

export async function acceptResponse(responseId) {
  await acceptReviewResponse(responseId);
  return getReviewState(responseId);
}

export async function revokeAcceptance(responseId) {
  await revokeReviewResponse(responseId);
  return getReviewState(responseId);
}

export async function runDocumentCheck(workspaceId, response, deliverable) {
  const sourceUrl = firstSubmissionLink(response?.values);
  if (!sourceUrl) return { ok: false, error: 'This response does not contain a submitted file link.' };
  try {
    const report = await requestDocumentCheck(workspaceId, {
      responseId: response.id,
      deliverableKey: deliverable?.trackerColumn || deliverable?.shortTitle || response.deliverableId,
      sourceUrl,
      sourceResponseUpdatedAt: response.updatedAt || response.submittedAt
    });
    return { ok: true, report };
  } catch (error) {
    return { ok: false, error: error?.message || 'Document Check could not finish.' };
  }
}

export async function runDocumentChecks(workspaceId, responses, deliverables, options = {}) {
  const candidates = responses || [];
  const byId = new Map((deliverables || []).map((item) => [item.id, item]));
  const results = [];
  let completed = 0;
  let cursor = 0;
  const runWorker = async () => {
    while (cursor < candidates.length && options.shouldContinue?.() !== false) {
      const response = candidates[cursor++];
      const result = await runDocumentCheck(workspaceId, response, byId.get(response.deliverableId));
      results.push({ attemptId: response.id, ...result });
      completed += 1;
      options.onProgress?.({ completed, total: candidates.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, runWorker));
  return {
    ok: completed === candidates.length && results.every((result) => result.ok),
    cancelled: completed < candidates.length,
    total: candidates.length,
    completed,
    failed: results.filter((result) => !result.ok).length,
    results
  };
}

export async function runAiReview() {
  return {
    ok: false,
    unavailable: true,
    error: 'Gemini AI Review is not connected yet. Document Check results remain available without Gemini.'
  };
}

export function applyReviewMutation(response, reviewState) {
  return applyReviewState(response, reviewState);
}

export function applyDocumentCheck(response, report) {
  return applyReviewState(applyFileCheck(response, report), { feedback: response.feedback || [], acceptance: response.acceptance || null });
}

async function loadReviewResponse(workspaceId, rawResponse) {
  let response = mapResponse(rawResponse);
  const reviewState = await getReviewState(response.id);
  response = applyReviewState(response, reviewState);
  try {
    const report = await getLatestFileCheck(workspaceId, response.id);
    response = applyFileCheck(response, report);
    response = applyReviewState(response, reviewState);
  } catch (error) {
    if (error?.status !== 404) throw error;
  }
  return response;
}
