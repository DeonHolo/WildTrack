import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { ReviewPage } from './ReviewPage.jsx';

const workflow = vi.hoisted(() => ({
  state: null,
  runDocumentCheck: vi.fn(),
  runDocumentChecks: vi.fn(),
  runAiReview: vi.fn(),
  markAccepted: vi.fn(),
  revokeAcceptance: vi.fn(),
  archiveAttempt: vi.fn()
}));

vi.mock('../app/WorkflowContext.jsx', () => ({
  useWorkflow: () => workflow
}));

const checkedAt = '2026-04-20T10:00:00+08:00';

function currentDocumentCheck(sourceResponseUpdatedAt, overrides = {}) {
  return {
    status: 'Current',
    checkedAt,
    sourceResponseUpdatedAt,
    summary: 'The PDF opens and contains readable content, but the official template comparison needs staff attention.',
    redFlags: [],
    missingSections: [],
    metadata: {
      name: 'submission.pdf',
      mimeType: 'application/pdf',
      canDownload: true,
      size: 124000,
      modifiedTime: checkedAt
    },
    document: { readable: true, pageCount: 18, extractedCharacterCount: 18420 },
    templateComparison: { available: true, templateCoverage: 0.82, addedContentRatio: 0.67, unchangedInstructionCount: 2 },
    ...overrides
  };
}

function createState() {
  const murielSavedAt = '2026-04-19T09:10:00+08:00';
  const ronSavedAt = '2026-04-19T11:04:00+08:00';
  const markSavedAt = '2026-04-18T16:30:00+08:00';
  return {
    trackerColumns: [
      { id: 'column-srs', key: 'SRS', label: 'SRS', active: true, order: 1 },
      { id: 'column-sdd', key: 'SDD', label: 'SDD', active: true, order: 2 }
    ],
    students: [
      { id: 'student-1', studentNumber: '23-1001-001', name: 'Pacio, Muriel D.', teamCode: '2526-sem2-it332-01', memberNumber: 1 },
      { id: 'student-2', studentNumber: '23-1001-002', name: 'Taghoy, Ron Luigi F.', teamCode: '2526-sem2-it332-41', memberNumber: 2 },
      { id: 'student-3', studentNumber: '23-1001-003', name: 'Barangan, Mark Lorenz L.', teamCode: '2526-sem2-it332-07', memberNumber: 3 },
      { id: 'student-4', studentNumber: '23-1001-004', name: 'Lim, Michelu Tia A.', teamCode: '2526-sem2-it332-01', memberNumber: 4 }
    ],
    projectMetadata: [
      { groupCode: '2526-sem2-it332-41', projectTitle: 'Capstone Review Workspace', softwareName: 'WildTrack' }
    ],
    deliverables: [
      {
        id: 'deliverable-srs',
        slug: 'week-9-srs',
        title: 'Software Requirements Specification',
        shortTitle: 'SRS',
        trackerColumn: 'SRS',
        dueAt: '2026-04-18T23:59:00+08:00',
        status: 'Published',
        fields: [{ id: 'documentPdf', label: 'PDF Drive Link', pdfRequired: true }]
      },
      {
        id: 'deliverable-sdd',
        slug: 'week-10-sdd',
        title: 'Software Design Description',
        shortTitle: 'SDD',
        trackerColumn: 'SDD',
        dueAt: '2026-04-25T23:59:00+08:00',
        status: 'Published',
        fields: [{ id: 'documentPdf', label: 'PDF Drive Link', pdfRequired: true }]
      }
    ],
    attempts: [
      {
        id: 'response-muriel-srs',
        deliverableId: 'deliverable-srs',
        studentNumber: '23-1001-001',
        studentName: 'Pacio, Muriel D.',
        teamCode: '2526-sem2-it332-01',
        submittedAt: murielSavedAt,
        updatedAt: murielSavedAt,
        values: { documentPdf: 'https://drive.google.com/file/d/muriel-srs/view' },
        reviewStatus: 'Received',
        primaryStatus: 'Received',
        archiveStatus: 'Not Archived',
        fileCheckStatus: 'Not checked',
        flags: ['Received']
      },
      {
        id: 'response-ron-srs',
        deliverableId: 'deliverable-srs',
        studentNumber: '23-1001-002',
        studentName: 'Taghoy, Ron Luigi F.',
        teamCode: '2526-sem2-it332-41',
        submittedAt: ronSavedAt,
        updatedAt: ronSavedAt,
        values: { documentPdf: 'https://drive.google.com/file/d/ron-srs/view' },
        reviewStatus: 'Needs Review',
        primaryStatus: 'Needs Review',
        archiveStatus: 'Not Archived',
        fileCheckStatus: 'COMPLETED',
        flags: ['Template-like', 'Template Headings Missing'],
        documentCheck: currentDocumentCheck(ronSavedAt, {
          summary: 'This is a deliberately long Document Check summary that should remain in the selected response details instead of stretching every row in the submissions table.',
          redFlags: ['Template-like'],
          missingSections: ['Scope', 'Definitions', 'System interfaces', 'Traceability matrix']
        }),
        aiReport: {
          status: 'Current',
          generatedAt: checkedAt,
          sourceResponseUpdatedAt: ronSavedAt,
          summary: 'The submission describes its requirements, but traceability and interface constraints require manual review.',
          flags: ['Weak traceability'],
          missingSections: ['Requirements traceability matrix'],
          suggestedAction: 'Ask the team to connect each requirement to its source and design element.'
        }
      },
      {
        id: 'response-mark-srs',
        deliverableId: 'deliverable-srs',
        studentNumber: '23-1001-003',
        studentName: 'Barangan, Mark Lorenz L.',
        teamCode: '2526-sem2-it332-07',
        submittedAt: markSavedAt,
        updatedAt: markSavedAt,
        values: { documentPdf: 'https://drive.google.com/file/d/mark-srs/view' },
        reviewStatus: 'Accepted',
        primaryStatus: 'Accepted',
        archiveStatus: 'Archived',
        fileCheckStatus: 'COMPLETED',
        flags: ['Accepted'],
        documentCheck: currentDocumentCheck(markSavedAt),
        acceptance: { acceptedBy: 'Sir Ralph Laviste', acceptedByRole: 'Teacher/Admin', acceptedAt: checkedAt }
      },
      {
        id: 'response-muriel-sdd',
        deliverableId: 'deliverable-sdd',
        studentNumber: '23-1001-001',
        studentName: 'Pacio, Muriel D.',
        teamCode: '2526-sem2-it332-01',
        submittedAt: checkedAt,
        updatedAt: checkedAt,
        values: { documentPdf: 'https://drive.google.com/file/d/muriel-sdd/view' },
        reviewStatus: 'Received',
        primaryStatus: 'Received',
        archiveStatus: 'Not Archived',
        fileCheckStatus: 'Not checked',
        flags: ['Received']
      }
    ]
  };
}

function pageTree(initialEntry = '/review') {
  return (
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ModalsProvider>
        <Notifications />
        <MemoryRouter initialEntries={[initialEntry]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <ReviewPage />
        </MemoryRouter>
      </ModalsProvider>
    </MantineProvider>
  );
}

function renderPage(initialEntry = '/review') {
  return render(pageTree(initialEntry));
}

describe('deliverable-first submission review', () => {
  beforeEach(() => {
    workflow.state = createState();
    Object.values(workflow).forEach((value) => value?.mockReset?.());
    workflow.runDocumentCheck.mockResolvedValue({ ok: true });
    workflow.runDocumentChecks.mockImplementation(async (ids, { onProgress } = {}) => {
      onProgress?.({ completed: ids.length, total: ids.length });
      return { completed: ids.length, total: ids.length, failed: 0 };
    });
    workflow.runAiReview.mockResolvedValue({ ok: false, unavailable: true });
    workflow.archiveAttempt.mockResolvedValue({ ok: true, archived: 1 });
  });

  it('starts with a compact deliverable queue and only pending SRS responses', () => {
    renderPage();

    const queue = screen.getByRole('table', { name: 'Deliverables awaiting review' });
    const srsRow = within(queue).getByRole('button', { name: 'Open SRS review' }).closest('tr');
    expect(within(srsRow).getAllByRole('cell').map((cell) => cell.textContent.trim())).toEqual([
      'SRSSoftware Requirements Specification',
      'Apr 18, 2026',
      '4',
      '3',
      '1',
      '1',
      '2',
      '1',
      '1'
    ]);

    const submissions = screen.getByRole('table', { name: 'SRS submissions' });
    expect(within(submissions).getByText('Pacio, Muriel D.')).toBeInTheDocument();
    expect(within(submissions).getByText('Taghoy, Ron Luigi F.')).toBeInTheDocument();
    expect(within(submissions).queryByText('Barangan, Mark Lorenz L.')).not.toBeInTheDocument();
  });

  it('keeps every deliverable chevron at one fixed size regardless of label length', () => {
    renderPage();

    const chevrons = document.querySelectorAll('.wt-review-deliverable-chevron');
    expect(chevrons.length).toBeGreaterThan(1);
    chevrons.forEach((chevron) => {
      expect(chevron).toHaveClass('wt-review-deliverable-chevron');
      expect(chevron).toHaveAttribute('width', '16');
      expect(chevron).toHaveAttribute('height', '16');
    });
  });

  it('keeps long reports in a selected-response drawer and preserves selection while searching', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review Taghoy, Ron Luigi F. response' }));

    const drawer = screen.getByRole('dialog', { name: 'Review Taghoy, Ron Luigi F.' });
    expect(drawer).toHaveTextContent('This is a deliberately long Document Check summary');
    expect(drawer).toHaveTextContent('The submission describes its requirements');
    expect(within(drawer).getByRole('link', { name: 'Open submitted file' })).toHaveAttribute(
      'href',
      'https://drive.google.com/file/d/ron-srs/view'
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Search submissions' }), { target: { value: 'Ron Luigi' } });
    expect(screen.getByRole('dialog', { name: 'Review Taghoy, Ron Luigi F.' })).toBeInTheDocument();
  });

  it('checks selected responses as a non-blocking batch and reports completion', async () => {
    workflow.runDocumentChecks.mockImplementationOnce(async (ids, { onProgress } = {}) => {
      onProgress?.({ completed: ids.length, total: ids.length });
      return {
        completed: ids.length,
        total: ids.length,
        failed: 1,
        results: [
          { attemptId: 'response-ron-srs', ok: false, error: 'Download is disabled.' },
          { attemptId: 'response-muriel-srs', ok: true }
        ]
      };
    });
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible responses' }));
    expect(screen.getByText('2 responses selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Check selected' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Check 2 selected documents?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start Document Check' }));

    await waitFor(() => expect(workflow.runDocumentChecks).toHaveBeenCalledWith(
      ['response-ron-srs', 'response-muriel-srs'],
      expect.objectContaining({ onProgress: expect.any(Function) })
    ));
    const completionAlert = await screen.findByRole('status');
    expect(completionAlert).toHaveTextContent('2 of 2 completed | 1 could not be checked');
    expect(completionAlert).toHaveTextContent('Taghoy, Ron Luigi F.: Download is disabled.');
  });

  it('checks every unchecked response for the selected deliverable in one action', async () => {
    const base = createState();
    const unchecked = Array.from({ length: 62 }, (_, index) => ({
      id: `unchecked-${index + 1}`,
      deliverableId: 'deliverable-srs',
      studentNumber: `23-9000-${String(index + 1).padStart(3, '0')}`,
      studentName: `Queue Student ${index + 1}`,
      teamCode: `2526-sem2-it332-${String(Math.floor(index / 5) + 1).padStart(2, '0')}`,
      submittedAt: '2026-04-18T12:00:00+08:00',
      updatedAt: `2026-04-18T12:${String(index % 60).padStart(2, '0')}:00+08:00`,
      values: { documentPdf: `https://drive.google.com/file/d/unchecked-${index + 1}/view` },
      reviewStatus: 'Received',
      primaryStatus: 'Received',
      archiveStatus: 'Not Archived',
      fileCheckStatus: 'Not checked',
      flags: ['Received']
    }));
    workflow.state = {
      ...base,
      students: [
        ...base.students,
        ...unchecked.map((response, index) => ({
          id: `queue-student-${index + 1}`,
          studentNumber: response.studentNumber,
          name: response.studentName,
          teamCode: response.teamCode,
          memberNumber: (index % 5) + 1
        }))
      ],
      attempts: [...base.attempts, ...unchecked]
    };
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Check all unchecked (63)' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Check all 63 unchecked documents?' });
    expect(confirmation).not.toHaveTextContent(/three PDFs|archive/i);
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start Document Check' }));

    await waitFor(() => expect(workflow.runDocumentChecks).toHaveBeenCalledTimes(1));
    const requestedIds = workflow.runDocumentChecks.mock.calls[0][0];
    expect(requestedIds).toHaveLength(63);
    expect(requestedIds).toContain('response-muriel-srs');
    expect(requestedIds).toContain('unchecked-62');
  });

  it('keeps 318 responses in one compact submissions table instead of creating response cards', () => {
    const students = Array.from({ length: 318 }, (_, index) => ({
      id: `student-${index + 1}`,
      studentNumber: `23-${String(index + 1).padStart(4, '0')}-001`,
      name: `Student ${String(index + 1).padStart(3, '0')}`,
      teamCode: `2526-sem2-it332-${String(Math.floor(index / 5) + 1).padStart(2, '0')}`,
      memberNumber: (index % 5) + 1
    }));
    const deliverable = createState().deliverables[0];
    workflow.state = {
      ...createState(),
      students,
      deliverables: [deliverable],
      attempts: students.map((student, index) => ({
        id: `response-${index + 1}`,
        deliverableId: deliverable.id,
        studentNumber: student.studentNumber,
        studentName: student.name,
        teamCode: student.teamCode,
        submittedAt: '2026-04-18T12:00:00+08:00',
        updatedAt: `2026-04-18T12:${String(index % 60).padStart(2, '0')}:00+08:00`,
        values: { documentPdf: `https://drive.google.com/file/d/response-${index + 1}/view` },
        reviewStatus: 'Received',
        primaryStatus: 'Received',
        archiveStatus: 'Not Archived',
        fileCheckStatus: 'Not checked',
        flags: ['Received']
      }))
    };

    renderPage();
    const table = screen.getByRole('table', { name: 'SRS submissions' });
    expect(within(table).getAllByRole('row')).toHaveLength(51);
    expect(screen.getByText('Showing 1-50 of 318')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 7')).toBeInTheDocument();
  });

  it('removes an accepted response from the active queue and confirms one archive record honestly', async () => {
    const view = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Review Pacio, Muriel D. response' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Review Pacio, Muriel D.' })).getByRole('button', { name: 'Accept response' }));
    expect(workflow.markAccepted).toHaveBeenCalledWith('response-muriel-srs', expect.objectContaining({ role: 'Teacher/Admin' }));

    workflow.state = {
      ...workflow.state,
      attempts: workflow.state.attempts.map((attempt) => attempt.id === 'response-muriel-srs'
        ? { ...attempt, reviewStatus: 'Accepted', primaryStatus: 'Accepted', flags: [...attempt.flags, 'Accepted'] }
        : attempt)
    };
    view.rerender(pageTree());
    expect(within(screen.getByRole('table', { name: 'SRS submissions' })).queryByText('Pacio, Muriel D.')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Review Pacio, Muriel D.' })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog', { name: 'Review Pacio, Muriel D.' })).getByRole('button', { name: 'Archive response' })).toBeEnabled();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Review Pacio, Muriel D.' })).getByRole('button', { name: 'Archive response' }));
    const archiveConfirmation = await screen.findByRole('dialog', { name: 'Archive this accepted response?' });
    expect(archiveConfirmation).toHaveTextContent('one archive metadata record');
    expect(archiveConfirmation).toHaveTextContent('Independent PDF storage is not connected yet');
    fireEvent.click(within(archiveConfirmation).getByRole('button', { name: 'Archive response' }));
    await waitFor(() => expect(workflow.archiveAttempt).toHaveBeenCalledWith('response-muriel-srs'));

    fireEvent.click(screen.getByRole('button', { name: 'Accepted' }));
    expect(within(screen.getByRole('table', { name: 'SRS submissions' })).getByText('Pacio, Muriel D.')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'SRS submissions' })).getByText('Barangan, Mark Lorenz L.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    expect(within(screen.getByRole('table', { name: 'SRS submissions' })).getByText('Barangan, Mark Lorenz L.')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'SRS submissions' })).queryByText('Pacio, Muriel D.')).not.toBeInTheDocument();
  });

  it('counts received students uniquely so duplicate responses do not hide missing work', () => {
    const duplicate = {
      ...workflow.state.attempts.find((attempt) => attempt.id === 'response-muriel-srs'),
      id: 'response-muriel-srs-conflict',
      updatedAt: '2026-04-19T09:30:00+08:00'
    };
    workflow.state = { ...workflow.state, attempts: [...workflow.state.attempts, duplicate] };

    renderPage();
    const queue = screen.getByRole('table', { name: 'Deliverables awaiting review' });
    const srsRow = within(queue).getByRole('button', { name: 'Open SRS review' }).closest('tr');
    const cells = within(srsRow).getAllByRole('cell').map((cell) => cell.textContent.trim());
    expect(cells[3]).toBe('3');
    expect(cells[4]).toBe('1');
  });

  it('does not require Document Check for link-only deliverables', () => {
    const deliverable = {
      id: 'deliverable-source',
      slug: 'source-code',
      title: 'Source Code',
      shortTitle: 'SourceCode',
      trackerColumn: 'SourceCode',
      dueAt: '2026-05-30T23:59:00+08:00',
      status: 'Published',
      fields: [{ id: 'repositoryUrl', label: 'Repository link', type: 'url' }]
    };
    workflow.state = {
      ...workflow.state,
      deliverables: [...workflow.state.deliverables, deliverable],
      attempts: [...workflow.state.attempts, {
        id: 'response-muriel-source',
        deliverableId: deliverable.id,
        studentNumber: '23-1001-001',
        studentName: 'Pacio, Muriel D.',
        teamCode: '2526-sem2-it332-01',
        submittedAt: checkedAt,
        updatedAt: checkedAt,
        values: { repositoryUrl: 'https://github.com/example/project' },
        reviewStatus: 'Received',
        primaryStatus: 'Received',
        archiveStatus: 'Not Archived',
        flags: ['Received']
      }]
    };

    renderPage();
    const queue = screen.getByRole('table', { name: 'Deliverables awaiting review' });
    const sourceRow = within(queue).getByRole('button', { name: 'Open SourceCode review' }).closest('tr');
    expect(within(sourceRow).getAllByRole('cell')[5]).toHaveTextContent('0');
    fireEvent.click(within(sourceRow).getByRole('button', { name: 'Open SourceCode review' }));
    expect(within(screen.getByRole('table', { name: 'SourceCode submissions' })).getByText('Not applicable')).toBeInTheDocument();
  });

  it('opens an exact linked response in its deliverable context', () => {
    renderPage('/review?deliverable=deliverable-srs&response=response-ron-srs');

    expect(screen.getByRole('dialog', { name: 'Review Taghoy, Ron Luigi F.' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'SRS submissions' })).toBeInTheDocument();
  });
});
