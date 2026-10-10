import { formatDateTime } from './workflow.js';

export function historyDate(value) {
  return historyTimestamp(value) == null ? 'Unavailable' : formatDateTime(value);
}

export function historyTimestamp(value) {
  if (value == null || value === '') return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function newestHistoryEntries(entries, dateOf) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry, index) => ({ entry, index, date: historyTimestamp(dateOf(entry)) }))
    .sort((a, b) => a.date == null ? (b.date == null ? a.index - b.index : 1)
      : b.date == null ? -1 : b.date - a.date || a.index - b.index)
    .map(({ entry }) => entry);
}

export function observationTime(observation) {
  return historyTimestamp(observation.lastObservedAt) != null
    ? observation.lastObservedAt : observation.firstObservedAt;
}
