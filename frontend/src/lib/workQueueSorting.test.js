import { describe, expect, it } from 'vitest';
import { sortWorkQueue, workQueueTimestamp } from './workQueueSorting.js';

function task(id, category, updatedAt) { return { id, category, updatedAt }; }
function ids(tasks, mode) { return sortWorkQueue(tasks, mode).map(item => item.id); }

describe('work queue sorting', () => {
  const tasks = [
    task('archive', 'archive', '2026-10-06T08:00:00Z'),
    task('document-old', 'document', '2026-10-02T08:00:00Z'),
    task('review', 'review', '2026-10-04T08:00:00Z'),
    task('workspace', 'workspace', '2026-10-05T08:00:00Z'),
    task('identity', 'identity', '2026-10-01T08:00:00Z'),
    task('document-new', 'document', '2026-10-03T08:00:00Z')
  ];

  it('keeps identity, document, review, workspace, and archive priority with newest first within each type', () => {
    expect(ids(tasks)).toEqual([
      'identity', 'document-new', 'document-old', 'review', 'workspace', 'archive'
    ]);
    expect(ids(tasks, 'unsupported')).toEqual(ids(tasks));
  });

  it('orders activity across work types in both directions without changing tasks or the input order', () => {
    const snapshot = [...tasks];
    expect(ids(tasks, 'newest')).toEqual([
      'archive', 'workspace', 'review', 'document-new', 'document-old', 'identity'
    ]);
    expect(ids(tasks, 'oldest')).toEqual([
      'identity', 'document-old', 'document-new', 'review', 'workspace', 'archive'
    ]);
    expect(tasks).toEqual(snapshot);
    for (const item of sortWorkQueue(tasks, 'oldest')) expect(snapshot).toContain(item);
  });

  it.each(['newest', 'oldest'])('places missing and invalid dates last for %s, including before-epoch activity', (mode) => {
    const mixed = [
      task('missing', 'identity', null),
      task('invalid', 'document', 'invalid date'),
      task('epoch', 'review', 0),
      task('old', 'archive', '1969-12-31T23:59:59Z'),
      task('new', 'workspace', '2026-10-10T08:00:00Z')
    ];
    expect(ids(mixed, mode)).toEqual(mode === 'newest'
      ? ['new', 'epoch', 'old', 'invalid', 'missing']
      : ['old', 'epoch', 'new', 'invalid', 'missing']);
  });

  it.each(['priority', 'newest', 'oldest'])('breaks equal-date and undated ties by task id for %s independent of incoming order', (mode) => {
    const tied = [
      task('same-b', 'document', '2026-10-10T16:00:00+08:00'),
      task('unknown-b', 'document', undefined),
      task('same-a', 'document', '2026-10-10T08:00:00Z'),
      task('unknown-a', 'document', '')
    ];
    const expected = ['same-a', 'same-b', 'unknown-a', 'unknown-b'];
    expect(ids(tied, mode)).toEqual(expected);
    expect(ids([...tied].reverse(), mode)).toEqual(expected);
  });
});

describe('work queue activity dates', () => {
  it.each([undefined, null, '', '  ', 'not a date', '2026-99-99', true, {}, Infinity])(
    'treats %j as an unavailable timestamp rather than manufacturing a date', (value) => {
      expect(workQueueTimestamp(value)).toBeNull();
    }
  );

  it('recognizes timestamp zero and equivalent timezone offsets as valid activity', () => {
    expect(workQueueTimestamp(0)).toBe(0);
    expect(workQueueTimestamp('2026-10-10T16:00:00+08:00'))
      .toBe(workQueueTimestamp('2026-10-10T08:00:00Z'));
  });
});
