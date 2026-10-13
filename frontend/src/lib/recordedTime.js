// Check/history records are stored as UTC LocalDateTime on the backend.
// Academic deadlines are local wall-clock values and must not use this parser.
export function recordedTimestamp(value) {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return null;
  if (typeof value === 'string') {
    value = value.trim();
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)) value += 'Z';
  }
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function recordedIsoTime(value) {
  const time = recordedTimestamp(value);
  return time == null ? value : new Date(time).toISOString();
}
