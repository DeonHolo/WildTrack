import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiReviewBatch } from './useAiReviewBatch.js';
import { createWorkspaceResourceCache } from '../lib/workspaceResourceCache.js';

const workspace = vi.hoisted(() => ({ session: null, resourceCache: null }));
vi.mock('./WorkspaceSession.jsx', () => ({ useWorkspaceSession: () => workspace }));

const api = vi.hoisted(() => ({ latest: vi.fn(), get: vi.fn(), prepare: vi.fn(), start: vi.fn(), resume: vi.fn(), stop: vi.fn(), cancel: vi.fn() }));
vi.mock('../lib/api.js', () => ({
  getLatestAiReviewBatch: (...args) => api.latest(...args), getAiReviewBatch: (...args) => api.get(...args),
  prepareAiReviewBatch: (...args) => api.prepare(...args), startAiReviewBatch: (...args) => api.start(...args),
  resumeAiReviewBatch: (...args) => api.resume(...args), stopAiReviewBatch: (...args) => api.stop(...args), cancelAiReviewBatchPreparation: (...args) => api.cancel(...args)
}));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const plan = (id, state = 'READY') => ({ id, state, version: 1, entries: [] });

describe('server-owned AI batch lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    workspace.session = { authenticated: true, email: 'admin@school.edu', roles: ['ADMIN'] };
    workspace.resourceCache = createWorkspaceResourceCache();
    Object.values(api).forEach(mock => mock.mockReset()); api.latest.mockResolvedValue(null);
  });
  afterEach(() => vi.useRealTimers());

  it('keeps a finished notice dismissed across navigation and shows the next completion', async () => {
    api.latest.mockResolvedValue(plan('finished', 'COMPLETED'));
    const first = renderHook(() => useAiReviewBatch('workspace'));
    await waitFor(() => expect(first.result.current.batch?.state).toBe('COMPLETED'));
    act(() => first.result.current.dismiss());
    expect(first.result.current.panelDismissed).toBe(true);
    first.unmount();
    const second = renderHook(() => useAiReviewBatch('workspace'));
    expect(second.result.current.panelDismissed).toBe(true);
    second.unmount();
    api.latest.mockResolvedValue({ ...plan('finished', 'COMPLETED'), version: 2 });
    const next = renderHook(() => useAiReviewBatch('workspace'));
    await waitFor(() => expect(next.result.current.batch?.version).toBe(2));
    expect(next.result.current.panelDismissed).toBe(false);
    expect(api.start).not.toHaveBeenCalled();
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it('cannot dismiss an active batch and isolates dismissals by workspace and account', async () => {
    api.latest.mockResolvedValue(plan('same-id', 'RUNNING'));
    const running = renderHook(() => useAiReviewBatch('one'));
    await waitFor(() => expect(running.result.current.running).toBe(true));
    act(() => running.result.current.dismiss());
    expect(running.result.current.panelDismissed).toBe(false);
    running.unmount();
    api.latest.mockResolvedValue(plan('same-id', 'COMPLETED'));
    const first = renderHook(() => useAiReviewBatch('one'));
    await waitFor(() => expect(first.result.current.batch?.state).toBe('COMPLETED'));
    act(() => first.result.current.dismiss());
    first.unmount();
    const other = renderHook(() => useAiReviewBatch('two'));
    await waitFor(() => expect(other.result.current.batch?.state).toBe('COMPLETED'));
    expect(other.result.current.panelDismissed).toBe(false);
    other.unmount();
    workspace.session = { ...workspace.session, email: 'other@school.edu' };
    const account = renderHook(() => useAiReviewBatch('one'));
    await waitFor(() => expect(account.result.current.batch?.state).toBe('COMPLETED'));
    expect(account.result.current.panelDismissed).toBe(false);
  });

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

  it('retains an in-flight preparation response after its window is closed', async () => {
    const pending = deferred(); api.prepare.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useAiReviewBatch('workspace'));
    let request;
    act(() => { request = result.current.prepare([{ responseId: 'r', fieldId: 'pdf' }]); });
    expect(result.current.opened).toBe(false);
    act(() => result.current.close());
    await act(async () => { pending.resolve(plan('precheck', 'PLANNING')); await request; });
    expect(result.current.opened).toBe(false);
    expect(result.current.batch).toMatchObject({ id: 'precheck', state: 'PLANNING' });
    act(() => result.current.open());
    expect(result.current.opened).toBe(false);
    expect(api.prepare).toHaveBeenCalledTimes(1);
    expect(api.cancel).not.toHaveBeenCalled();
    expect(api.start).not.toHaveBeenCalled();
  });

  it.each(['PLANNING', 'READY'])('restores a %s precheck after navigating away without cancelling or starting AI', async (state) => {
    api.latest.mockResolvedValue(plan('precheck', state));
    const first = renderHook(() => useAiReviewBatch('workspace'));
    await waitFor(() => expect(first.result.current.batch?.state).toBe(state));
    act(() => { first.result.current.open(); first.result.current.close(); });
    first.unmount();
    const second = renderHook(() => useAiReviewBatch('workspace'));
    expect(second.result.current.batch).toMatchObject({ id: 'precheck', state });
    act(() => second.result.current.open());
    expect(second.result.current.opened).toBe(state === 'READY');
    expect(api.cancel).not.toHaveBeenCalled();
    expect(api.start).not.toHaveBeenCalled();
    expect(api.prepare).not.toHaveBeenCalled();
  });

  it('restores progress after leaving the page without cancelling or reposting generation', async () => {
    api.latest.mockResolvedValue(plan('batch', 'RUNNING'));
    const first = renderHook(() => useAiReviewBatch('workspace'));
    await waitFor(() => expect(first.result.current.running).toBe(true));
    first.unmount();
    const pending = deferred(); api.latest.mockReturnValueOnce(pending.promise);
    const second = renderHook(() => useAiReviewBatch('workspace'));
    // Assert the first render, while the server read is still unresolved: eventual
    // restoration alone passes even when the panel briefly vanishes on navigation.
    expect(second.result.current.batch).toMatchObject({ id: 'batch', state: 'RUNNING' });
    expect(second.result.current.running).toBe(true);
    await act(async () => pending.resolve(plan('batch', 'PAUSED')));
    expect(second.result.current.batch.state).toBe('PAUSED');
    expect(api.cancel).not.toHaveBeenCalled();
    expect(api.start).not.toHaveBeenCalled();
    expect(api.prepare).not.toHaveBeenCalled();
  });

  it('never shows another workspace or account/role snapshot during a pending restore', async () => {
    api.latest.mockResolvedValue(plan('private', 'PAUSED'));
    const { result, rerender } = renderHook(({ id }) => useAiReviewBatch(id), { initialProps: { id: 'one' } });
    await waitFor(() => expect(result.current.batch?.id).toBe('private'));
    api.latest.mockReturnValue(new Promise(() => {}));
    rerender({ id: 'two' });
    expect(result.current.batch).toBe(null);
    rerender({ id: 'one' });
    expect(result.current.batch?.id).toBe('private');
    workspace.session = { ...workspace.session, roles: ['STUDENT'] };
    rerender({ id: 'one' });
    expect(result.current.batch).toBe(null);
    workspace.session = { authenticated: true, email: 'another@school.edu', roles: ['ADMIN'] };
    rerender({ id: 'one' });
    expect(result.current.batch).toBe(null);
    expect(api.start).not.toHaveBeenCalled();
  });

  it('drops cached private progress when revalidation denies access', async () => {
    api.latest.mockResolvedValue(plan('private', 'PAUSED'));
    const first = renderHook(() => useAiReviewBatch('workspace'));
    await waitFor(() => expect(first.result.current.batch?.id).toBe('private'));
    first.unmount();
    api.latest.mockRejectedValueOnce(Object.assign(new Error('Session expired'), { status: 401 }));
    const second = renderHook(() => useAiReviewBatch('workspace'));
    expect(second.result.current.batch?.id).toBe('private');
    await waitFor(() => expect(second.result.current.batch).toBe(null));
    expect(second.result.current.error).toBe('Session expired');
    expect(api.start).not.toHaveBeenCalled();
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

  it('requests a graceful stop without cancelling the batch or starting more AI', async () => {
    api.latest.mockResolvedValue(plan('batch', 'RUNNING'));
    api.stop.mockResolvedValue({ ...plan('batch', 'RUNNING'), stopRequested: true });
    const { result } = renderHook(() => useAiReviewBatch('workspace'));
    await waitFor(() => expect(result.current.batch?.id).toBe('batch'));
    await act(async () => result.current.stop());
    expect(api.stop).toHaveBeenCalledWith('workspace', 'batch');
    expect(result.current.batch.stopRequested).toBe(true);
    expect(api.cancel).not.toHaveBeenCalled();
    expect(api.start).not.toHaveBeenCalled();
    expect(api.prepare).not.toHaveBeenCalled();
  });

  it('ignores a late stop response after the workspace changes', async () => {
    api.latest.mockImplementation(id => Promise.resolve(id === 'one' ? plan('batch', 'RUNNING') : null));
    const pending = deferred(); api.stop.mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(({ id }) => useAiReviewBatch(id), { initialProps: { id: 'one' } });
    await waitFor(() => expect(result.current.batch?.id).toBe('batch'));
    let request; act(() => { request = result.current.stop(); });
    rerender({ id: 'two' });
    await act(async () => { pending.resolve({ ...plan('batch', 'RUNNING'), stopRequested: true }); await request; });
    expect(result.current.batch).toBe(null);
    expect(result.current.busy).toBe(false);
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
