import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { ValidationStudyPage } from './ValidationStudyPage.jsx';

const workflow = vi.hoisted(() => ({ activeWorkspaceId: 'workspace-1' }));
const study = vi.hoisted(() => ({
  loadDeliverables: vi.fn(),
  loadEvidence: vi.fn(),
  downloadCsv: vi.fn()
}));

vi.mock('../app/WorkspaceSession.jsx', () => ({
  useWorkspaceSession: () => ({ activeWorkspaceId: workflow.activeWorkspaceId })
}));

vi.mock('../lib/ValidationStudyClient.js', () => ({
  loadValidationStudyDeliverables: (...args) => study.loadDeliverables(...args),
  loadValidationStudyEvidence: (...args) => study.loadEvidence(...args),
  defaultValidationStudyDeliverableId: (deliverables = []) => (
    deliverables.find(item => item.trackerColumnKey === 'Refactored SRS')?.id || deliverables[0]?.id || ''
  )
}));

vi.mock('../lib/ValidationStudyCsv.js', () => ({
  downloadValidationStudyCsv: (...args) => study.downloadCsv(...args)
}));

const evidenceByDeliverable = {
  'srs-runtime-id': {
    deliverableId: 'srs-runtime-id',
    deliverableTitle: 'Refactored SRS',
    trackerColumnKey: 'Refactored SRS',
    validationStepFieldKey: 'validationStep',
    validationStepFieldLabel: 'Validation Step',
    artifactFieldKey: 'documentPdf',
    artifactFieldLabel: 'Refactored SRS PDF Link',
    counts: { uniqueCurrentResponses: 3, uniqueCurrentStudents: 3, t1Observed: 3, t2Complete: 2, passingBoth: 1 },
    warnings: [],
    limitations: ['Rejected blank-link attempts require task-log corroboration.'],
    responses: [{
      responseId: 'response-1',
      studentNumber: '26-0001',
      studentName: 'Passing Student',
      teamCode: 'TEAM-01',
      currentRevision: 2,
      submittedAt: '2026-09-19T01:00:00Z',
      updatedAt: '2026-09-19T01:05:00Z',
      validationStepValue: 'Revised submission',
      artifactValue: 'https://drive.google.com/file/d/stable/view',
      checks: {
        initialSubmissionSeen: true,
        initialArtifactPresent: true,
        revisedSubmissionCurrent: true,
        currentArtifactPresent: true,
        sameResponse: true,
        revisionIncreased: true,
        materialEditHistoryPresent: true,
        pdfUnchanged: true,
        nonDesignatedValuesPreserved: true,
        overallPass: true
      },
      history: [{
        revision: 1,
        createdAt: '2026-09-19T01:02:00Z',
        validationStepValue: 'Initial submission',
        artifactValue: 'https://drive.google.com/file/d/stable/view'
      }]
    }]
  },
  'mvp-runtime-id': {
    deliverableId: 'mvp-runtime-id',
    deliverableTitle: 'MVP Validation',
    trackerColumnKey: 'MVP Validation',
    validationStepFieldLabel: null,
    artifactFieldLabel: 'Framework PDF',
    counts: { uniqueCurrentResponses: 0, uniqueCurrentStudents: 0, t1Observed: 0, t2Complete: 0, passingBoth: 0 },
    warnings: ['No Validation Step field was detected for this deliverable. T1/T2 state cannot be inferred.'],
    limitations: [],
    responses: []
  }
};

function renderPage() {
  return render(
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <ValidationStudyPage />
      </MemoryRouter>
    </MantineProvider>
  );
}

describe('Validation Study page', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    workflow.activeWorkspaceId = 'workspace-1';
    study.downloadCsv.mockReset();
    study.loadDeliverables.mockReset().mockResolvedValue([
      { id: 'mvp-runtime-id', trackerColumnKey: 'MVP Validation', title: 'MVP Validation' },
      { id: 'srs-runtime-id', trackerColumnKey: 'Refactored SRS', title: 'Refactored SRS' }
    ]);
    study.loadEvidence.mockReset().mockImplementation(async (_workspaceId, deliverableId) => evidenceByDeliverable[deliverableId]);
  });

  it('preselects Refactored SRS and shows counts, checks, and revision evidence', async () => {
    renderPage();

    await waitFor(() => expect(study.loadEvidence).toHaveBeenCalledWith('workspace-1', 'srs-runtime-id'));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Study deliverable' })).toHaveValue('Refactored SRS'));
    expect(screen.getByText('Current saved responses (unscored)').parentElement).toHaveTextContent('3');
    expect(screen.getByText('Students with current response (not verified participants)').parentElement).toHaveTextContent('3');
    expect(screen.getByText('Old T1 observed').parentElement).toHaveTextContent('3');
    expect(screen.getByText('Old T2 complete').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Old T1+T2 passed').parentElement).toHaveTextContent('1');

    const table = screen.getByRole('table', { name: 'Validation Study evidence table' });
    expect(within(table).getByText('Passing Student')).toBeInTheDocument();
    expect(within(table).getByText('Revised submission')).toBeInTheDocument();
    expect(within(table).getByText('Old T1+T2 pass (not current Goal 3)')).toBeInTheDocument();
    expect(screen.getByText(/No student is required to revise solely/)).toBeInTheDocument();
    expect(within(table).getAllByText('Pass').length).toBeGreaterThan(0);
    fireEvent.click(within(table).getByText('1 historical revision'));
    expect(within(table).getByText('Initial submission')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('@example.test');
    expect(document.body).not.toHaveTextContent('googleSubject');
  });

  it('supports another deliverable selection and exports the currently loaded evidence', async () => {
    renderPage();
    await screen.findByText('Passing Student');

    const selector = screen.getByRole('textbox', { name: 'Study deliverable' });
    fireEvent.click(selector);
    fireEvent.click(await screen.findByRole('option', { name: 'MVP Validation', hidden: true }));
    await waitFor(() => expect(study.loadEvidence).toHaveBeenCalledWith('workspace-1', 'mvp-runtime-id'));
    expect(await screen.findByText(/No Validation Step field was detected/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Export historical CSV' }));
    expect(study.downloadCsv).toHaveBeenCalledWith(evidenceByDeliverable['mvp-runtime-id']);
  });
});
