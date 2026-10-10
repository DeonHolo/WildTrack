import { describe, expect, it } from 'vitest';
import { historyDate, newestHistoryEntries, observationTime } from './fileHistoryPresentation.js';

describe('file history presentation', () => {
  it('orders actual recorded times newest first without mutating the supplied history', () => {
    const records = [
      { id: 'older', firstObservedAt: '2026-09-01T09:00:00Z' },
      { id: 'seen-again', firstObservedAt: '2026-08-01T09:00:00Z', lastObservedAt: '2026-10-01T09:00:00Z' },
      { id: 'unknown', firstObservedAt: 'bad-date' },
      { id: 'same-time', firstObservedAt: '2026-09-01T17:00:00+08:00' }
    ];
    expect(newestHistoryEntries(records, observationTime).map(item => item.id)).toEqual(['seen-again', 'older', 'same-time', 'unknown']);
    expect(records.map(item => item.id)).toEqual(['older', 'seen-again', 'unknown', 'same-time']);
  });

  it('falls back from an invalid last observation and labels absent times without inventing a date', () => {
    expect(observationTime({ firstObservedAt: '2026-09-01', lastObservedAt: 'invalid' })).toBe('2026-09-01');
    for (const value of [undefined, null, '', 'invalid']) expect(historyDate(value)).toBe('Unavailable');
    expect(newestHistoryEntries(undefined, item => item.modifiedTime)).toEqual([]);
  });
});
