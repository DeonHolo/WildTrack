import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { SubmittedFileHistory } from './SubmittedFileHistory.jsx';

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { expect(fetchMock).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
const target = { workspaceId: 'workspace-1', responseId: 'owned-response', fieldId: 'exact-pdf-field' };
const observedHistory = { observations: [
  { changeType: 'FIRST_OBSERVED', firstObservedAt: '2026-09-01T09:00:00+08:00',
    contentIdentifier: 'recorded-content-1', driveOwner: 'Recorded Owner (owner.secret@example.test)',
    modifiedBy: 'Recorded Editor (editor.secret@example.test)' },
  { changeType: 'CONTENT_CHANGED', firstObservedAt: '2026-09-05T09:00:00+08:00',
    driveModifiedTime: '2026-09-05T08:00:00+08:00',
    driveOwnerStudent: { studentName: 'PRIVATE OWNER STUDENT', email: 'student.owner@example.test' },
    modifiedByStudent: { studentName: 'PRIVATE EDITOR STUDENT', email: 'student.editor@example.test' } },
  { changeType: 'METADATA_CHANGED', firstObservedAt: '2026-09-03T09:00:00+08:00',
    modifiedByEmail: 'observed.secret@example.test' },
  { changeType: 'SOURCE_CHANGED', firstObservedAt: '2026-09-04T09:00:00+08:00' }
] };
const legacyGoogleHistory = { status: 'AVAILABLE',
  revisions: [{ id: 'legacy-revision', modifiedBy: 'Legacy Google Editor', modifiedByEmail: 'legacy.secret@example.test' }],
  fileMetadata: { driveOwner: 'Legacy Google Owner' }, nextPageToken: 'opaque-backend-token' };
function renderHistory(props = {}) {
  return render(<MantineProvider theme={wildTrackTheme} forceColorScheme="light">
    <SubmittedFileHistory {...target} {...props} />
  </MantineProvider>);
}

describe('SubmittedFileHistory recorded checks', () => {
  it('keeps saved checks newest first, their count and earlier checks', () => {
    renderHistory({ observedHistory });
    expect(screen.getByText('4 entries')).toBeVisible();
    const checks = screen.getByRole('list', { name: 'Recorded file checks' });
    expect(within(checks).getAllByRole('heading').map(heading => heading.textContent))
      .toEqual(['Content changed', 'Submitted file changed', 'File details changed']);
    const earlier = screen.getByText('Earlier checks (1)').closest('details');
    expect(earlier).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Earlier checks (1)'));
    expect(earlier).toHaveAttribute('open');
    expect(screen.getByRole('list', { name: 'Earlier recorded file checks' })).toHaveTextContent('First recorded');
  });

  it('retains recorded identities and technical records for staff', () => {
    renderHistory({ observedHistory });
    const checks = screen.getByRole('list', { name: 'Recorded file checks' });
    expect(checks).toHaveTextContent('PRIVATE EDITOR STUDENT');
    expect(checks).toHaveTextContent('student.editor@example.test');
    const technical = screen.getByText('Technical record details').closest('details');
    fireEvent.click(screen.getByText('Technical record details'));
    expect(technical).toHaveAttribute('open');
    expect(technical).toHaveTextContent('recorded-content-1');
    expect(technical).toHaveTextContent('Recorded Owner');
  });

  it('shows student checks without any owner/editor identities or technical records', () => {
    const { container } = renderHistory({ audience: 'student', observedHistory });
    expect(screen.getByRole('list', { name: 'Recorded file checks' })).toHaveTextContent('Content changed');
    expect(screen.getByText('4 entries')).toBeVisible();
    fireEvent.click(screen.getByText('Earlier checks (1)'));
    expect(screen.getByRole('list', { name: 'Earlier recorded file checks' })).toHaveTextContent('First recorded');
    expect(container.innerHTML).not.toMatch(/owner\.secret|editor\.secret|observed\.secret|student\.owner|student\.editor|Recorded Owner|Recorded Editor|PRIVATE OWNER|PRIVATE EDITOR/);
    expect(screen.queryByText('Technical record details')).not.toBeInTheDocument();
    expect(screen.queryByText('Modified by')).not.toBeInTheDocument();
  });

  it.each(['staff', 'student'])('ignores old delegated revisions and setup/consent UI for %s', audience => {
    renderHistory({ audience, observedHistory, initialHistory: legacyGoogleHistory });
    expect(screen.getByRole('list', { name: 'Recorded file checks' })).toHaveTextContent('Content changed');
    expect(screen.queryByRole('region', { name: 'Google Drive revision metadata' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Google Drive edits|connection needs setup|Drive edit history unavailable|Legacy Google|legacy\.secret|opaque-backend-token/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Connect Drive|Refresh history|Next page|Previous page/ })).not.toBeInTheDocument();
  });

  it.each(['staff', 'student'])('explains empty recorded history without Google setup for %s', audience => {
    renderHistory({ audience });
    expect(screen.getByText('No recorded checks yet. A completed Document Check records the file state here.')).toBeVisible();
    expect(screen.queryByText(/connection needs setup|authorize|permission|Google Drive edits/i)).not.toBeInTheDocument();
  });

  it('shows only the selected file’s supplied records when the target changes', () => {
    const { rerender } = renderHistory({ observedHistory });
    rerender(<MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <SubmittedFileHistory {...target} fieldId="other-field"
        observedHistory={{ observations: [{ changeType: 'FIRST_OBSERVED', firstObservedAt: '2026-09-06T09:00:00+08:00' }] }} />
    </MantineProvider>);
    expect(screen.getByText('1 entry')).toBeVisible();
    expect(screen.getByRole('list', { name: 'Recorded file checks' })).toHaveTextContent('First recorded');
    expect(screen.queryByText('Content changed')).not.toBeInTheDocument();
    expect(screen.queryByText('Earlier checks (1)')).not.toBeInTheDocument();
  });
});
