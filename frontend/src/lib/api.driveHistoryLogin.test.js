import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { request, saveDraft, startDriveHistoryConsent, startGoogleSignIn, submitResponse, uploadDocumentTemplate } from './api.js';

describe('required Drive permission API signal', () => {
  beforeEach(() => { document.cookie = 'XSRF-TOKEN=test-csrf; path=/'; });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  const requests = [
    ['JSON requests', () => request('/workspace/private')],
    ['template multipart upload', () => uploadDocumentTemplate('workspace-a', { deliverableKey: 'srs', displayName: 'Template', file: new File(['pdf'], 'template.pdf', { type: 'application/pdf' }) })],
    ['submission writes', () => submitResponse('workspace-a', 'srs', { pdf: 'drive-link' }, null)],
    ['draft writes', () => saveDraft('workspace-a', 'srs', { pdf: 'drive-link' }, null)]
  ];
  it.each(requests)('signals required permission from %s', async (name, send) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 'DRIVE_HISTORY_REQUIRED', message: 'Connect Google Drive history to finish signing in.' }), { status: 403 }));
    const event = vi.fn();
    window.addEventListener('wildtrack:drive-history-required', event);
    try {
      await expect(send()).rejects.toMatchObject({ code: 'DRIVE_HISTORY_REQUIRED', status: 403 });
      expect(event).toHaveBeenCalledTimes(1);
    } finally { window.removeEventListener('wildtrack:drive-history-required', event); }
  });
  it('does not signal an unrelated authorization failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Workspace is not assigned.' }), { status: 403 }));
    const event = vi.fn();
    window.addEventListener('wildtrack:drive-history-required', event);
    try {
      await expect(request('/workspace/private')).rejects.toMatchObject({ status: 403, message: 'Workspace is not assigned.' });
      expect(event).not.toHaveBeenCalled();
    } finally { window.removeEventListener('wildtrack:drive-history-required', event); }
  });
  it('uses a single combined login endpoint and sanitizes both OAuth start return destinations', () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { pathname: '/workspace', search: '?section=it&driveHistory=error', assign } });
    startGoogleSignIn('/w/section-a/submit/srs?team=4&driveHistory=error');
    expect(assign).toHaveBeenLastCalledWith('/api/auth/google/start?returnTo=%2Fw%2Fsection-a%2Fsubmit%2Fsrs%3Fteam%3D4');
    startGoogleSignIn('//example.test/');
    expect(assign).toHaveBeenLastCalledWith('/api/auth/google/start?returnTo=%2Fstudent');
    startDriveHistoryConsent();
    expect(assign).toHaveBeenLastCalledWith('/api/drive-history/auth/start?returnTo=%2Fworkspace%3Fsection%3Dit');
  });
});
