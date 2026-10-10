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
    expect(await screen.findByText(/No submitter of this file currently has usable Drive history access/i)).toBeInTheDocument();
    expect(screen.getByText(/signing into WildTrack alone does not grant this access/)).toBeInTheDocument();
    expect(screen.getByText(/Optional, read-only permission/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect Drive edit history' }));
    expect(startDriveHistoryConsent).toHaveBeenCalledTimes(1);
    expect(getSubmittedFileHistory).toHaveBeenCalledTimes(1);
  });

  it.each(['staff', 'student'])('separates unavailable server configuration from submitter consent for %s', async audience => {
    getSubmittedFileHistory.mockResolvedValue({ status: 'NOT_CONFIGURED', revisions: [] });
    renderHistory({ audience });
    expect(await screen.findByText('Drive history connection needs setup')).toBeInTheDocument();
    expect(screen.getByText(/Document Check and recorded checks still work/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect Drive edit history' })).not.toBeInTheDocument();
    expect(startDriveHistoryConsent).not.toHaveBeenCalled();
  });

  it('recognizes the previous server setup response without blaming a submitter', async () => {
    getSubmittedFileHistory.mockResolvedValue({ status: 'UNAVAILABLE', revisions: [],
      coverageMessage: 'Drive revision history is not enabled in this WildTrack environment yet. A WildTrack administrator needs to finish enabling it. Document Check remains available.' });
    renderHistory({ audience: 'student' });
    expect(await screen.findByText('Drive history connection needs setup')).toBeInTheDocument();
    expect(screen.queryByText(/finish enabling it/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect Drive edit history' })).not.toBeInTheDocument();
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

  it.each(['workspaceId', 'responseId', 'fieldId'])('resets paging and ignores the previous page reply when %s changes', async scope => {
    let resolveOldPage;
    getSubmittedFileHistory.mockResolvedValueOnce(firstPage)
      .mockImplementationOnce(() => new Promise(resolve => { resolveOldPage = resolve; }))
      .mockResolvedValueOnce({ ...firstPage, revisions: [{ id: 'new-scope', size: 8192 }], nextPageToken: null });
    const { rerender } = renderHistory();
    await screen.findByRole('group', { name: 'Drive revision 1 on page 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(getSubmittedFileHistory).toHaveBeenCalledWith(...Object.values(target), 'opaque-backend-token'));
    const newTarget = { ...target, [scope]: 'new-scoped-value' };
    rerender(<MantineProvider theme={wildTrackTheme}><SubmittedFileHistory {...newTarget} /></MantineProvider>);
    await waitFor(() => expect(getSubmittedFileHistory).toHaveBeenLastCalledWith(newTarget.workspaceId, newTarget.responseId, newTarget.fieldId, ''));
    resolveOldPage({ ...firstPage, revisions: [{ id: 'stale-scope', size: 1024 }] });
    expect(await screen.findByRole('group', { name: 'Drive revision 1 on page 1' })).toHaveTextContent('8.0 KB');
    expect(screen.queryByRole('group', { name: 'Drive revision 1 on page 2' })).not.toBeInTheDocument();
  });

  it('reuses supplied current-file metadata while keeping original check records intact', async () => {
    renderHistory({ initialHistory: { ...firstPage, fileMetadata: { driveOwner: 'Provider owner',
      lastModifiedBy: 'Provider editor', lastModifiedByStudent: { studentName: 'Roster editor', email: 'editor@example.test' } } },
      observedHistory: { observations: [{ changeType: 'FIRST_OBSERVED', firstObservedAt: '2026-09-01', driveOwner: 'Recorded owner', modifiedBy: 'Recorded editor' }] } });
    const details = screen.getByRole('region', { name: 'File details' });
    expect(await within(details).findByText('Provider owner')).toBeInTheDocument();
    expect(within(details).getByText('Roster editor')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Recorded file checks' })).toHaveTextContent('Recorded editor');
    expect(getSubmittedFileHistory).not.toHaveBeenCalled();
  });

  it('does not expose supplied current-file owner or editor metadata to students', async () => {
    const { container } = renderHistory({ audience: 'student', initialHistory: { ...firstPage,
      fileMetadata: { driveOwner: 'Private owner', lastModifiedByStudent: { studentName: 'Private student', email: 'private@example.test' } } } });
    await screen.findByRole('group', { name: 'Drive revision 1 on page 1' });
    expect(container.textContent).not.toMatch(/Private owner|Private student|private@example|Restricted Editor|editor.secret|owner.secret/);
    expect(screen.queryByRole('region', { name: 'File details' })).not.toBeInTheDocument();
  });
});
