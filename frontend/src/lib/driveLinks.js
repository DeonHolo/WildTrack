export function canonicalDriveFileId(sourceUrl) {
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
