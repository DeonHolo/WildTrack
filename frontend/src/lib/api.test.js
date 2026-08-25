import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getApiBaseUrl, getCurrentSession, logout } from './api.js';
import { fetchCurrentSession, logoutSession } from './session.js';

describe('production API delivery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
  });

  it('uses the same-origin API path without a bundled backend hostname', () => {
    expect(getApiBaseUrl()).toBe('/api');
    expect(getApiBaseUrl()).not.toContain('localhost');
    expect(getApiBaseUrl()).not.toMatch(/^https?:/);
  });

  it('restores authenticated sessions through the same-origin route with cookies', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true, email: 'student@example.test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await getCurrentSession();

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({
      method: 'GET',
      credentials: 'include'
    }));
  });

  it('forwards the CSRF cookie on state-changing same-origin requests', async () => {
    document.cookie = 'XSRF-TOKEN=csrf-token; path=/';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 })
    );

    await logout();

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({ 'X-XSRF-TOKEN': 'csrf-token' })
    }));
  });

  it('preserves an expired-session response as a typed API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Authentication required.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await expect(getCurrentSession()).rejects.toMatchObject({
      name: ApiError.name,
      status: 401,
      message: 'Authentication required.'
    });
  });

  it('handles non-JSON error bodies without crashing on consumed stream', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html><body>Bad Gateway</body></html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' }
      })
    );

    await expect(getCurrentSession()).rejects.toMatchObject({
      name: ApiError.name,
      status: 502,
      message: '<html><body>Bad Gateway</body></html>'
    });
  });
});

describe('same-origin session helpers', () => {
  it('restores sessions without bundling a backend hostname', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true }), { status: 200 })
    );

    await fetchCurrentSession();

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({
      credentials: 'include',
      mode: 'same-origin'
    }));
  });

  it('logs out through the same-origin route with the CSRF header when present', async () => {
    document.cookie = 'XSRF-TOKEN=logout-csrf; path=/';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 })
    );

    await expect(logoutSession()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      mode: 'same-origin',
      headers: expect.objectContaining({ 'X-XSRF-TOKEN': 'logout-csrf' })
    }));
  });
});
