import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceSessionProvider } from '../app/WorkspaceSession.jsx';
import { useWorkspaceResource } from './useWorkspaceResource.js';

const empty = () => ({ rows: [] });
const wrapper = ({ children }) => <WorkspaceSessionProvider>{children}</WorkspaceSessionProvider>;
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it('polls visible screens, pauses while hidden and discards an old workspace refresh', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ authenticated: false }));
  vi.useFakeTimers();
  let visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  let resolveOld;
  let current = 'initial';
  const load = async id => id === 'old' && current === 'pending'
    ? new Promise(resolve => { resolveOld = resolve; }) : { rows: [id + current] };
  const { result, rerender, unmount } = renderHook(({ id }) => useWorkspaceResource(id, load, empty), { initialProps: { id: 'old' }, wrapper });
  await act(async () => {});
  current = 'refreshed';
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(result.current.data.rows).toEqual(['oldrefreshed']);
  visibility = 'hidden'; current = 'hidden';
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(result.current.data.rows).toEqual(['oldrefreshed']);
  visibility = 'visible'; current = 'pending';
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  rerender({ id: 'new' });
  await act(async () => {});
  await act(async () => { resolveOld({ rows: ['obsolete'] }); });
  expect(result.current.data.rows).toEqual(['newpending']);
  unmount();
});

it('refreshes visible data on focus and clears it if authorization has expired', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ authenticated: false }));
  let rows = ['before'];
  let failure;
  const load = async () => { if (failure) throw failure; return { rows }; };
  const { result } = renderHook(() => useWorkspaceResource('workspace', load, empty), { wrapper });
  await waitFor(() => expect(result.current.data.rows).toEqual(['before']));
  rows = ['external update'];
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(result.current.data.rows).toEqual(['external update']));
  failure = new Error('Access expired');
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(result.current).toMatchObject({ data: { rows: [] }, status: 'error', error: 'Access expired' }));
});
