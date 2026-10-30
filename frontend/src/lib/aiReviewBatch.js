import { canonicalDriveFileId } from './driveLinks.js';
import { providerFailureLabel } from './providerFailures.js';

export function aiBatchUpdatedDocuments(entries = []) {
  const documents = new Map();
  const updatedGroups = aiBatchGroups(entries, 'ALL').filter(group => group.some(entry => entry.preview.outdated));
  for (const group of updatedGroups) {
    for (const entry of group) {
      if (!entry.preview.outdated) continue;
      const fileId = canonicalDriveFileId(entry.preview.sourceUrl);
      const key = fileId ? `drive:${fileId}`
        : `target:${entry.target?.responseId || entry.preview.key}:${entry.target?.fieldId || ''}`;
      if (!documents.has(key)) documents.set(key, { key, entries: [], latest: entry, reviewKeys: new Set() });
      const document = documents.get(key);
      document.entries.push(entry);
      document.reviewKeys.add(entry.preview.key);
      if (compareFileRecords(entry, document.latest) > 0) document.latest = entry;
    }
  }
  return [...documents.values()].sort((a, b) => compareFileRecords(b.latest, a.latest));
}

function compareFileRecords(a, b) {
  const dates = entry => [entry.preview.modifiedAt, entry.checkedAt, entry.preview.sourceResponseUpdatedAt, entry.preview.generatedAt];
  const aDates = dates(a), bDates = dates(b);
  for (let index = 0; index < aDates.length; index++) {
    const difference = recordTime(aDates[index]) - recordTime(bDates[index]);
    if (difference) return difference;
  }
  return 0;
}

function recordTime(value) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
}

export function aiBatchGroups(entries = [], mode = 'ATTENTION', includeOutdated = true) {
  const groups = new Map();
  for (const entry of entries) {
    const preview = entry.preview;
    if (!preview || !includeOutdated && preview.outdated || !matchesAiBatchCategory(preview.category, mode)) continue;
    if (!groups.has(preview.key)) groups.set(preview.key, []);
    groups.get(preview.key).push(entry);
  }
  return [...groups.values()];
}

export function matchesAiBatchCategory(category, mode) {
  if (mode === 'ALL') return true;
  if (mode === 'FAILED') return ['FAILED', 'UNCERTAIN'].includes(category);
  if (mode === 'MANUAL') return category === 'INCONCLUSIVE';
  return !['CLEAN', 'INCONCLUSIVE'].includes(category);
}

export function failedAiBatchTargets(batch) {
  const targets = new Map();
  for (const entry of batch?.entries || []) {
    const finishedFailure = entry.selected && entry.phase === 'DONE' || entry.phase === 'UNVERIFIED';
    if (!finishedFailure || !isAiBatchTechnicalFailure(entry) || !entry.target?.responseId) continue;
    const key = `${entry.target.responseId}:${entry.target.fieldId || ''}`;
    targets.set(key, entry.target);
  }
  return [...targets.values()];
}

export function aiBatchSelection(plan, mode, includeOutdated) {
  const groups = aiBatchGroups(plan?.entries, mode, includeOutdated);
  return {
    unique: groups.length,
    artifacts: groups.reduce((sum, group) => sum + group.length, 0),
    retries: groups.filter(group => group.some(entry => entry.preview.retryToken)).length,
    reruns: groups.filter(group => ['CLEAN', 'ISSUES', 'INCONCLUSIVE'].includes(group[0].preview.category)).length,
    running: groups.filter(group => group[0].preview.category === 'RUNNING').length,
    updated: groups.filter(group => group.some(entry => entry.preview.outdated)).length
  };
}

export function isAiBatchAccessRestriction(entry) {
  const beforeAi = entry.noAiStarted === true
    || entry.noAiStarted == null && !['UNCERTAIN', 'FAILED'].includes(entry.resultStatus);
  return entry.resultStatus !== 'UNCERTAIN' && beforeAi && String(entry.error || '').trim().startsWith(
    'The submitted Drive PDF could not be opened. Google Drive reported a file-access or download restriction.'
  );
}

export function isAiBatchReviewAdvisory(entry) {
  return entry.resultStatus === 'COMPLETED' && Boolean(String(entry.error || '').trim());
}

export function isAiBatchTechnicalFailure(entry) {
  if (entry.resultStatus === 'TEMPLATE_APPROVAL_REQUIRED') return false;
  if (entry.resultStatus === 'UNCERTAIN') return true;
  if (isAiBatchAccessRestriction(entry)) return false;
  if (entry.resultStatus === 'FAILED') return true;
  return Boolean(String(entry.error || '').trim())
    && !isAiBatchReviewAdvisory(entry) && !isAiBatchAccessRestriction(entry);
}

export function aiBatchFailureGroups(entries = []) {
  const groups = new Map();
  for (const entry of entries) {
    const error = String(entry.error || '').trim();
    if (!error) continue;
    const driveAccess = isAiBatchAccessRestriction(entry);
    const driveRetrieval = entry.failureDiagnostics?.provider === 'drive'
      || error.startsWith('WildTrack could not retrieve the submitted PDF from Google Drive.')
      || error.startsWith('Google Drive is rate-limited.')
      || error.startsWith("WildTrack's Drive API configuration was rejected.");
    const advisory = isAiBatchReviewAdvisory(entry);
    const manualCheck = advisory && /manual verification|items to check in the PDF/i.test(error);
    const reviewLimit = advisory && /inconclusive|limited (?:review )?coverage/i.test(error);
    const message = manualCheck
      ? 'These AI Reviews finished with items to check in the PDF. Open the saved reviews for details.'
      : reviewLimit ? 'Some AI observations couldn’t be verified by WildTrack. See Review notes in the saved reviews for details.'
      : driveAccess || driveRetrieval
        ? 'These PDFs could not be opened from Google Drive. No AI review started for them.' : error;
    const groupKey = `${advisory ? 'advisory' : 'failure'}:${message}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { message, advisory, limited: reviewLimit && !manualCheck, entries: [] });
    groups.get(groupKey).entries.push({ ...entry,
      failureDetail: providerFailureLabel(entry.failureDiagnostics)
        || (driveAccess ? 'Access restricted' : driveRetrieval ? 'Drive error' : '') });
  }
  return [...groups.values()];
}
