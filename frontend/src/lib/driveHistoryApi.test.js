import { afterEach, describe, expect, it, vi } from 'vitest';
import { disconnectDriveHistoryConsent, getDriveHistoryConsentStatus, getSubmittedFileHistory } from './api.js';

afterEach(() => vi.restoreAllMocks());

describe('submitted-file Drive history API', () => {
  it('uses the persisted response and field identity with an opaque page token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      status: 'AVAILABLE', nextPageToken: null, revisions: []
    }));
    await getSubmittedFileHistory('workspace-it', 'response-1', 'pdf-field', 'opaque+/= page token');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/drive-history?workspaceId=workspace-it&responseId=response-1&fieldId=pdf-field&pageToken=opaque%2B%2F%3D+page+token',
      expect.objectContaining({ method: 'GET', credentials: 'include', mode: 'same-origin' })
    );
    expect(fetchMock.mock.calls[0][0]).not.toContain('drive.google.com');
  });

  it('requires an exact submitted artifact before performing any Drive history request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    expect(() => getSubmittedFileHistory('workspace-it', 'response-1', '')).toThrow(/Choose a submitted file/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps authorization status and disconnect separate from Google sign-in', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => Response.json(
      String(url).includes('/disconnect') ? { configured: true, connected: false } : { configured: true, connected: true }
    ));
    expect(await getDriveHistoryConsentStatus()).toMatchObject({ connected: true });
    expect(await disconnectDriveHistoryConsent()).toMatchObject({ connected: false });
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/drive-history/auth/disconnect');
    expect(fetchMock.mock.calls.some(([url, options]) =>
      url === '/api/drive-history/auth/disconnect' && options?.method === 'POST' && options.credentials === 'include'
    )).toBe(true);
  });
});
