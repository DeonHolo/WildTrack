import {
  acceptReviewResponse,
  requestAiReview,
  getSavedAiReview,
  getReviewState,
  revokeReviewResponse,
  runDocumentCheck as requestDocumentCheck,
  saveReviewFeedback
} from './api.js';
import {
  applyFileCheck,
  applyReviewState
} from './backendDomain.js';
import { firstSubmissionLink } from './workflow.js';

export { emptyMonitoringState as emptyReviewDesk, loadMonitoringState as loadReviewDesk } from './monitoringClient.js';

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

export async function runAiReview(workspaceId, responseId, retryAcknowledged = false, retryToken = null, shouldContinue = () => true) {
  try {
    let review = await requestAiReview(workspaceId, responseId, retryAcknowledged, retryToken);
    const reused = review.reused;
    // Poll saved state only. Never repeat the generation POST after a timeout or lost connection.
    const deadline = Date.now() + 8 * 60 * 1000;
    while (review.status === 'RUNNING' && shouldContinue() && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 2500));
      if (!shouldContinue()) return { ok: false, cancelled: true };
      review = { ...await getSavedAiReview(workspaceId, responseId), reused };
    }
    return { ok: review.status === 'COMPLETED', unavailable: review.status === 'UNAVAILABLE',
      pauseBatch: review.status === 'UNAVAILABLE' || review.status === 'RUNNING'
        || ['RATE_LIMITED', 'API_KEY_REJECTED', 'NOT_CONFIGURED', 'QUEUE_FULL',
          'PROVIDER_TIMEOUT', 'PROVIDER_CONNECTION_FAILED', 'MODEL_UNAVAILABLE'].includes(review.failureCode),
      pending: review.status === 'RUNNING', uncertain: review.status === 'UNCERTAIN', review,
      error: review.status === 'COMPLETED' ? '' : review.status === 'RUNNING'
        ? 'The review is still running. Its saved result will appear when ready; no new AI request was sent.' : review.message };
  } catch (error) {
    return { ok: false, pauseBatch: true, error: error?.message || 'AI Review could not finish.' };
  }
}

export async function runAiReviews(workspaceId, ids, options = {}) {
  const shouldContinue = options.shouldContinue || (() => true);
  for (const id of ids) {
    if (!shouldContinue()) break;
    const retryToken = options.retryTokens?.[id] || null;
    const result = await runAiReview(workspaceId, id, Boolean(retryToken), retryToken, shouldContinue);
    if (!shouldContinue() || result.cancelled) break;
    options.onResult?.(id, result);
    // Document-specific failures remain available for explicit retry, but do not block other documents.
    if (result.pauseBatch) break;
  }
}

export function applyReviewMutation(response, reviewState) {
  return applyReviewState(response, reviewState);
}

export function applyDocumentCheck(response, report) {
  return applyReviewState(applyFileCheck(response, report), { feedback: response.feedback || [], acceptance: response.acceptance || null });
}
