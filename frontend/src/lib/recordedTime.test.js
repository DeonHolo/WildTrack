import { describe, expect, it } from 'vitest';
import { recordedIsoTime, recordedTimestamp } from './recordedTime.js';

describe('UTC check records', () => {
  it('interprets legacy zone-less check times as UTC, preserving explicit offsets', () => {
    expect(recordedIsoTime('2026-10-13T16:20:29.869589')).toBe('2026-10-13T16:20:29.869Z');
    expect(recordedTimestamp('2026-10-14T00:20:29.869+08:00')).toBe(recordedTimestamp('2026-10-13T16:20:29.869'));
    expect(recordedTimestamp('2026-10-13T16:20:00')).toBeGreaterThan(recordedTimestamp('2026-10-13T16:07:00Z'));
  });
  it.each([null, undefined, '', 'invalid', Infinity, {}])('does not invent a timestamp for %j', value => {
    expect(recordedTimestamp(value)).toBeNull();
  });
});
