import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { DocumentCheckDialog } from './DocumentCheckDialog.jsx';

const getSubmittedFileHistory = vi.fn();
vi.mock('../../lib/api.js', () => ({
  getSubmittedFileHistory: (...args) => getSubmittedFileHistory(...args),
  startDriveHistoryConsent: vi.fn()
}));

const fileLink = 'https://drive.google.com/file/d/this-submitted-pdf/view';
const target = { workspaceId: 'workspace-it', responseId: 'response-1', fieldId: 'pdf-field-1' };
const response = {
  id: 'response-1',
  submittedAt: '2026-09-19T08:00:00+08:00',
  updatedAt: '2026-09-19T08:00:00+08:00',
  documentCheck: {
    status: 'Current', checkedAt: '2026-09-19T09:00:00+08:00',
    sourceResponseUpdatedAt: '2026-09-19T08:00:00+08:00',
    metadata: { name: 'Submitted SRS.pdf', mimeType: 'application/pdf', canDownload: true },
    document: { readable: true, pageCount: 10 }
  }
};
const sharedHistory = {
  status: 'AVAILABLE',
  revisions: [{ id: 'revision-1', modifiedTime: '2026-09-19T11:00:00+08:00', mimeType: 'application/pdf', size: 1024, modifiedBy: 'Staff Editor', modifiedByEmail: 'editor.secret@example.test' }],
  fileMetadata: {
    createdTime: '2026-09-18T10:00:00+08:00',
    driveOwner: 'Private Owner (owner.secret@example.test)',
    lastModifiedTime: '2026-09-19T11:00:00+08:00',
    lastModifiedBy: 'Staff Editor (editor.secret@example.test)'
  },
  historyMayBeIncomplete: true
};

function show(props = {}) {
  return render(<MantineProvider theme={wildTrackTheme} forceColorScheme="light">
    <DocumentCheckDialog response={response} fileLink={fileLink} historyTarget={target}
      open onClose={vi.fn()} allowRecheck={false} {...props} />
  </MantineProvider>);
}

describe('DocumentCheck shared submitted-file metadata', () => {
  beforeEach(() => { getSubmittedFileHistory.mockReset().mockResolvedValue(sharedHistory); });

  it('fills unavailable staff facts from newly shared metadata and reuses its first history page', async () => {
    show();
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('Staff Editor (editor.secret@example.test)')).toBeInTheDocument();
    expect(within(dialog).getByText('Private Owner (owner.secret@example.test)')).toBeInTheDocument();
    expect(getSubmittedFileHistory).toHaveBeenCalledExactlyOnceWith('workspace-it', 'response-1', 'pdf-field-1');
    fireEvent.click(within(dialog).getByRole('tab', { name: 'File history' }));
    expect(await within(dialog).findByRole('group', { name: 'Drive revision 1 on page 1' })).toHaveTextContent('Staff Editor');
    expect(getSubmittedFileHistory).toHaveBeenCalledTimes(1);
  });

  it('shows students created/modified times while preventing owner/editor identity disclosure', async () => {
    show({ audience: 'student' });
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('Created time').parentElement).not.toHaveTextContent('Unavailable'));
    expect(within(dialog).getByText('Latest Drive modified (Google metadata)').parentElement).not.toHaveTextContent('Not available');
    expect(within(dialog).queryByText('Drive owner')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Last modified by')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('tab', { name: 'File history' }));
    expect(await within(dialog).findByRole('group', { name: 'Drive revision 1 on page 1' })).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/owner\.secret@example\.test|editor\.secret@example\.test|Staff Editor|Private Owner/);
    expect(getSubmittedFileHistory).toHaveBeenCalledTimes(1);
  });

  it('opens directly on file history without issuing duplicate first-page requests', async () => {
    show({ initialTab: 'history', audience: 'student' });
    expect(await screen.findByRole('group', { name: 'Drive revision 1 on page 1' })).toBeInTheDocument();
    expect(getSubmittedFileHistory).toHaveBeenCalledExactlyOnceWith('workspace-it', 'response-1', 'pdf-field-1');
  });

  it('discards late shared facts when the selected submitted response changes', async () => {
    let finishOld;
    getSubmittedFileHistory.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce({ ...sharedHistory, fileMetadata: { createdTime: '2026-09-17T10:00:00+08:00', driveOwner: 'Correct Owner' } });
    const view = show();
    view.rerender(<MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <DocumentCheckDialog response={{ ...response, id: 'response-2' }} fileLink={fileLink}
        historyTarget={{ ...target, responseId: 'response-2' }} open onClose={vi.fn()} allowRecheck={false} />
    </MantineProvider>);
    expect(await screen.findByText('Correct Owner')).toBeInTheDocument();
    finishOld(sharedHistory);
    expect(screen.queryByText('Private Owner (owner.secret@example.test)')).not.toBeInTheDocument();
  });

  it('refreshes a previously unavailable file after another submitter authorizes Google Drive', async () => {
    getSubmittedFileHistory.mockResolvedValueOnce({ status: 'NOT_CONNECTED', revisions: [], fileMetadata: null })
      .mockResolvedValueOnce(sharedHistory);
    show({ audience: 'student', initialTab: 'history' });
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('Drive metadata permission has not been granted for this file.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Refresh from Google Drive' }));
    expect(await within(dialog).findByRole('group', { name: 'Drive revision 1 on page 1' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Check result' }));
    await waitFor(() => expect(within(dialog).getByText('Created time').parentElement).not.toHaveTextContent('Unavailable'));
    expect(dialog.textContent).not.toMatch(/owner\.secret@example\.test|editor\.secret@example\.test|Staff Editor|Private Owner/);
    expect(getSubmittedFileHistory).toHaveBeenCalledTimes(2);
  });

  it('does not prefetch when Document Check is closed', () => {
    show({ open: false });
    expect(getSubmittedFileHistory).not.toHaveBeenCalled();
  });
});
