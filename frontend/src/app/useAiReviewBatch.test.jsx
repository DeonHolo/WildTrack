import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiReviewBatch } from './useAiReviewBatch.js';

const api = vi.hoisted(() => ({ latest: vi.fn(), get: vi.fn(), prepare: vi.fn(), start: vi.fn(), resume: vi.fn(), cancel: vi.fn() }));
vi.mock('../lib/api.js', () => ({
  getLatestAiReviewBatch: (...args) => api.latest(...args), getAiReviewBatch: (...args) => api.get(...args),
  prepareAiReviewBatch: (...args) => api.prepare(...args), startAiReviewBatch: (...args) => api.start(...args),
  resumeAiReviewBatch: (...args) => api.resume(...args), cancelAiReviewBatchPreparation: (...args) => api.cancel(...args)
}));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const plan = (id, state = 'READY') => ({ id, state, version: 1, entries: [] });

describe('server-owned AI batch lifecycle', () => {
  beforeEach(() => { Object.values(api).forEach(mock => mock.mockReset()); api.latest.mockResolvedValue(null); });
  afterEach(() => vi.useRealTimers());

  it('prepares without a start request and sends generation consent only on explicit confirmation', async () => {
    api.prepare.mockResolvedValue(plan('batch')); api.start.mockResolvedValue(plan('batch', 'RUNNING'));
    const { result } = renderHook(() => useAiReviewBatch('workspace'));
    await act(async () => result.current.prepare([{ responseId: 'response', fieldId: 'pdf', ignored: 'UI only' }]));
    expect(api.prepare).toHaveBeenCalledWith('workspace', [{ responseId: 'response', fieldId: 'pdf' }]);
    expect(api.start).not.toHaveBeenCalled();
    const options = { version: 1, mode: 'ALL', includeOutdated: true, retryAcknowledged: true };
    await act(async () => result.current.start(options));
    expect(api.start).toHaveBeenCalledWith('workspace', 'batch', options);
    expect(result.current.opened).toBe(false);
  });

  it('restores progress after leaving the page without cancelling or reposting generation', async () => {
    api.latest.mockResolvedValue(plan('batch', 'RUNNING'));
    const first = renderHook(() => useAiReviewBatch('workspace'));
    await waitFor(() => expect(first.result.current.running).toBe(true));
    first.unmount();
    const second = renderHook(() => useAiReviewBatch('workspace'));
    await waitFor(() => expect(second.result.current.running).toBe(true));
    expect(api.cancel).not.toHaveBeenCalled();
    expect(api.start).not.toHaveBeenCalled();
    expect(api.prepare).not.toHaveBeenCalled();
  });

  it('ignores late status and preparation results from the previous workspace', async () => {
    const late = deferred(); api.prepare.mockReturnValueOnce(late.promise);
    const { result, rerender } = renderHook(({ workspace }) => useAiReviewBatch(workspace), { initialProps: { workspace: 'one' } });
    let pending;
    act(() => { pending = result.current.prepare([{ responseId: 'one', fieldId: 'pdf' }]); });
    rerender({ workspace: 'two' });
    await act(async () => { late.resolve(plan('old')); await pending; });
    expect(result.current.batch).toBe(null);
    expect(result.current.opened).toBe(false);
  });

  it('a late initial read cannot overwrite a newly prepared batch', async () => {
    const late = deferred(); api.latest.mockReturnValueOnce(late.promise); api.prepare.mockResolvedValue(plan('new'));
    const { result } = renderHook(() => useAiReviewBatch('workspace'));
    await act(async () => result.current.prepare([{ responseId: 'r', fieldId: 'pdf' }]));
    await act(async () => late.resolve(null));
    expect(result.current.batch.id).toBe('new');
  });

  it('continuing a paused batch uses resume rather than retry or generation', async () => {
    api.latest.mockResolvedValue(plan('batch', 'PAUSED')); api.resume.mockResolvedValue(plan('batch', 'RUNNING'));
    const { result } = renderHook(() => useAiReviewBatch('workspace'));
    await waitFor(() => expect(result.current.batch?.state).toBe('PAUSED'));
    await act(async () => result.current.resume());
    expect(api.resume).toHaveBeenCalledWith('workspace', 'batch');
    expect(api.start).not.toHaveBeenCalled();
    expect(api.prepare).not.toHaveBeenCalled();
  });
});
