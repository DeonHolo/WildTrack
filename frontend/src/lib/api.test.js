import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, decideIdentityConflict, describeSnapshotFailures, getAiReviewStatus, getApiBaseUrl, getBackendSnapshot, getCurrentSession, getMyResponse, getSavedAiReview, logout, requestAiReview, saveBackendDeliverable, submitResponse } from './api.js';
import { fetchCurrentSession, logoutSession } from './session.js';

describe('production API delivery', () => {
  it('treats the backend empty 200 for an absent owned response as no response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    await expect(getMyResponse('workspace', 'form')).resolves.toBeNull();
  });
  it('sends the loaded response revision and preserves a stale-tab conflict', async () => {
    document.cookie = 'XSRF-TOKEN=test-csrf; path=/';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, {
      status: 409,
      headers: { 'X-WildTrack-Conflict': 'stale-revision' }
    }));
    await expect(submitResponse('workspace', 'form', { value: 'edit' }, 7, '22-1001-001')).resolves.toEqual({ conflict: true });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      deliverableId: 'form', studentNumber: '22-1001-001', valuesJson: '{"value":"edit"}', revision: 7
    });
  });

  it('surfaces an account-binding 409 as an API error rather than a stale response revision', async () => {
    document.cookie = 'XSRF-TOKEN=test-csrf; path=/';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: 'This Student Number is already associated with another Google account.'
    }), { status: 409, headers: { 'Content-Type': 'application/json' } }));

    await expect(submitResponse('workspace', 'form', { value: 'edit' }, null, '22-1001-001'))
      .rejects.toMatchObject({
        status: 409,
        message: 'This Student Number is already associated with another Google account.'
      });
  });

  it('sends configurable question metadata and stale-write timestamp through the deliverable contract', async () => {
    document.cookie = 'XSRF-TOKEN=test-csrf; path=/';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'form-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

    await saveBackendDeliverable('workspace', {
      id: 'form-1',
      trackerColumn: 'SRS',
      title: 'Questionnaire',
      slug: 'stable-form',
      dueAt: '2026-09-30T23:59:00+08:00',
      status: 'Published',
      expectedUpdatedAt: '2026-09-19T01:02:03',
      fields: [{
        id: 'scope',
        definitionId: 'field-scope',
        label: 'Scope',
        helpText: 'Choose one.',
        type: 'dropdown',
        required: true,
        active: true,
        options: [{ id: 'option-campus', label: 'Campus' }, { id: null, _localKey: 'local-new', label: 'Community' }]
      }]
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      slug: 'stable-form',
      status: 'PUBLISHED',
      expectedUpdatedAt: '2026-09-19T01:02:03'
    });
    expect(body.fields[0]).toMatchObject({
      id: 'field-scope',
      fieldKey: 'scope',
      helpText: 'Choose one.',
      fieldType: 'DROPDOWN',
      options: [{ id: 'option-campus', label: 'Campus' }, { id: null, label: 'Community' }]
    });
  });
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

  it('sends the selected conflict owner even when the optional decision note is blank', async () => {
    document.cookie = 'XSRF-TOKEN=csrf-token; path=/';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'RESOLVED' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await decideIdentityConflict('workspace-1', 'conflict-1', 'RESOLVED', '', 'sub-correct');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      decision: 'RESOLVED',
      confirmedSubject: 'sub-correct'
    });
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

  it('identifies WildTrack session expiry on an AI review POST without exposing the raw 401 body', async () => {
    document.cookie = 'XSRF-TOKEN=test-csrf; path=/';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>Sign-in middleware response</html>', {
      status: 401, headers: { 'Content-Type': 'text/html' }
    }));

    await expect(requestAiReview('workspace-it', 'response-1')).rejects.toMatchObject({
      name: ApiError.name, status: 401,
      message: expect.stringContaining('Sign out, then sign in with Google again')
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/ai-reviews/response-1');
  });

  it('treats a 401 during saved-state polling as app authentication failure', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));

    await expect(getSavedAiReview('workspace-it', 'response-1', 'field-pdf')).rejects.toMatchObject({
      name: ApiError.name, status: 401, message: expect.stringContaining('Check the saved AI Review status')
    });
    await expect(getAiReviewStatus()).rejects.toMatchObject({ status: 401,
      message: expect.stringContaining('WildTrack session expired') });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('preserves Gemini API-key rejection in the saved review response instead of treating it as session expiry', async () => {
    const review = { status: 'UNCERTAIN', failureCode: 'API_KEY_REJECTED',
      message: 'Gemini rejected the API key or its permissions.' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(review), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    }));

    await expect(getSavedAiReview('workspace-it', 'response-1')).resolves.toEqual(review);
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
  it('names each failing snapshot segment instead of silently returning empty data', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      if (String(url).includes('/students')) {
        return Promise.resolve(new Response(JSON.stringify({ error: 'Roster service is down.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
      if (String(url).includes('/workspace/sources')) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return Promise.resolve(new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    });

    const snapshot = await getBackendSnapshot('workspace-it');

    expect(snapshot.students).toEqual([]);
    expect(snapshot.failures.map((failure) => failure.segment).sort()).toEqual(['sources', 'students']);
    expect(snapshot.failures.find((failure) => failure.segment === 'students')).toMatchObject({
      status: 503,
      message: 'Roster service is down.'
    });
    expect(describeSnapshotFailures(snapshot.failures)).toBe(
      'Backend sync incomplete: students (Roster service is down.), workspace sources (Failed to fetch).'
    );
  });

  it('reports no failures and empty description when every segment loads', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })));

    const snapshot = await getBackendSnapshot('workspace-it');

    expect(snapshot.failures).toEqual([]);
    expect(describeSnapshotFailures(snapshot.failures)).toBe('');
  });

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
