import { MantineProvider } from '@mantine/core';
import { render, screen, within } from '@testing-library/react';
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
