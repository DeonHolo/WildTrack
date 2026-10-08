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
  downloadInitialCsv: vi.fn()
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
  downloadInitialSavedRecordCsv: (...args) => study.downloadInitialCsv(...args)
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
    initialSavedRecords: {
      scope: 'INITIAL_SAVED_RECORD_SYSTEM_AUDIT_V1',
      evaluatedAt: '2026-09-20T01:00:00Z',
      workspaceId: 'workspace-1',
      deliverableId: 'srs-runtime-id',
      candidates: 2,
      selectedRecords: 1,
      passedRecords: 0,
      failedRecords: 0,
      unverifiedRecords: 1,
      agreement: null,
      outcome: 'INCONCLUSIVE',
      selectionRule: 'Current workspace records with saved initial response',
      limitations: ['System audit only.'],
      records: [{
        responseId: 'response-1',
        studentNumber: '26-0001',
        studentName: 'Passing Student',
        teamCode: 'TEAM-01',
        studentRecordId: 'student-1',
        workspaceId: 'workspace-1',
        deliverableId: 'srs-runtime-id',
        originalSource: 'CURRENT_REVISION_1',
        originalRevision: 1,
        originalSavedAt: '2026-09-19T01:00:00Z',
        originalArtifactValue: 'https://drive.google.com/file/d/stable/view',
        rosterStudentNumber: '26-0001',
        rosterStudentName: 'Passing Student',
        rosterTeamCode: 'TEAM-01',
        studentDetails: { status: 'PASS', reason: '' },
        workspace: { status: 'PASS', reason: '' },
        deliverable: { status: 'PASS', reason: '' },
        originalVersion: { status: 'UNVERIFIED', reason: 'No prior revision evidence' },
        storedValues: { status: 'PASS', reason: '' },
        accountBinding: { status: 'UNVERIFIED', reason: 'No consent binding in audit' },
        requiredFieldsChecked: ['studentNumber', 'studentName', 'teamCode'],
        missingRequiredFieldKeys: [],
        overallStatus: 'UNVERIFIED'
      }]
    },
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
    study.downloadInitialCsv.mockReset();
    study.loadDeliverables.mockReset().mockResolvedValue([
      { id: 'mvp-runtime-id', trackerColumnKey: 'MVP Validation', title: 'MVP Validation' },
      { id: 'srs-runtime-id', trackerColumnKey: 'Refactored SRS', title: 'Refactored SRS' }
    ]);
    study.loadEvidence.mockReset().mockImplementation(async (_workspaceId, deliverableId) => evidenceByDeliverable[deliverableId]);
  });

  it('renders the scoped audit, explicit unverified checks, and no legacy T1/T2 result', async () => {
    renderPage();

    await waitFor(() => expect(study.loadEvidence).toHaveBeenCalledWith('workspace-1', 'srs-runtime-id'));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Study deliverable' })).toHaveValue('Refactored SRS'));
    expect(screen.getByText('System audit outcome: INCONCLUSIVE')).toBeInTheDocument();
    expect(screen.getByText(/INITIAL_SAVED_RECORD_SYSTEM_AUDIT_V1/)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Initial saved record audit table' });
    expect(within(table).getByText('Passing Student')).toBeInTheDocument();
    expect(within(table).getAllByText('UNVERIFIED').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Old T1|Historical T1|Revised submission/)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('@example.test');
    expect(document.body).not.toHaveTextContent('googleSubject');
  });

  it('supports another deliverable selection and exports only when the current audit exists', async () => {
    renderPage();
    await screen.findByText('Passing Student');

    const selector = screen.getByRole('textbox', { name: 'Study deliverable' });
    fireEvent.click(selector);
    fireEvent.click(await screen.findByRole('option', { name: 'MVP Validation', hidden: true }));
    await waitFor(() => expect(study.loadEvidence).toHaveBeenCalledWith('workspace-1', 'mvp-runtime-id'));
    const exportButton = screen.getByRole('button', { name: 'Export initial-record CSV (Excel)' });
    expect(exportButton).toBeDisabled();
    expect(screen.getByText(/initial-record audit unavailable/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('textbox', { name: 'Study deliverable' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Refactored SRS', hidden: true }));
    await screen.findByText('System audit outcome: INCONCLUSIVE');
    fireEvent.click(screen.getByRole('button', { name: 'Export initial-record CSV (Excel)' }));
    expect(study.downloadInitialCsv).toHaveBeenCalledWith(evidenceByDeliverable['srs-runtime-id']);
  });

  it('clears the previous audit and disables export while a new workspace-scoped evidence request is loading', async () => {
    study.loadEvidence.mockImplementation(async (_workspaceId, deliverableId) => {
      if (deliverableId === 'mvp-runtime-id') return new Promise(() => {});
      return evidenceByDeliverable[deliverableId];
    });
    renderPage();
    await screen.findByText('Passing Student');
    const selector = screen.getByRole('textbox', { name: 'Study deliverable' });
    fireEvent.click(selector);
    fireEvent.click(await screen.findByRole('option', { name: 'MVP Validation', hidden: true }));
    expect(screen.getByRole('button', { name: 'Export initial-record CSV (Excel)' })).toBeDisabled();
    expect(screen.queryByRole('table', { name: 'Initial saved record audit table' })).not.toBeInTheDocument();
  });
});
