import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { AiReviewReportDialog } from './AiReviewReportDialog.jsx';

const previousReport = {
  summary: 'Wrong submitted PDF for this deliverable.',
  findings: [{ source: 'DOCUMENT', issue: 'Wrong submitted PDF for this deliverable.',
    evidence: 'Title page names Software Project Management Plan.' }],
  missingRequiredSections: []
};

function show(review, report = null) {
  render(<MantineProvider theme={wildTrackTheme} forceColorScheme="light">
    <AiReviewReportDialog opened onClose={vi.fn()} review={review} report={report} fieldLabel="SRS PDF" />
  </MantineProvider>);
}

it('labels a preserved previous report historical after an inconclusive rerun, never implying latest success', async () => {
  show({ status: 'UNCERTAIN', failureCode: 'FINDINGS_FILTERED', previousReport,
    previousGeneratedAt: '2026-09-21T08:00:00Z', generatedAt: null,
    message: 'WildTrack excluded every unsupported proposed finding.' });
  const dialog = await screen.findByRole('dialog', { name: 'AI Review: SRS PDF' });
  expect(dialog).toHaveTextContent('Latest AI Review inconclusive');
  expect(dialog).toHaveTextContent('The report below is from an earlier saved run');
  expect(dialog).toHaveTextContent('Previously saved AI Review');
  expect(dialog).toHaveTextContent('Sep 21, 2026');
  expect(dialog).toHaveTextContent('Title page names Software Project Management Plan');
  expect(dialog).not.toHaveTextContent('Reviewed Sep 22');
});

it('shows a previous substantive report when the latest provider request failed', async () => {
  show({ status: 'UNCERTAIN', failureCode: 'RATE_LIMITED', previousReport,
    message: "Gemini's quota or rate limit was reached.", previousGeneratedAt: '2026-09-20T08:00:00Z' });
  const dialog = await screen.findByRole('dialog', { name: 'AI Review: SRS PDF' });
  expect(dialog).toHaveTextContent('Latest AI Review did not finish');
  expect(dialog).toHaveTextContent('quota or rate limit');
  expect(dialog).toHaveTextContent('Previously saved AI Review');
  expect(dialog).toHaveTextContent('Title page names Software Project Management Plan');
});

it('marks a historical generic fallback inconclusive rather than treating it as prior substantive evidence', async () => {
  show({ status: 'UNCERTAIN', failureCode: 'NO_GROUNDED_FINDINGS',
    previousReport: { summary: 'The AI review returned no grounded findings from the submitted PDF or supplied requirement sources.',
      findings: [], missingRequiredSections: [] }, previousGeneratedAt: '2026-09-20T08:00:00Z' });
  const dialog = await screen.findByRole('dialog', { name: 'AI Review: SRS PDF' });
  expect(within(dialog).getByRole('status')).toHaveTextContent('Inconclusive AI Review');
  expect(dialog).toHaveTextContent('Previously saved AI Review');
});

it('shows a current substantive report as current rather than historical', async () => {
  show({ status: 'COMPLETED', generatedAt: '2026-09-22T08:00:00Z', report: previousReport }, previousReport);
  const dialog = await screen.findByRole('dialog', { name: 'AI Review: SRS PDF' });
  expect(dialog).toHaveTextContent('Reviewed Sep 22, 2026');
  expect(dialog).not.toHaveTextContent('Previously saved AI Review');
  expect(dialog).not.toHaveTextContent('Latest AI Review inconclusive');
});

it('keeps an earlier report historical after an insufficient-evidence rerun', async () => {
  show({ status: 'UNCERTAIN', failureCode: 'INSUFFICIENT_REVIEW_EVIDENCE', previousReport,
    previousGeneratedAt: '2026-09-21T08:00:00Z', generatedAt: null,
    message: 'Only one distinct grounded check was verified in the latest run.' });
  const dialog = await screen.findByRole('dialog', { name: 'AI Review: SRS PDF' });
  expect(dialog).toHaveTextContent('Latest AI Review inconclusive');
  expect(dialog).toHaveTextContent('Only one distinct grounded check was verified');
  expect(dialog).toHaveTextContent('Previously saved AI Review');
  expect(dialog).toHaveTextContent('The report below is from an earlier saved run');
  expect(dialog).not.toHaveTextContent('Reviewed Sep 22');
});

it('shows a saved zero-issue report with two verified SRS checks and a clear approval limit', async () => {
  const verifiedReport = { summary: 'General overview from provider.', findings: [], missingRequiredSections: [],
    verifiedChecks: [
      { aspect: 'Scope identifies system users', source: 'DELIVERABLE_REQUIREMENTS',
        documentEvidence: 'Section 1.3: The system is for students and advisers.',
        requirement: 'Identify intended users of the system.' },
      { aspect: 'Functional requirement states the submission workflow', source: 'OFFICIAL_TEMPLATE',
        documentEvidence: 'FR-01: A student submits the PDF link for review.',
        requirement: '3.2 Functional requirements' }
    ] };
  show({ status: 'COMPLETED', generatedAt: '2026-09-22T08:00:00Z', report: verifiedReport }, verifiedReport);
  const dialog = await screen.findByRole('dialog', { name: 'AI Review: SRS PDF' });

  expect(dialog).toHaveTextContent('Reviewed Sep 22, 2026');
  expect(dialog).toHaveTextContent('No actionable issues identified in the checked areas');
  expect(dialog).toHaveTextContent('2 distinct observations supported by submitted PDF evidence');
  expect(dialog).not.toHaveTextContent('Section 1.3: The system is for students and advisers.');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Show supporting evidence (2)' }));
  expect(dialog).toHaveTextContent('Section 1.3: The system is for students and advisers.');
  expect(dialog).toHaveTextContent('Authority: Identify intended users of the system.');
  expect(dialog).toHaveTextContent('FR-01: A student submits the PDF link for review.');
  expect(dialog).toHaveTextContent('not a guarantee of full compliance or approval');
  expect(dialog).not.toHaveTextContent('General overview from provider.');
});
