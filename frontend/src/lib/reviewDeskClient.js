import {
  acceptReviewResponse,
  requestAiReview,
  getSavedAiReview,
  getReviewState,
  revokeReviewResponse,
  runDocumentCheck as requestDocumentCheck,
  runDocumentCheckBatch as requestDocumentCheckBatch,
  saveReviewFeedback
} from './api.js';
import {
  applyAiReview,
  applyFieldAiReviews,
  applyFieldChecks,
  applyFileCheck,
  applyReviewState
} from './backendDomain.js';
import { aiReviewableSubmissionFields, isInconclusiveAiReviewReport, reviewableSubmissionFields } from './workflow.js';

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
  if (options.useDedup === true) {
    // Group the entire selection before chunking. The server reuses one capture per
    // Drive file ID within a request; splitting a group would capture it twice.
    const groups = new Map();
    targets.forEach(({ response, field }, index) => {
      const payload = {
        responseId: response.id,
        fieldId: field?.definitionId || null,
        deliverableKey: byId.get(response.deliverableId)?.trackerColumn
          || byId.get(response.deliverableId)?.shortTitle || response.deliverableId,
        sourceUrl: String(response.values?.[field?.id] || '').trim(),
        sourceResponseUpdatedAt: response.updatedAt || response.submittedAt
      };
      // Invalid links get their own groups so they cannot create false file matches.
      const fileId = canonicalDriveFileId(payload.sourceUrl);
      const groupKey = fileId === null ? `invalid:${index}` : `drive:${fileId}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push({ payload, fieldKey: field?.id || null });
    });
    const chunks = groupDocumentCheckTargets([...groups.values()]);
    for (const chunk of chunks) {
      if (options.shouldContinue?.() === false) break;
      const payload = chunk.map((item) => item.payload);
      try {
        // The server enforces a 400-artifact request limit. A single larger shared
        // file group cannot be split without breaking the one-capture guarantee.
        if (chunk.length > 400) throw new Error('More than 400 submissions share this file. Check a smaller selection.');
        const batch = await requestDocumentCheckBatch(workspaceId, payload);
        const received = new Map();
        for (const entry of Array.isArray(batch) ? batch : []) {
          const key = documentCheckResultKey(entry.responseId, entry.fieldId);
          if (!received.has(key)) received.set(key, []);
          received.get(key).push(entry);
        }
        for (const item of chunk) {
          const entry = received.get(documentCheckResultKey(item.payload.responseId, item.payload.fieldId))?.shift();
          results.push({
            attemptId: item.payload.responseId, fieldId: item.payload.fieldId,
            fieldKey: item.fieldKey, ok: Boolean(entry?.report), report: entry?.report || null,
            error: entry?.error || (entry?.report ? '' : 'Document Check did not return a report for this PDF artifact.')
          });
        }
      } catch (error) {
        chunk.forEach(({ payload: target, fieldKey }) => results.push({
          attemptId: target.responseId, fieldId: target.fieldId, fieldKey,
          ok: false, error: error?.message || 'Document Check batch could not finish.'
        }));
      }
      completed += chunk.length;
      options.onProgress?.({ completed, total: targets.length });
    }
    return {
      ok: completed === targets.length && results.every(item => item.ok),
      cancelled: completed < targets.length,
      total: targets.length, completed,
      failed: results.filter(item => !item.ok).length,
      results
    };
  }
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

function canonicalDriveFileId(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    if (url.hostname.toLowerCase() !== 'drive.google.com') return null;
    const pathId = url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1];
    if (pathId) return pathId;
    const queryId = [...url.searchParams.entries()].find(([key]) => key.toLowerCase() === 'id')?.[1];
    return queryId || null;
  } catch {
    return null;
  }
}

function groupDocumentCheckTargets(groups) {
  const MAX_FILES = 8;
  const TARGET_LIMIT = 40;
  const chunks = [];
  let current = [];
  let fileCount = 0;
  for (const group of groups) {
    if (current.length && (fileCount >= MAX_FILES || current.length + group.length > TARGET_LIMIT)) {
      chunks.push(current);
      current = [];
      fileCount = 0;
    }
    current.push(...group);
    fileCount += 1;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function documentCheckResultKey(responseId, fieldId) {
  return JSON.stringify([responseId, fieldId || null]);
}

export async function runAiReview(workspaceId, responseId, fieldId = null, retryAcknowledged = false, retryToken = null,
    shouldContinue = () => true, rerunRequested = false) {
  try {
    let review = await requestAiReview(workspaceId, responseId, retryAcknowledged, retryToken, fieldId, rerunRequested);
    const reused = review.reused;
    // Poll saved state only. Never repeat the generation POST after a timeout or lost connection.
    const deadline = Date.now() + 8 * 60 * 1000;
    while (review.status === 'RUNNING' && shouldContinue() && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 2500));
      if (!shouldContinue()) return { ok: false, cancelled: true };
      review = { ...await getSavedAiReview(workspaceId, responseId, fieldId), reused };
    }
    const inconclusive = review.status === 'UNCERTAIN'
      && ['NO_GROUNDED_FINDINGS', 'FINDINGS_FILTERED'].includes(review.failureCode)
      || review.status === 'COMPLETED' && isInconclusiveAiReviewReport(review.report);
    return { ok: review.status === 'COMPLETED' && !inconclusive,
      unavailable: review.status === 'UNAVAILABLE', inconclusive,
      pauseBatch: review.status === 'UNAVAILABLE' || review.status === 'RUNNING'
        || ['RATE_LIMITED', 'API_KEY_REJECTED', 'NOT_CONFIGURED', 'QUEUE_FULL',
          'PROVIDER_TIMEOUT', 'PROVIDER_CONNECTION_FAILED', 'MODEL_UNAVAILABLE'].includes(review.failureCode),
      pending: review.status === 'RUNNING', uncertain: review.status === 'UNCERTAIN', review,
      error: review.status === 'COMPLETED' && inconclusive
        ? 'The previously saved AI Review contains no source-grounded findings. It is inconclusive, not verification that the PDF is correct.'
        : review.status === 'COMPLETED' ? '' : review.status === 'RUNNING'
        ? 'The review is still running. Open View AI Review after its saved result is ready; no additional AI request was sent.'
        : review.message || (review.failureCode ? `AI Review failed: ${review.failureCode}.` : 'AI Review could not finish.') };
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
    const result = await runAiReview(workspaceId, normalized.responseId, normalized.fieldId, Boolean(retryToken), retryToken,
      shouldContinue, !retryToken && Boolean(options.rerunKeys?.[targetKey]));
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
  // The backend identifies its fallback PDF as `${deliverableId}:legacy`, even
  // when an older client maps that PDF to `documentPdf` without a definitionId.
  // Keep both representations aligned so View AI Review updates immediately in
  // those legacy drawers as well as in the persisted field-scoped version.
  if (review.fieldId === `${response.deliverableId}:legacy`) {
    return applyAiReview(applyFieldAiReviews(response, { [review.fieldId]: review }), review);
  }
  return applyFieldAiReviews(response, { [review.fieldId]: review });
}
