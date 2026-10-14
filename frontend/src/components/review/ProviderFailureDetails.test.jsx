import { MantineProvider } from '@mantine/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { ProviderFailureDetails } from './ProviderFailureDetails.jsx';
import { ReviewResponseDrawer } from './ReviewResponseDrawer.jsx';
import { AiReviewReportDialog } from './AiReviewReportDialog.jsx';
import { DocumentCheckDialog } from './DocumentCheckDialog.jsx';
import { AiReviewReport } from './AiReviewReport.jsx';

const sourceUrl = 'https://drive.google.com/file/d/current-pdf/view';
const diagnostic = { provider: 'gemini', stage: 'generation', httpStatus: 400,
  providerStatus: 'INVALID_ARGUMENT', reasonCode: 'REQUEST_PARAMETER_REJECTED',
  parameterFields: ['generationConfig.maxOutputTokens'], explanation: 'maxOutputTokens exceeds the supported limit.',
  requestId: 'request-123', model: 'gemini-3.1-flash-lite', elapsedMs: 120 };
const failureDetails = { stage: 'download', category: 'TRANSPORT', code: 'TIMEOUT',
  reason: 'The Google Drive request timed out.', causeType: 'SocketTimeoutException', elapsedMs: 20000 };
const report = { status: 'BLOCKED', sourceUrl, summary: 'Download failed.',
  metadata: { fileId: 'current-pdf', mimeType: 'application/pdf', canDownload: true, size: 100 },
  failureDetails, flags: ['Download Failed'], redFlags: ['Download Failed'] };
const response = { id: 'response-1', deliverableId: 'deliverable-1', studentNumber: '26-0001',
  teamCode: 'TEAM-01', submittedAt: '2026-10-14T08:00:00Z', reviewStatus: 'Received',
  values: { documentPdf: sourceUrl }, artifactChecks: { 'field-pdf': report } };
const deliverable = { id: 'deliverable-1', shortTitle: 'SRS', title: 'SRS', fields: [{
  definitionId: 'field-pdf', id: 'documentPdf', label: 'PDF', type: 'drive', pdfRequired: true,
  documentCheckPolicy: 'AUTO', aiReviewEnabled: true
}] };
const review = { fieldId: 'field-pdf', status: 'UNCERTAIN', sourceUrl,
  failureCode: 'REQUEST_PARAMETER_REJECTED', message: 'Gemini rejected a request setting.',
  failureDiagnostics: diagnostic };
function show(child) {
  return render(<MantineProvider theme={wildTrackTheme} forceColorScheme="light">{child}</MantineProvider>);
}
function drawer(value) {
  return <ReviewResponseDrawer opened response={value}
    student={{ name: 'DOE, JANE', studentNumber: '26-0001', teamCode: 'TEAM-01' }}
    state={{ projectMetadata: [] }} deliverable={deliverable} onClose={vi.fn()} />;
}

describe('saved provider error details', () => {
  it('shows the rejection stage, status, reason, parameter and request reference without raw JSON', () => {
    show(<ProviderFailureDetails diagnostic={diagnostic} failureCode={review.failureCode} />);
    const details = screen.getByLabelText('Gemini error details');
    expect(details).not.toHaveAttribute('open');
    expect(details).toHaveTextContent('Error details');
    expect(details).toHaveTextContent('generation');
    expect(details).toHaveTextContent('400');
    expect(details).toHaveTextContent('INVALID_ARGUMENT');
    expect(details).toHaveTextContent('generationConfig.maxOutputTokens');
    expect(details).toHaveTextContent('request-123');
    expect(details).toHaveTextContent(diagnostic.explanation);
  });

  it('identifies old failures for which extra diagnostics were not retained', () => {
    show(<ProviderFailureDetails failureCode="REQUEST_REJECTED" />);
    expect(screen.getByLabelText('Gemini error details')).toHaveTextContent('REQUEST_REJECTED');
    expect(screen.getByText('No additional error details were saved with this attempt.')).toBeInTheDocument();
  });

  it('renders provider text as plain text, never executable markup', () => {
    const text = '<img src=x onerror=alert(1)>';
    const { container } = show(<ProviderFailureDetails diagnostic={{ ...diagnostic, explanation: text }} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows Drive verification byte counts, including zero received bytes', () => {
    show(<ProviderFailureDetails service="Google Drive" diagnostic={{ ...failureDetails,
      stage: 'verification', code: 'SIZE_MISMATCH', expectedBytes: 100, actualBytes: 0 }} />);
    const details = screen.getByLabelText('Google Drive error details');
    expect(details).toHaveTextContent('SIZE_MISMATCH');
    expect(details).toHaveTextContent('Expected bytes100');
    expect(details).toHaveTextContent('Received bytes0');
  });

  it('makes failure details accessible from the response even when no AI report was generated', async () => {
    show(drawer({ ...response, artifactAiReviews: { 'field-pdf': review } }));
    const dialog = await screen.findByRole('dialog', { name: 'Review DOE, JANE' });
    expect(within(dialog).getByLabelText('Gemini error details')).toHaveTextContent(diagnostic.explanation);
    expect(within(dialog).getByLabelText('Google Drive error details')).toHaveTextContent('TIMEOUT');
    expect(within(dialog).getByRole('button', { name: 'View AI Review' })).toBeDisabled();
  });

  it('does not attribute diagnostics for an old submitted link to a replacement file', async () => {
    show(drawer({ ...response, values: { documentPdf: 'https://drive.google.com/file/d/replacement/view' },
      artifactAiReviews: { 'field-pdf': review } }));
    const dialog = await screen.findByRole('dialog', { name: 'Review DOE, JANE' });
    expect(within(dialog).queryByLabelText('Gemini error details')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Google Drive error details')).not.toBeInTheDocument();
  });

  it('keeps a previous report historical while exposing the latest rejection details', async () => {
    show(<AiReviewReportDialog opened onClose={vi.fn()} deliverableTitle="SRS"
      review={{ ...review, previousGeneratedAt: '2026-10-13T08:00:00Z',
        previousReport: { findings: [{ issue: 'Earlier finding.', evidence: 'Earlier PDF text.', source: 'DOCUMENT' }] } }} />);
    const dialog = await screen.findByRole('dialog', { name: 'AI Review: SRS' });
    expect(dialog).toHaveTextContent('Previously saved AI Review');
    expect(dialog).toHaveTextContent('Earlier PDF text.');
    expect(within(dialog).getByLabelText('Gemini error details')).toHaveTextContent(diagnostic.explanation);
  });

  it('explains a download failure independently of accessible metadata and download permission', async () => {
    show(<DocumentCheckDialog response={{ ...response, documentCheck: report }}
      open onClose={vi.fn()} fileLink={sourceUrl} />);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Accessible');
    expect(dialog).toHaveTextContent('Allowed');
    expect(within(dialog).getByLabelText('Google Drive error details')).toHaveTextContent('TIMEOUT');
  });

  it('keeps attribution on long requirement passages while removing repeated PDF labels', () => {
    const requirement = 'This is an official template requirement that explains the expected coverage. '.repeat(4);
    show(<AiReviewReport report={{ findings: [{ issue: 'Verify coverage.', source: 'OFFICIAL_TEMPLATE',
      evidence: 'Document quote.', requirement }] }} />);
    expect(screen.getByText('Reference · Official template')).toBeInTheDocument();
    expect(screen.getByText('Document quote.').tagName).toBe('BLOCKQUOTE');
    expect(screen.queryByText('PDF excerpt', { exact: true })).not.toBeInTheDocument();
  });
});
