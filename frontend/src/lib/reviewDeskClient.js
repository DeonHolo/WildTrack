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
  applyAiReview,
  applyFieldAiReviews,
  applyFieldChecks,
  applyFileCheck,
  applyReviewState
} from './backendDomain.js';
import { aiReviewableSubmissionFields, reviewableSubmissionFields } from './workflow.js';

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

export async function runDocumentCheck(workspaceId, response, deliverable, field = null) {
  const reviewableFields = reviewableSubmissionFields(deliverable);
  const targetField = field || (reviewableFields.length === 1 ? reviewableFields[0] : null);
  if (!targetField && reviewableFields.length > 1) {
    return { ok: false, error: 'Choose which PDF artifact to check.' };
  }
  const sourceUrl = targetField ? String(response?.values?.[targetField.id] || '').trim() : '';
  if (!sourceUrl) return { ok: false, error: 'This response does not contain a submitted file link.' };
  try {
    const report = await requestDocumentCheck(workspaceId, {
      responseId: response.id,
      fieldId: targetField?.definitionId || null,
      deliverableKey: deliverable?.trackerColumn || deliverable?.shortTitle || response.deliverableId,
      sourceUrl,
      sourceResponseUpdatedAt: response.updatedAt || response.submittedAt
    });
    return { ok: true, report, field: targetField };
  } catch (error) {
    return { ok: false, error: error?.message || 'Document Check could not finish.' };
  }
}

export async function runDocumentChecks(workspaceId, candidates, deliverables, options = {}) {
  const sourceCandidates = candidates || [];
  const byId = new Map((deliverables || []).map((item) => [item.id, item]));
  const targets = sourceCandidates.flatMap((candidate) => {
    if (candidate?.response) return [candidate];
    const deliverable = byId.get(candidate?.deliverableId);
    const fields = reviewableSubmissionFields(deliverable);
    return fields.length ? fields.map((field) => ({ response: candidate, field })) : [{ response: candidate, field: null }];
  });
  const results = [];
  let completed = 0;
  let cursor = 0;
  const runWorker = async () => {
    while (cursor < targets.length && options.shouldContinue?.() !== false) {
      const target = targets[cursor++];
      const response = target.response;
      const result = await runDocumentCheck(workspaceId, response, byId.get(response.deliverableId), target.field);
      results.push({ attemptId: response.id, fieldId: target.field?.definitionId || null, fieldKey: target.field?.id || null, ...result });
      completed += 1;
      options.onProgress?.({ completed, total: targets.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, targets.length) }, runWorker));
  return {
    ok: completed === targets.length && results.every((result) => result.ok),
    cancelled: completed < targets.length,
    total: targets.length,
    completed,
    failed: results.filter((result) => !result.ok).length,
    results
  };
}

export async function runAiReview(workspaceId, responseId, fieldId = null, retryAcknowledged = false, retryToken = null, shouldContinue = () => true) {
  try {
    let review = await requestAiReview(workspaceId, responseId, retryAcknowledged, retryToken, fieldId);
    const reused = review.reused;
    // Poll saved state only. Never repeat the generation POST after a timeout or lost connection.
    const deadline = Date.now() + 8 * 60 * 1000;
    while (review.status === 'RUNNING' && shouldContinue() && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 2500));
      if (!shouldContinue()) return { ok: false, cancelled: true };
      review = { ...await getSavedAiReview(workspaceId, responseId, fieldId), reused };
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

export async function runAiReviews(workspaceId, targets, options = {}) {
  const shouldContinue = options.shouldContinue || (() => true);
  for (const target of targets) {
    if (!shouldContinue()) break;
    const normalized = typeof target === 'string' ? { responseId: target, fieldId: null } : target;
    const targetKey = normalized.key || (normalized.fieldId ? `${normalized.responseId}:${normalized.fieldId}` : normalized.responseId);
    const retryToken = options.retryTokens?.[targetKey] || null;
    const result = await runAiReview(workspaceId, normalized.responseId, normalized.fieldId, Boolean(retryToken), retryToken, shouldContinue);
    if (!shouldContinue() || result.cancelled) break;
    options.onResult?.(normalized, result);
    // Document-specific failures remain available for explicit retry, but do not block other documents.
    if (result.pauseBatch) break;
  }
}

export function applyReviewMutation(response, reviewState) {
  const updated = applyReviewState(response, reviewState);
  return reviewState?.acceptance
    ? updated
    : { ...updated, archiveStatus: 'Not Archived' };
}

export function applyDocumentCheck(response, report) {
  const updated = report?.fieldId
    ? applyFieldChecks(response, { ...(response.artifactChecks || {}), [report.fieldId]: report })
    : applyFileCheck(response, report);
  return applyReviewState(updated, { feedback: response.feedback || [], acceptance: response.acceptance || null });
}

export function applyArtifactAiReview(response, review) {
  if (!review?.fieldId) return applyAiReview(response, review);
  return applyFieldAiReviews(response, { [review.fieldId]: review });
}
