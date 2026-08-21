import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { ArchivePage } from './ArchivePage.jsx';

const workflow = vi.hoisted(() => ({
  state: null,
  activeWorkspace: null,
  workspaces: [],
  archiveAttempts: vi.fn(),
  verifyArchive: vi.fn(),
  retryArchive: vi.fn(),
  refreshArchive: vi.fn()
}));

vi.mock('../app/WorkflowContext.jsx', () => ({
  useWorkflow: () => workflow
}));

const archivedAt = '2026-06-18T10:15:00+08:00';

function makeArchive(index, overrides = {}) {
  const number = index + 1;
  return {
    id: `archive-${number}`,
    attemptId: `response-${number}`,
    workspaceId: number % 2 ? 'workspace-it' : 'workspace-cs',
    workspaceName: number % 2 ? 'IT Capstone - IT332' : 'CS Capstone',
    projectTitle: `Project ${String(number).padStart(3, '0')} with a deliberately descriptive academic title`,
    softwareName: `Software ${String(number).padStart(3, '0')}`,
    teamCode: `2526-sem2-it332-${String(Math.ceil(number / 5)).padStart(2, '0')}`,
    studentName: `Student ${String(number).padStart(3, '0')}`,
    studentNumber: `23-${String(number).padStart(4, '0')}-001`,
    adviserName: number % 2 ? 'Sir Ralph Laviste' : 'Prof. Elena Mercado',
    deliverableTitle: number % 2 ? 'Software Requirements Specification' : 'Software Design Description',
    version: `v${(number % 3) + 1}`,
    archivedAt,
    filename: `2526-sem2-it332-${String(Math.ceil(number / 5)).padStart(2, '0')}-final-document-with-a-long-filename.pdf`,
    storageKey: `archive/finals/2526-sem2-it332-${String(Math.ceil(number / 5)).padStart(2, '0')}/SRS/response-${number}.pdf`,
    sha256: 'a'.repeat(64),
    sourceLink: `https://drive.google.com/file/d/archive-${number}/view`,
    storageStatus: 'Metadata only',
    integrityStatus: 'Unavailable',
    ...overrides
  };
}

function makeState(archives = [makeArchive(0)]) {
  return {
    archiveLoadStatus: 'ready',
    archiveLoadError: '',
    archiveStorage: { configured: false, provider: 'Cloudflare R2' },
    archives,
    attempts: [
      { id: 'accepted-1', reviewStatus: 'Accepted', archiveStatus: 'Not Archived', studentName: 'Ready Student 1' },
      { id: 'accepted-2', reviewStatus: 'Accepted', archiveStatus: 'Not Archived', studentName: 'Ready Student 2' }
    ]
  };
}

function pageTree(initialEntry = '/archive') {
  return (
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ModalsProvider>
        <Notifications />
        <MemoryRouter initialEntries={[initialEntry]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <ArchivePage />
        </MemoryRouter>
      </ModalsProvider>
    </MantineProvider>
  );
}

function renderPage(initialEntry = '/archive') {
  return render(pageTree(initialEntry));
}

describe('archive index', () => {
  beforeEach(() => {
    sessionStorage.clear();
    workflow.state = makeState();
    workflow.activeWorkspace = { id: 'workspace-it', name: 'IT Capstone - IT332' };
    workflow.workspaces = [workflow.activeWorkspace, { id: 'workspace-cs', name: 'CS Capstone' }];
    Object.values(workflow).forEach((value) => value?.mockReset?.());
    workflow.archiveAttempts.mockResolvedValue({ ok: true, archived: 2 });
    workflow.verifyArchive.mockResolvedValue({ ok: true });
    workflow.retryArchive.mockResolvedValue({ ok: true });
  });

  it('keeps 318 finals in one compact searchable and paged index', () => {
    workflow.state = makeState(Array.from({ length: 318 }, (_, index) => makeArchive(index)));
    const view = renderPage();

    const table = screen.getByRole('table', { name: 'Archive records' });
    expect(within(table).getAllByRole('row')).toHaveLength(51);
    expect(screen.getByText('Showing 1-50 of 318')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 7')).toBeInTheDocument();

    const search = screen.getByRole('searchbox', { name: 'Search archive' });
    search.focus();
    fireEvent.change(search, { target: { value: 'Project 318' } });
    expect(search).toHaveFocus();
    expect(screen.getByText('Showing 1-1 of 1')).toBeInTheDocument();
    expect(within(table).getByText('Software 318')).toBeInTheDocument();

    view.unmount();
    renderPage();
    expect(screen.getByRole('searchbox', { name: 'Search archive' })).toHaveValue('Project 318');
  }, 10000);

  it('filters every available archive dimension and clears the active criteria', () => {
    const target = makeArchive(1, {
      version: 'v2',
      storageStatus: 'Stored',
      integrityStatus: 'Verified',
      archivedAt: '2026-07-20T10:00:00+08:00'
    });
    workflow.state = makeState([
      makeArchive(0, { version: 'v1', integrityStatus: 'Unavailable' }),
      target
    ]);
    renderPage();

    fireEvent.change(screen.getByLabelText('Deliverable'), { target: { value: target.deliverableTitle } });
    fireEvent.change(screen.getByLabelText('Archive status'), { target: { value: 'Verified' } });
    fireEvent.click(screen.getByRole('button', { name: 'More filters' }));
    fireEvent.change(screen.getByLabelText('Workspace'), { target: { value: target.workspaceName } });
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: target.projectTitle } });
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: target.teamCode } });
    fireEvent.change(screen.getByLabelText('Student'), { target: { value: target.studentName } });
    fireEvent.change(screen.getByLabelText('Adviser'), { target: { value: target.adviserName } });
    fireEvent.change(screen.getByLabelText('Version'), { target: { value: target.version } });
    fireEvent.change(screen.getByLabelText('Archived on or after'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Archived on or before'), { target: { value: '2026-07-31' } });

    expect(screen.getByText('10 active filters')).toBeInTheDocument();
    expect(screen.getByText('Showing 1-1 of 1')).toBeInTheDocument();
    expect(screen.getByText(target.softwareName)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('Showing 1-2 of 2')).toBeInTheDocument();
  });

  it('opens one complete record at a time and keeps unavailable storage actions honest', () => {
    workflow.state = makeState([
      makeArchive(0),
      makeArchive(1, {
        storageStatus: 'Stored',
        integrityStatus: 'Verified',
        fileSha256: 'b'.repeat(64),
        downloadUrl: 'https://archive.example.edu/final.pdf'
      }),
      makeArchive(2, { storageStatus: 'Failed', integrityStatus: 'Verification failed', failureReason: 'Object upload timed out.' })
    ]);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Open Software 001 archive details' }));
    const drawer = screen.getByRole('dialog', { name: 'Archive record details' });
    expect(drawer).toHaveTextContent('Independent PDF copy not stored');
    expect(within(drawer).getByRole('button', { name: 'Download archived PDF' })).toBeDisabled();
    expect(within(drawer).getByRole('button', { name: 'Verify integrity' })).toBeDisabled();
    expect(within(drawer).getByRole('button', { name: 'Retry archive' })).toBeDisabled();
    expect(drawer).toHaveTextContent('Metadata checksum');
    expect(drawer).toHaveTextContent('Archived filenameNot created');
    expect(drawer).not.toHaveTextContent('Archive storage key');
    expect(drawer).not.toHaveTextContent('File verified');
  });


  it('enables stored-file actions and keeps storage retry separate from integrity verification', () => {
    workflow.state = {
      ...makeState([
        makeArchive(0, {
          storageStatus: 'Stored',
          integrityStatus: 'Verified',
          fileSha256: 'b'.repeat(64),
          downloadUrl: 'https://archive.example.edu/final.pdf'
        })
      ]),
      archiveStorage: { configured: true, provider: 'Cloudflare R2' }
    };
    const view = renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Open Software 001 archive details' }));
    let drawer = screen.getByRole('dialog', { name: 'Archive record details' });
    expect(within(drawer).getByRole('link', { name: 'Download archived PDF' })).toHaveAttribute('href', 'https://archive.example.edu/final.pdf');
    fireEvent.click(within(drawer).getByRole('button', { name: 'Verify integrity' }));
    expect(workflow.verifyArchive).toHaveBeenCalledWith('archive-1');

    view.unmount();
    workflow.state = {
      ...makeState([makeArchive(0, { storageStatus: 'Failed', integrityStatus: 'Unavailable' })]),
      archiveStorage: { configured: true, provider: 'Cloudflare R2' }
    };
    renderPage();
    expect(within(screen.getByRole('table', { name: 'Archive records' })).getByText('Storage failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Software 001 archive details' }));
    drawer = screen.getByRole('dialog', { name: 'Archive record details' });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Retry archive' }));
    expect(workflow.retryArchive).toHaveBeenCalledWith('archive-1');
  });
  it('confirms the exact accepted-response scope before creating archive records', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Archive accepted finals (2)' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Archive 2 accepted finals?' });
    expect(confirmation).toHaveTextContent('2 accepted responses');
    expect(confirmation).toHaveTextContent('metadata records');
    expect(confirmation).toHaveTextContent('does not create independent PDF copies');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Archive 2 finals' }));

    await waitFor(() => expect(workflow.archiveAttempts).toHaveBeenCalledWith(['accepted-1', 'accepted-2']));
  });

  it('renders complete loading, error, empty, failed, retrying, and verified states', () => {
    workflow.state = { ...makeState([]), archiveLoadStatus: 'loading' };
    const view = renderPage();
    expect(screen.getByText('Loading archive records')).toBeInTheDocument();

    workflow.state = { ...makeState([]), archiveLoadStatus: 'error', archiveLoadError: 'Archive records could not be loaded.' };
    view.rerender(pageTree());
    expect(screen.getByRole('alert', { name: 'Archive records could not be loaded' })).toHaveTextContent('Archive records could not be loaded.');

    workflow.state = makeState([]);
    view.rerender(pageTree());
    expect(screen.getByText('No final archive records yet')).toBeInTheDocument();

    workflow.state = makeState([
      makeArchive(0, { storageStatus: 'Failed', integrityStatus: 'Verification failed' }),
      makeArchive(1, { storageStatus: 'Failed', integrityStatus: 'Unavailable' }),
      makeArchive(2, { storageStatus: 'Retrying', integrityStatus: 'Pending' }),
      makeArchive(3, { storageStatus: 'Stored', integrityStatus: 'Verified', fileSha256: 'c'.repeat(64) })
    ]);
    view.rerender(pageTree());
    const table = screen.getByRole('table', { name: 'Archive records' });
    expect(within(table).getByText('Verification failed')).toBeInTheDocument();
    expect(within(table).getByText('Storage failed')).toBeInTheDocument();
    expect(within(table).getByText('Retrying')).toBeInTheDocument();
    expect(within(table).getByText('Verified')).toBeInTheDocument();
  });

  it('opens an exact archive record from a queue link', () => {
    workflow.state = makeState([makeArchive(0), makeArchive(1)]);
    renderPage('/archive?record=archive-2');

    const drawer = screen.getByRole('dialog', { name: 'Archive record details' });
    expect(drawer).toHaveTextContent('Software 002');
  });
});
