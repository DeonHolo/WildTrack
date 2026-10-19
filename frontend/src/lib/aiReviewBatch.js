import { canonicalDriveFileId } from './driveLinks.js';

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
    if (!preview || !includeOutdated && preview.outdated || mode !== 'ALL' && preview.category === 'CLEAN') continue;
    if (!groups.has(preview.key)) groups.set(preview.key, []);
    groups.get(preview.key).push(entry);
  }
  return [...groups.values()];
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
  return entry.noAiStarted !== false && String(entry.error || '').trim().startsWith(
    'The submitted Drive PDF could not be opened. Google Drive reported a file-access or download restriction.'
  );
}

export function aiBatchFailureGroups(entries = []) {
  const groups = new Map();
  for (const entry of entries) {
    const error = String(entry.error || '').trim();
    if (!error) continue;
    const driveAccess = error.startsWith('The submitted Drive PDF could not be opened.');
    const driveRetrieval = error.startsWith('WildTrack could not retrieve the submitted PDF from Google Drive.');
    const message = driveAccess || driveRetrieval
      ? 'These PDFs could not be opened from Google Drive. No AI review started for them.' : error;
    if (!groups.has(message)) groups.set(message, { message, entries: [] });
    groups.get(message).entries.push({ ...entry,
      failureDetail: driveAccess ? 'Access or download restricted' : driveRetrieval ? 'Server retrieval failed' : '' });
  }
  return [...groups.values()];
}
