import { formatDateTime } from './workflow.js';
import { recordedTimestamp } from './recordedTime.js';

export function historyDate(value) {
  const timestamp = historyTimestamp(value);
  return timestamp == null ? 'Unavailable' : formatDateTime(new Date(timestamp));
}

export const historyTimestamp = recordedTimestamp;

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
