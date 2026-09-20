import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { SubmittedFileHistory } from './SubmittedFileHistory.jsx';

const getSubmittedFileHistory = vi.fn();
const startDriveHistoryConsent = vi.fn();
vi.mock('../../lib/api.js', () => ({
  getSubmittedFileHistory: (...args) => getSubmittedFileHistory(...args),
  startDriveHistoryConsent: (...args) => startDriveHistoryConsent(...args)
}));

const target = { workspaceId: 'workspace-1', responseId: 'owned-response', fieldId: 'exact-pdf-field' };
function renderHistory(props = {}) {
  return render(<MantineProvider theme={wildTrackTheme} forceColorScheme="light">
    <SubmittedFileHistory {...target} {...props} />
  </MantineProvider>);
}

const firstPage = {
  sourceLabel: 'Google Drive revision metadata',
  status: 'AVAILABLE',
  coverageMessage: 'Source file metadata is limited to this submitted PDF.',
  historyMayBeIncomplete: true,
  revisions: [
    { id: 'r1', modifiedTime: '2026-09-19T09:00:00+08:00', mimeType: 'application/pdf', size: 4096,
      modifiedBy: 'Restricted Editor', modifiedByEmail: 'editor.secret@example.test', ownerEmail: 'owner.secret@example.test' }
  ],
  nextPageToken: 'opaque-backend-token'
};

describe('SubmittedFileHistory', () => {
  beforeEach(() => {
    getSubmittedFileHistory.mockReset();
    startDriveHistoryConsent.mockReset();
  });

  it('paginates only the exact submitted response and field and keeps opaque tokens out of the UI', async () => {
    getSubmittedFileHistory.mockResolvedValueOnce(firstPage).mockResolvedValueOnce({
      ...firstPage,
      revisions: [{ id: 'r2', modifiedTime: '2026-09-18T12:00:00+08:00', mimeType: 'application/pdf', size: 3072 }],
      nextPageToken: null
    }).mockResolvedValueOnce(firstPage);
    renderHistory({ audience: 'staff' });
    expect(await screen.findByRole('group', { name: 'Drive revision 1 on page 1' })).toHaveTextContent('Restricted Editor');
    expect(getSubmittedFileHistory).toHaveBeenCalledWith('workspace-1', 'owned-response', 'exact-pdf-field', '');
    expect(screen.queryByText('opaque-backend-token')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByRole('group', { name: 'Drive revision 1 on page 2' })).toHaveTextContent('3.0 KB');
    expect(getSubmittedFileHistory).toHaveBeenCalledWith('workspace-1', 'owned-response', 'exact-pdf-field', 'opaque-backend-token');
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(await screen.findByRole('group', { name: 'Drive revision 1 on page 1' })).toHaveTextContent('4.0 KB');
    expect(getSubmittedFileHistory).toHaveBeenLastCalledWith('workspace-1', 'owned-response', 'exact-pdf-field', '');
  });

  it('never renders owner or editor identities for students, even if backend includes them', async () => {
    getSubmittedFileHistory.mockResolvedValue(firstPage);
    const { container } = renderHistory({ audience: 'student', observedHistory: {
      observations: [{ modifiedBy: 'observed.secret@example.test', firstObservedAt: '2026-09-19T09:00:00+08:00' }]
    } });
    expect(await screen.findByRole('group', { name: 'Drive revision 1 on page 1' })).toHaveTextContent('4.0 KB');
    expect(container.textContent).not.toMatch(/editor\.secret|owner\.secret|observed\.secret|Restricted Editor/i);
    expect(screen.queryByLabelText('WildTrack observations')).not.toBeInTheDocument();
    expect(screen.getByText(/history can be incomplete/i)).toBeInTheDocument();
  });

  it('explains absent consent and offers it without browsing Drive', async () => {
    getSubmittedFileHistory.mockResolvedValue({ status: 'NOT_CONNECTED', revisions: [] });
    renderHistory({ audience: 'student' });
    expect(await screen.findByText(/Drive metadata permission has not been granted/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Allow read-only Drive metadata' }));
    expect(startDriveHistoryConsent).toHaveBeenCalledTimes(1);
    expect(getSubmittedFileHistory).toHaveBeenCalledTimes(1);
  });

  it('drops a late response when the selected file changes', async () => {
    let resolveFirst;
    getSubmittedFileHistory.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ ...firstPage, revisions: [{ id: 'only-second-file', modifiedTime: '2026-09-19T09:00:00+08:00' }] });
    const { rerender } = renderHistory();
    rerender(<MantineProvider theme={wildTrackTheme} forceColorScheme="light"><SubmittedFileHistory {...target} fieldId="other-field" /></MantineProvider>);
    await waitFor(() => expect(getSubmittedFileHistory).toHaveBeenCalledWith('workspace-1', 'owned-response', 'other-field', ''));
    resolveFirst(firstPage);
    expect(await screen.findByRole('group', { name: 'Drive revision 1 on page 1' })).toBeInTheDocument();
    expect(screen.queryByText('Restricted Editor')).not.toBeInTheDocument();
  });
});
