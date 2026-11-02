import { archiveResponses, getArchiveRecords, getArchiveStorage, prepareArchiveResponses } from './api.js';
import { emptyMonitoringState, loadMonitoringState } from './monitoringClient.js';
import { runDocumentCheck } from './reviewDeskClient.js';
import { submissionArtifactFields } from './submissionArtifacts.js';

export function emptyArchiveState() {
  return { ...emptyMonitoringState(), archives: [], archiveStorage: null };
}

export async function loadArchiveState(workspaceId) {
  const [monitoring, archives, archiveStorage] = await Promise.all([
    loadMonitoringState(workspaceId),
    getArchiveRecords(workspaceId),
    getArchiveStorage().catch(() => ({ ready: false, message: 'The archive connection status could not be checked. Try loading it again.' }))
  ]);
  return {
    ...monitoring,
    archives: archives || [],
    archiveStorage
  };
}

export async function archiveAttempts(workspaceId, responseIds) {
  const records = await archiveResponses(workspaceId, responseIds);
  return {
    ok: true,
    archived: records.filter(record => record.captureState === 'COMPLETE' && record.lifecycleState === 'Archived').length,
    queued: records.filter(record => ['QUEUED', 'COPYING'].includes(record.captureState)).length,
    records
  };
}

export async function prepareArchiveAttempts(workspaceId, candidates, deliverables, { onProgress, shouldContinue } = {}) {
  const results = [];
  for (const response of candidates) {
    if (shouldContinue?.() === false) break;
    onProgress?.({ completed: results.length, total: candidates.length, name: response.studentName });
    const deliverable = deliverables.find(item => item.id === response.deliverableId);
    const pdfs = submissionArtifactFields(deliverable?.fields || []).filter(field => field.pdfRequired);
    let failure = '';
    try {
      for (const field of pdfs) {
        if (shouldContinue?.() === false) return results;
        const source = String(response.values?.[field.id] || '').trim();
        if (!source && !field.required) continue;
        const check = await runDocumentCheck(workspaceId, response, deliverable, field);
        if (!check.ok) { failure = check.error; break; }
        if (check.report?.failureDetails || check.report?.status !== 'COMPLETED' || check.report?.document?.readable !== true) {
          failure = check.report?.summary || 'The PDF could not be opened. Check its Drive link and sharing settings.';
          break;
        }
      }
      if (failure) results.push({ responseId: response.id, ready: false, message: failure });
      else {
        const prepared = await prepareArchiveResponses(workspaceId, [response.id]);
        const result = prepared?.find(item => item.responseId === response.id);
        results.push(result || { responseId: response.id, ready: false, message: 'Archive preparation did not return a result. Try again.' });
      }
    } catch (error) {
      results.push({ responseId: response.id, ready: false, message: error?.message || 'The PDF checks could not finish. Try again later.' });
    }
    onProgress?.({ completed: results.length, total: candidates.length, name: '' });
  }
  return results;
}
