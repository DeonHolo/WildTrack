import { ApiError, getDeliverables } from './api.js';

export async function loadValidationStudyDeliverables(workspaceId) {
  return getDeliverables(workspaceId);
}

export async function loadValidationStudyEvidence(workspaceId, deliverableId) {
  const response = await fetch(
    `/api/validation-study/evidence?workspaceId=${encodeURIComponent(workspaceId)}&deliverableId=${encodeURIComponent(deliverableId)}`,
    {
      method: 'GET',
      credentials: 'include',
      mode: 'same-origin',
      headers: { Accept: 'application/json' }
    }
  );
  if (!response.ok) {
    let message = `Validation Study evidence could not be loaded (${response.status}).`;
    try {
      const body = await response.json();
      message = body.error || body.message || message;
    } catch {}
    throw new ApiError(message, response.status);
  }
  return response.json();
}

export function defaultValidationStudyDeliverableId(deliverables = []) {
  const refactoredSrs = deliverables.find((deliverable) => (
    normalize(deliverable.trackerColumnKey) === 'refactored srs'
    || normalize(deliverable.title) === 'refactored srs'
    || normalize(deliverable.title).includes('refactored srs')
  ));
  return refactoredSrs?.id || deliverables[0]?.id || '';
}

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
