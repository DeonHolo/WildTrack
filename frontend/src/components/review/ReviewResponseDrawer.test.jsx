import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { ReviewResponseDrawer } from './ReviewResponseDrawer.jsx';

describe('ReviewResponseDrawer submission artifacts', () => {
  it('renders only file/link artifact fields and never academic identity or ordinary response fields', async () => {
    const student = { name: 'DOE, JANE', studentNumber: '26-0001', teamCode: 'TEAM-01' };
    const deliverable = {
      id: 'deliverable-1',
      shortTitle: 'MVP',
      fields: [
        { definitionId: 'identity-number', id: 'studentNumber', label: 'Student Number', type: 'academicStudentNumber' },
        { definitionId: 'identity-name', id: 'studentName', label: 'Student Name', type: 'academicStudentName' },
        { definitionId: 'identity-team', id: 'teamCode', label: 'Team Code', type: 'academicTeamCode' },
        { definitionId: 'identity-section', id: 'section', label: 'Section', type: 'academicSection' },
        { definitionId: 'validation-step', id: 'validationStep', label: 'Validation step', type: 'multipleChoice' },
        { definitionId: 'artifact-form', id: 'validationForm', label: 'Validation Form', type: 'googleForm', documentCheckPolicy: 'OFF' },
        { definitionId: 'artifact-pdf', id: 'frameworkPdf', label: 'Framework PDF', type: 'drive', pdfRequired: true, documentCheckPolicy: 'OFF' }
      ]
    };
    const response = {
      id: 'response-1',
      teamCode: 'TEAM-01',
      submittedAt: '2026-09-19T08:00:00+08:00',
      reviewStatus: 'Received',
      values: {
        studentNumber: '26-0001',
        studentName: 'DOE, JANE',
        teamCode: 'TEAM-01',
        section: 'G7',
        validationStep: 'Initial submission',
        validationForm: 'https://docs.google.com/forms/d/e/example/viewform',
        frameworkPdf: 'https://drive.google.com/file/d/example/view'
      }
    };

    render(
      <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
        <ReviewResponseDrawer
          opened
          response={response}
          student={student}
          state={{ projectMetadata: [] }}
          deliverable={deliverable}
          onClose={vi.fn()}
        />
      </MantineProvider>
    );

    expect(await screen.findByText('Submission artifacts')).toBeInTheDocument();
    expect(screen.getByText('Validation Form')).toBeInTheDocument();
    expect(screen.getByText('Framework PDF')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'File history' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check document' })).not.toBeInTheDocument();
    expect(screen.queryByText('Student Number')).not.toBeInTheDocument();
    expect(screen.queryByText('Student Name')).not.toBeInTheDocument();
    expect(screen.queryByText('Team Code')).not.toBeInTheDocument();
    expect(screen.queryByText('Section')).not.toBeInTheDocument();
    expect(screen.queryByText('Validation step')).not.toBeInTheDocument();
  });

  it('keeps file history out of the review drawer so Document Check owns the long history view', async () => {
    const student = { name: 'DOE, JANE', studentNumber: '26-0001', teamCode: 'TEAM-01' };
    const deliverable = {
      id: 'deliverable-1', shortTitle: 'SRS',
      fields: [{ definitionId: 'artifact-pdf', id: 'frameworkPdf', label: 'Framework PDF', type: 'drive', pdfRequired: true, documentCheckPolicy: 'MANUAL' }]
    };
    const response = {
      id: 'response-1', teamCode: 'TEAM-01', submittedAt: '2026-09-19T08:00:00+08:00', reviewStatus: 'Received',
      values: { frameworkPdf: 'https://drive.google.com/file/d/example/view' },
      observedFileHistoryByField: {
        'artifact-pdf': {
          coverageMessage: 'This history contains only file states WildTrack observed when Document Check ran.',
          olderRevisionHistoryMessage: 'Older Google Drive revision history is unavailable with the current API-key connection.',
          observations: [{
            changeType: 'METADATA_CHANGED',
            firstObservedAt: '2026-09-19T08:10:00+08:00',
            lastObservedAt: '2026-09-19T08:10:00+08:00',
            driveModifiedTime: '2026-09-19T08:00:00+08:00',
            contentIdentifier: 'md5:abc123',
            modifiedBy: 'editor@example.com',
            editorMetadataSource: 'Google Drive File metadata'
          }]
        }
      }
    };

    render(
      <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
        <ReviewResponseDrawer opened response={response} student={student} state={{ projectMetadata: [] }} deliverable={deliverable} onClose={vi.fn()} />
      </MantineProvider>
    );

    expect(await screen.findByRole('button', { name: 'Check document' })).toBeInTheDocument();
    expect(screen.queryByText('WildTrack observed file history')).not.toBeInTheDocument();
    expect(screen.queryByText(/Older Google Drive revision history is unavailable/i)).not.toBeInTheDocument();
  });

  it.each([
    ['NO_GROUNDED_FINDINGS', 'The new run had no source-grounded findings.'],
    ['INSUFFICIENT_REVIEW_EVIDENCE', 'Only one independently grounded check was confirmed.']
  ])('keeps the previous report visible when a rerun is inconclusive (%s)', async (failureCode, message) => {
    const url = 'https://drive.google.com/file/d/previous-report/view';
    const previousReport = { summary: 'Prior substantive finding.', findings: [{ source: 'DOCUMENT',
      issue: 'Wrong document title.', evidence: 'Title page says SPMP.' }] };
    const review = { fieldId: 'field-pdf', status: 'UNCERTAIN', failureCode,
      retryToken: 'retry-1', sourceUrl: url, previousReport, previousGeneratedAt: '2026-09-21T08:00:00Z',
      message };
    render(<MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ReviewResponseDrawer opened
        response={{ id: 'response-1', deliverableId: 'deliverable-1', studentNumber: '26-0001',
          teamCode: 'TEAM-01', submittedAt: '2026-09-22T08:00:00+08:00', reviewStatus: 'Received',
          values: { documentPdf: url }, artifactAiReviews: { 'field-pdf': review } }}
        student={{ name: 'DOE, JANE', studentNumber: '26-0001', teamCode: 'TEAM-01' }}
        state={{ projectMetadata: [] }}
        deliverable={{ id: 'deliverable-1', shortTitle: 'SRS', title: 'SRS', fields: [{
          definitionId: 'field-pdf', id: 'documentPdf', label: 'PDF', type: 'drive', pdfRequired: true,
          documentCheckPolicy: 'AUTO', aiReviewEnabled: true
        }] }}
        onClose={vi.fn()} onViewAiReview={vi.fn()} />
    </MantineProvider>);
    const drawer = await screen.findByRole('dialog', { name: 'Review DOE, JANE' });
    expect(drawer).toHaveTextContent('Latest AI Review inconclusive');
    expect(drawer).toHaveTextContent(message);
    expect(drawer).toHaveTextContent('it did not verify this PDF');
    expect(drawer).toHaveTextContent('previously saved AI Review is available');
    expect(screen.getByRole('button', { name: 'View previous AI Review' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Retry AI review' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View AI Review', exact: true })).not.toBeInTheDocument();
  });
});
