import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { AdviserViewPage } from './AdviserViewPage.jsx';

const workflow = vi.hoisted(() => ({
  state: null,
  markAccepted: vi.fn(),
  revokeAcceptance: vi.fn(),
  saveFeedback: vi.fn(),
  runDocumentCheck: vi.fn(),
  runDocumentChecks: vi.fn()
}));

vi.mock('../app/WorkflowContext.jsx', () => ({
  useWorkflow: () => workflow
}));

const TEAM_A = '2526-sem2-it332-01';
const TEAM_B = '2526-sem2-it332-02';

function createState({ conflicting = false, accepted = false } = {}) {
  return {
    students: [
      { studentNumber: '22-1001-001', name: 'ALPHA, ANA', teamCode: TEAM_A, memberNumber: 1, adviser: 'Dr. Elena Mercado' },
      { studentNumber: '22-1002-002', name: 'BETA, BEN', teamCode: TEAM_A, memberNumber: 2, adviser: 'Dr. Elena Mercado' },
      { studentNumber: '22-2001-001', name: 'GAMMA, GIO', teamCode: TEAM_B, memberNumber: 1, adviser: 'Prof. Adrian Flores' }
    ],
    projectMetadata: [
      { groupCode: TEAM_A, projectTitle: 'Accessible Learning Hub', softwareName: 'AccessHub', adviserName: 'Dr. Elena Mercado' },
      { groupCode: TEAM_B, projectTitle: 'Campus Queue Monitor', softwareName: 'QueueWatch', adviserName: 'Prof. Adrian Flores' }
    ],
    deliverables: [
      {
        id: 'deliv-srs',
        slug: 'srs',
        shortTitle: 'SRS',
        title: 'Software Requirements Specification',
        trackerColumn: 'SRS',
        dueAt: '2026-04-18T23:59:00+08:00',
        status: 'Published',
        fields: [{ id: 'documentPdf', type: 'drive', pdfRequired: true }]
      },
      {
        id: 'deliv-sdd',
        slug: 'sdd',
        shortTitle: 'SDD',
        title: 'Software Design Description',
        trackerColumn: 'SDD',
        dueAt: '2026-04-25T23:59:00+08:00',
        status: 'Published',
        fields: [{ id: 'documentPdf', type: 'drive', pdfRequired: true }]
      }
    ],
    attempts: [
      {
        id: 'response-a1', deliverableId: 'deliv-srs', studentNumber: '22-1001-001', studentName: 'ALPHA, ANA', teamCode: TEAM_A,
        submittedAt: '2026-04-17T09:00:00+08:00', updatedAt: '2026-04-17T09:00:00+08:00',
        values: { documentPdf: 'https://drive.google.com/file/d/shared-team-file/view' },
        reviewStatus: 'Received', fileCheckStatus: 'COMPLETED',
        documentCheck: { status: 'Current', sourceResponseUpdatedAt: '2026-04-17T09:00:00+08:00', summary: 'Readable PDF.' }
      },
      {
        id: 'response-a2', deliverableId: 'deliv-srs', studentNumber: '22-1002-002', studentName: 'BETA, BEN', teamCode: TEAM_A,
        submittedAt: '2026-04-17T10:00:00+08:00', updatedAt: '2026-04-17T10:00:00+08:00',
        values: { documentPdf: conflicting ? 'https://drive.google.com/file/d/different-team-file/view' : 'https://drive.google.com/file/d/shared-team-file/view' },
        reviewStatus: accepted ? 'Accepted' : 'Received',
        primaryStatus: accepted ? 'Accepted' : 'Received',
        acceptance: accepted ? { acceptedBy: 'Dr. Elena Mercado', acceptedByRole: 'Adviser', acceptedAt: '2026-04-17T11:00:00+08:00' } : null,
        fileCheckStatus: 'COMPLETED',
        documentCheck: { status: 'Current', sourceResponseUpdatedAt: '2026-04-17T10:00:00+08:00', summary: 'Readable PDF.' },
        aiReport: {
          status: 'Current',
          generatedAt: '2026-04-17T10:30:00+08:00',
          sourceResponseUpdatedAt: '2026-04-17T10:00:00+08:00',
          summary: 'Requirements are present, but traceability needs staff review.',
          flags: ['Traceability weak'],
          missingSections: ['Acceptance criteria'],
          suggestedAction: 'Review the requirements matrix.'
        },
        feedback: []
      },
      {
        id: 'response-b1', deliverableId: 'deliv-srs', studentNumber: '22-2001-001', studentName: 'GAMMA, GIO', teamCode: TEAM_B,
        submittedAt: '2026-04-17T12:00:00+08:00', values: { documentPdf: 'https://drive.google.com/file/d/other-team/view' }, reviewStatus: 'Received'
      }
    ]
  };
}

function renderPage(role = 'adviser') {
  localStorage.setItem('wildtrack.v2.preview-role', role);
  localStorage.setItem('wildtrack.v2.preview-adviser', 'Dr. Elena Mercado');
  return render(
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ModalsProvider>
        <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <AdviserViewPage />
        </MemoryRouter>
      </ModalsProvider>
    </MantineProvider>
  );
}

describe('adviser My advised teams review', () => {
  beforeEach(() => {
    localStorage.clear();
    workflow.state = createState();
    Object.values(workflow).filter((value) => typeof value === 'function').forEach((mock) => mock.mockReset());
    workflow.runDocumentCheck.mockResolvedValue({ ok: true });
    workflow.runDocumentChecks.mockResolvedValue({ ok: true, completed: 0, total: 0, failed: 0 });
  });

  it('limits a regular adviser to assigned teams and groups equivalent member submissions', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'My advised teams' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(TEAM_A) })).toBeInTheDocument();
    expect(screen.queryByText(TEAM_B)).not.toBeInTheDocument();
    expect(screen.getByText('2 of 2 members')).toBeInTheDocument();
    expect(screen.getByText('1 shared file')).toBeInTheDocument();
    expect(screen.getByText('SRS')).toBeInTheDocument();
  });

  it('shows conflicting member files and lets the adviser choose the current group output', () => {
    workflow.state = createState({ conflicting: true });
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('2 different files were submitted');
    const outputSelect = screen.getByRole('combobox', { name: 'Current group output' });
    expect(within(outputSelect).getAllByRole('option')).toHaveLength(2);
  });

  it('shows existing AI Review results without exposing run or rerun controls', () => {
    renderPage();

    expect(screen.getByText('Requirements are present, but traceability needs staff review.')).toBeInTheDocument();
    expect(screen.getByText(/Acceptance criteria/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Run AI Review|Rerun AI Review/i })).not.toBeInTheDocument();
  });

  it('saves student-visible feedback against the selected group output', () => {
    renderPage();

    fireEvent.change(screen.getByRole('textbox', { name: 'Feedback for student' }), {
      target: { value: 'Clarify the acceptance criteria before the next consultation.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save feedback' }));

    expect(workflow.saveFeedback).toHaveBeenCalledWith('response-a2', {
      note: 'Clarify the acceptance criteria before the next consultation.',
      author: 'Dr. Elena Mercado',
      visibility: 'Student'
    });
  });

  it('edits the current student feedback instead of rendering a message history', () => {
    workflow.state = createState();
    workflow.state.attempts.find((response) => response.id === 'response-a2').feedback = [{
      id: 'feedback-existing',
      note: 'Clarify the original acceptance criteria.',
      author: 'Dr. Elena Mercado',
      visibility: 'Student',
      createdAt: '2026-04-17T11:00:00+08:00'
    }];
    renderPage();

    const editor = screen.getByRole('textbox', { name: 'Feedback for student' });
    expect(editor).toHaveValue('Clarify the original acceptance criteria.');
    expect(screen.queryByRole('region', { name: 'Saved feedback' })).not.toBeInTheDocument();

    fireEvent.change(editor, { target: { value: 'Clarify the revised acceptance criteria.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update feedback' }));
    expect(workflow.saveFeedback).toHaveBeenCalledWith('response-a2', {
      note: 'Clarify the revised acceptance criteria.',
      author: 'Dr. Elena Mercado',
      visibility: 'Student'
    });
  });

  it('accepts and revokes the selected group output without changing duplicate member records', async () => {
    const { unmount } = renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Accept group output' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm acceptance' }));
    expect(workflow.markAccepted).toHaveBeenCalledWith('response-a2', {
      name: 'Dr. Elena Mercado',
      role: 'Adviser',
      scope: 'Group output'
    });

    unmount();
    workflow.state = createState({ accepted: true });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke acceptance' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm revoke' }));
    expect(workflow.revokeAcceptance).toHaveBeenCalledWith('response-a2');
  });
});
