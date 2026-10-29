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

function show(review, report = null, documentChange = null, fileLink = '') {
  render(<MantineProvider theme={wildTrackTheme} forceColorScheme="light">
    <AiReviewReportDialog opened onClose={vi.fn()} review={review} report={report} documentChange={documentChange} fileLink={fileLink} deliverableTitle="Software Requirements Specification" fieldLabel="SRS PDF" />
  </MantineProvider>);
}

it('opens the selected submission PDF in a separate tab from its AI Review', async () => {
  const url = 'https://drive.google.com/file/d/selected-pdf/view?resourcekey=selected-key';
  show({ status: 'COMPLETED', generatedAt: '2026-10-22T01:00:00Z' }, previousReport, null, url);
  const dialog = await screen.findByRole('dialog');
  const link = within(dialog).getByRole('link', { name: 'Open PDF' });
  expect(link).toHaveAttribute('href', url);
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noreferrer');
  const header = link.closest('.mantine-Modal-header');
  expect(header).toContainElement(within(dialog).getByRole('button', { name: 'Close AI Review details' }));
  expect(header).toContainElement(within(dialog).getByText('AI Review: Software Requirements Specification'));
  const body = dialog.querySelector('.wt-ai-review-dialog-body');
  expect(body).not.toContainElement(link);
  expect(body.firstElementChild.firstElementChild).toHaveTextContent(/^Reviewed /);
});

it('shows AI Review limitations on keyboard focus in the header', async () => {
  show({ status: 'COMPLETED' }, previousReport);
  const dialog = await screen.findByRole('dialog');
  fireEvent.focus(within(dialog).getByRole('button', { name: 'About AI Review' }));
  expect(await screen.findByRole('tooltip')).toHaveTextContent('AI Review can miss issues or misread a document.');
  expect(screen.getByRole('tooltip')).toHaveTextContent('AI Review does not accept or grade submissions.');
});

it.each(['', 'javascript:alert(1)'])('omits the PDF link when it is missing or invalid (%s)', async (url) => {
  show({ status: 'COMPLETED' }, previousReport, null, url);
  expect(within(await screen.findByRole('dialog')).queryByRole('link', { name: 'Open PDF' })).not.toBeInTheDocument();
});

it('places the current review date with the document overview heading', async () => {
  show({ status: 'COMPLETED', generatedAt: '2026-09-22T08:00:00Z' }, {
    ...previousReport,
    documentOverview: { text: 'The submitted document describes a project management plan.', wrongDocument: false }
  });
  const overview = await screen.findByRole('region', { name: 'Document overview' });
  const heading = within(overview).getByRole('heading', { name: 'Document overview' });
  const date = within(overview).getByText(/^Reviewed on Sep 22, 2026/);
  expect(heading.parentElement).toContainElement(date);
  expect(screen.getAllByText(/^Reviewed on /)).toHaveLength(1);
});

it('warns above a saved report after Document Check detects changed content', async () => {
  show({ status: 'COMPLETED', generatedAt: '2026-10-13T14:55:20Z' }, previousReport, { changeType: 'CONTENT_CHANGED' });
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByRole('alert')).toHaveTextContent('AI Review may be outdated');
  expect(dialog).toHaveTextContent('Automatic Document Check does not run AI Review');
  expect(dialog).toHaveTextContent('Title page names Software Project Management Plan');
});

it('labels a preserved previous report historical after an inconclusive rerun, never implying latest success', async () => {
  show({ status: 'UNCERTAIN', failureCode: 'FINDINGS_FILTERED', previousReport,
    previousGeneratedAt: '2026-09-21T08:00:00Z', generatedAt: null,
    message: 'WildTrack excluded every unsupported proposed finding.' });
  const dialog = await screen.findByRole('dialog', { name: 'AI Review: Software Requirements Specification' });
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
  const dialog = await screen.findByRole('dialog', { name: 'AI Review: Software Requirements Specification' });
  expect(dialog).toHaveTextContent('Latest AI Review did not finish');
  expect(dialog).toHaveTextContent('quota or rate limit');
  expect(dialog).toHaveTextContent('Previously saved AI Review');
  expect(dialog).toHaveTextContent('Title page names Software Project Management Plan');
});

it('marks a historical generic fallback inconclusive rather than treating it as prior substantive evidence', async () => {
  show({ status: 'UNCERTAIN', failureCode: 'NO_GROUNDED_FINDINGS',
    previousReport: { summary: 'The AI review returned no grounded findings from the submitted PDF or supplied requirement sources.',
      findings: [], missingRequiredSections: [] }, previousGeneratedAt: '2026-09-20T08:00:00Z' });
  const dialog = await screen.findByRole('dialog', { name: 'AI Review: Software Requirements Specification' });
  expect(within(dialog).getByRole('status')).toHaveTextContent('Limited review coverage');
  expect(dialog).toHaveTextContent('Previously saved AI Review');
});

it('shows a current substantive report as current rather than historical', async () => {
  show({ status: 'COMPLETED', generatedAt: '2026-09-22T08:00:00Z', report: previousReport }, previousReport);
  const dialog = await screen.findByRole('dialog', { name: 'AI Review: Software Requirements Specification' });
  expect(dialog).toHaveTextContent('Reviewed on Sep 22, 2026');
  expect(dialog).not.toHaveTextContent('Previously saved AI Review');
  expect(dialog).not.toHaveTextContent('Latest AI Review inconclusive');
});

it('keeps an earlier report historical after an insufficient-evidence rerun', async () => {
  show({ status: 'UNCERTAIN', failureCode: 'INSUFFICIENT_REVIEW_EVIDENCE', previousReport,
    previousGeneratedAt: '2026-09-21T08:00:00Z', generatedAt: null,
    message: 'Only one distinct grounded check was verified in the latest run.' });
  const dialog = await screen.findByRole('dialog', { name: 'AI Review: Software Requirements Specification' });
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
  const dialog = await screen.findByRole('dialog', { name: 'AI Review: Software Requirements Specification' });

  expect(dialog).toHaveTextContent('Reviewed on Sep 22, 2026');
  expect(dialog).toHaveTextContent('No actionable issues identified in the checked areas');
  expect(dialog).toHaveTextContent('2 distinct observations supported by submitted PDF evidence');
  expect(within(dialog).queryByText(/Other checked items/)).not.toBeInTheDocument();
  expect(within(dialog).queryByText('Section 1.3: The system is for students and advisers.')).not.toBeInTheDocument();
  expect(dialog).not.toHaveTextContent('Identify intended users of the system.');
  expect(dialog).not.toHaveTextContent('FR-01: A student submits the PDF link for review.');
  expect(dialog).toHaveTextContent('This is advisory feedback');
  expect(dialog).not.toHaveTextContent('General overview from provider.');
});
