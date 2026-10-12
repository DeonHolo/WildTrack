import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticateGoogle, request, saveDraft, submitResponse, uploadDocumentTemplate } from './api.js';

describe('ordinary Google sign-in API', () => {
  beforeEach(() => { document.cookie = 'XSRF-TOKEN=test-csrf; path=/'; });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('posts only the Google credential to the identity-session endpoint with cookies', async () => {
    const identity = { subject: 'google-subject', email: 'student@example.test' };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(identity), { status: 200 }));
    expect(await authenticateGoogle('signed-google-credential')).toEqual(identity);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/google/session');
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('include');
    expect(JSON.parse(options.body)).toEqual({ credential: 'signed-google-credential' });
  });
  const requests = [
    ['JSON requests', () => request('/workspace/private')],
    ['template multipart upload', () => uploadDocumentTemplate('workspace-a', { deliverableKey: 'srs', displayName: 'Template', file: new File(['pdf'], 'template.pdf', { type: 'application/pdf' }) })],
    ['submission writes', () => submitResponse('workspace-a', 'srs', { pdf: 'drive-link' }, null)],
    ['draft writes', () => saveDraft('workspace-a', 'srs', { pdf: 'drive-link' }, null)]
  ];
  it.each(requests)('preserves an ordinary authorization error from %s', async (name, send) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 'WORKSPACE_FORBIDDEN', message: 'Workspace is not assigned.'
    }), { status: 403 }));
    await expect(send()).rejects.toMatchObject({ code: 'WORKSPACE_FORBIDDEN', status: 403, message: 'Workspace is not assigned.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
