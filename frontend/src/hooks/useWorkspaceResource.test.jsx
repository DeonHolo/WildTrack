import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceSessionProvider } from '../app/WorkspaceSession.jsx';
import { useWorkspaceResource } from './useWorkspaceResource.js';

const empty = () => ({ rows: [] });
const wrapper = ({ children }) => <WorkspaceSessionProvider>{children}</WorkspaceSessionProvider>;
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it('does not idle-poll by default and discards an old workspace refresh', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ authenticated: false }));
  vi.useFakeTimers();
  let visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  let resolveOld;
  let current = 'initial';
  const load = async id => id === 'old' && current === 'pending'
    ? new Promise(resolve => { resolveOld = resolve; }) : { rows: [id + current] };
  const { result, rerender, unmount } = renderHook(({ id }) => useWorkspaceResource(id, load, empty, '', { staleTimeMs: 0 }), { initialProps: { id: 'old' }, wrapper });
  await act(async () => {});
  current = 'refreshed';
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(result.current.data.rows).toEqual(['oldinitial']);
  visibility = 'hidden'; current = 'hidden';
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(result.current.data.rows).toEqual(['oldinitial']);
  visibility = 'visible'; current = 'pending';
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  rerender({ id: 'new' });
  await act(async () => {});
  await act(async () => { resolveOld({ rows: ['obsolete'] }); });
  expect(result.current.data.rows).toEqual(['newpending']);
  unmount();
});

it('revalidates a stale visible resource once per focus burst and skips hidden refreshes', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ authenticated: false }));
  vi.useFakeTimers();
  let visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  const load = vi.fn().mockResolvedValue({ rows: [] });
  renderHook(() => useWorkspaceResource('workspace', load, empty, '', { staleTimeMs: 100 }), { wrapper });
  await act(async () => {});
  expect(load).toHaveBeenCalledTimes(1);
  act(() => window.dispatchEvent(new Event('focus')));
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(101); });
  act(() => window.dispatchEvent(new Event('focus')));
  act(() => window.dispatchEvent(new Event('focus')));
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  await act(async () => {});
  expect(load).toHaveBeenCalledTimes(2);
  visibility = 'hidden';
  await act(async () => { await vi.advanceTimersByTimeAsync(101); });
  act(() => window.dispatchEvent(new Event('focus')));
  expect(load).toHaveBeenCalledTimes(2);
});

it('supports opt-in 60 second visible polling and immediate mutation refresh', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ authenticated: false }));
  vi.useFakeTimers();
  let visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  const load = vi.fn().mockResolvedValue({ rows: [] });
  renderHook(() => useWorkspaceResource('workspace', load, empty, '', { refreshIntervalMs: 60000, staleTimeMs: 60000 }), { wrapper });
  await act(async () => {});
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(45000); });
  expect(load).toHaveBeenCalledTimes(2);
  visibility = 'hidden';
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(load).toHaveBeenCalledTimes(2);
  act(() => window.dispatchEvent(new Event('wildtrack:refresh-resources')));
  await act(async () => {});
  expect(load).toHaveBeenCalledTimes(3);
});

it('supersedes an older pending read when mutation invalidation forces a refresh', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ authenticated: false }));
  let resolveOld;
  let calls = 0;
  const load = vi.fn(() => {
    calls += 1;
    if (calls === 1) return Promise.resolve({ rows: ['initial'] });
    if (calls === 2) return new Promise(resolve => { resolveOld = resolve; });
    return Promise.resolve({ rows: ['fresh'] });
  });
  const { result } = renderHook(() => useWorkspaceResource('workspace', load, empty, '', { staleTimeMs: 0 }), { wrapper });
  await waitFor(() => expect(result.current.data.rows).toEqual(['initial']));
  act(() => { result.current.reload({ background: true, force: false }); });
  act(() => window.dispatchEvent(new Event('wildtrack:refresh-resources')));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
  await act(async () => resolveOld({ rows: ['obsolete'] }));
  await waitFor(() => expect(result.current.data.rows).toEqual(['fresh']));
});

it('refreshes visible data on focus and clears it if authorization has expired', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ authenticated: false }));
  let rows = ['before'];
  let failure;
  const load = async () => { if (failure) throw failure; return { rows }; };
  const { result } = renderHook(() => useWorkspaceResource('workspace', load, empty, '', { staleTimeMs: 0 }), { wrapper });
  await waitFor(() => expect(result.current.data.rows).toEqual(['before']));
  rows = ['external update'];
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(result.current.data.rows).toEqual(['external update']));
  failure = Object.assign(new Error('Access expired'), { status: 401 });
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(result.current).toMatchObject({ data: { rows: [] }, status: 'error', error: 'Access expired' }));
});

it('keeps usable rows during a refresh failure and allows retry', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ authenticated: false }));
  let rejectRefresh;
  const load = vi.fn().mockResolvedValueOnce({ rows: ['saved row'] })
    .mockImplementationOnce(() => new Promise((_, reject) => { rejectRefresh = reject; }))
    .mockResolvedValueOnce({ rows: ['updated row'] });
  const { result } = renderHook(() => useWorkspaceResource('workspace', load, empty), { wrapper });
  await waitFor(() => expect(result.current.data.rows).toEqual(['saved row']));
  act(() => { result.current.reload(); });
  expect(result.current.data.rows).toEqual(['saved row']);
  await act(async () => rejectRefresh(new Error('Connection interrupted')));
  expect(result.current).toMatchObject({ data: { rows: ['saved row'] }, status: 'ready', error: 'Connection interrupted' });
  await act(async () => { await result.current.reload(); });
  expect(result.current).toMatchObject({ data: { rows: ['updated row'] }, status: 'ready', error: '' });
});
