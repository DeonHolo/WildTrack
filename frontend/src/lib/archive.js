export function getArchiveStatus(archive) {
  if (archive.captureState === 'QUEUED' || archive.captureState === 'COPYING') return 'Copying';
  if (archive.captureState === 'FAILED' || archive.storageStatus === 'Storage failed') return 'Storage failed';
  if (archive.captureState === 'LEGACY') return 'Metadata only';
  if (archive.storageStatus === 'Retrying') return 'Retrying';
  if (archive.integrityStatus === 'Verification failed') return 'Verification failed';
  if (archive.storageStatus === 'Failed') return 'Storage failed';
  if (archive.integrityStatus === 'Verified' && archive.storageStatus === 'Stored') return 'Verified';
  return archive.integrityStatus || archive.storageStatus || 'Unavailable';
}

export function getArchiveVersion(archive) {
  return archive.version || 'v1';
}

export function orderArchiveStatuses(statuses) {
  const priority = ['Storage failed', 'Verification failed', 'Unavailable', 'Metadata only', 'Pending',
    'Retrying', 'Copying', 'Stored', 'Verified'];
  const rank = status => priority.includes(status) ? priority.indexOf(status) : priority.length;
  return [...new Set(statuses.filter(Boolean))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
