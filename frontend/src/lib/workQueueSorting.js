export const WORK_QUEUE_SORT_OPTIONS = [
  { value: 'priority', label: 'Priority' },
  { value: 'newest', label: 'Newest activity' },
  { value: 'oldest', label: 'Oldest activity' }
];

export function workQueueTimestamp(value) {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function sortWorkQueue(tasks, mode = 'priority') {
  const chronological = mode === 'newest' || mode === 'oldest';
  return tasks.map((task, index) => ({ task, index, timestamp: workQueueTimestamp(task.updatedAt) }))
    .sort((a, b) => {
      let difference;
      if (chronological) {
        if (a.timestamp === null && b.timestamp !== null) return 1;
        if (a.timestamp !== null && b.timestamp === null) return -1;
        difference = mode === 'oldest'
          ? (a.timestamp ?? 0) - (b.timestamp ?? 0)
          : (b.timestamp ?? 0) - (a.timestamp ?? 0);
      } else {
        difference = priorityOf(a.task.category) - priorityOf(b.task.category)
          || (b.timestamp ?? 0) - (a.timestamp ?? 0);
      }
      if (difference) return difference;
      const aId = String(a.task.id ?? '');
      const bId = String(b.task.id ?? '');
      return (aId < bId ? -1 : aId > bId ? 1 : 0) || a.index - b.index;
    })
    .map(({ task }) => task);
}

function priorityOf(category) {
  return { identity: 0, document: 1, review: 2, workspace: 3, archive: 4 }[category] ?? 5;
}
