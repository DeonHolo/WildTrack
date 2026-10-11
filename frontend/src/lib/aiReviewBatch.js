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
