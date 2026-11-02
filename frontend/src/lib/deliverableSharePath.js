// Accept current readable links and both previously shared URL shapes.
export function isDeliverableSharePath(path) {
  return /^\/s\/(?:[a-z0-9][a-z0-9-]*\/){0,2}(?:[A-Za-z0-9_-]{12}|[0-9a-f]{64})$/.test(path || '');
}
