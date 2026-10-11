import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AiReviewBatchDialog } from './AiReviewBatchDialog.jsx';
import { AiReviewBatchPanel } from './AiReviewBatchPanel.jsx';
import { AiReviewBatchFailures } from './AiReviewBatchFailures.jsx';

const restricted = 'The submitted Drive PDF could not be opened. Google Drive reported a file-access or download restriction. Check sharing settings and the complete submission link. No AI review was started.';
const unavailable = 'WildTrack could not retrieve the submitted PDF from Google Drive. The backend access failure could not be confirmed as a sharing problem. No AI review was started.';
const entry = (id, error = restricted) => ({ target: { responseId: id, fieldId: 'pdf' }, phase: 'UNVERIFIED', error, preview: null,
  identity: { fileName: `${id}.pdf`, deliverableTitle: 'SDD', artifactLabel: 'PDF Drive Link', studentName: `Student ${id}`,
    sourceUrl: `https://drive.google.com/file/d/${id}/view` } });
const renderView = view => render(<MantineProvider>{view}</MantineProvider>);

describe('AI batch affected PDF presentation', () => {
  it.each(['choices', 'progress'])('explains Drive failures once in %s and identifies the exact affected PDFs', view => {
    const plan = { id: 'batch', state: view === 'choices' ? 'READY' : 'PAUSED', entries: [entry('SDD'), entry('STD', unavailable)],
      totalPdfs: 2, preparedPdfs: 2, selectedDocuments: 0, completedDocuments: 0, pendingDocuments: 0, uniqueDocuments: 0 };
    renderView(view === 'choices'
      ? <AiReviewBatchDialog plan={plan} onCancel={vi.fn()} onStart={vi.fn()} />
      : <AiReviewBatchPanel batch={plan} onRefresh={vi.fn()} onPrepare={vi.fn()} />);
    expect(screen.getAllByText('These PDFs could not be opened from Google Drive. No AI review started for them.')).toHaveLength(1);
    expect(screen.getAllByText('See affected PDFs')).toHaveLength(1);
    expect(screen.getByText('SDD.pdf')).toHaveAttribute('href', 'https://drive.google.com/file/d/SDD/view');
    expect(screen.getByText('STD.pdf')).toHaveAttribute('href', 'https://drive.google.com/file/d/STD/view');
    expect(screen.getByText(/Student SDD/)).toHaveTextContent('access or download restricted');
    expect(screen.getByText(/Student STD/)).toHaveTextContent('server retrieval failed');
    expect(screen.queryByText(restricted)).not.toBeInTheDocument();
    expect(screen.queryByText(unavailable)).not.toBeInTheDocument();
    if (view === 'choices') expect(screen.getByRole('button', { name: 'Start review' })).toBeDisabled();
  });

  it('keeps uncertain provider failures distinct from PDFs that never started an AI request', () => {
    const uncertain = { ...entry('provider'), error: 'Gemini outcome could not be confirmed. Review retry options before using more tokens.', noAiStarted: false };
    renderView(<AiReviewBatchFailures entries={[entry('STD'), uncertain]} />);
    expect(screen.getByText(uncertain.error)).toBeInTheDocument();
    expect(screen.getAllByText('See affected PDFs')).toHaveLength(2);
  });

  it('uses stored identity rather than replacing a historical failed URL with a newer preview URL', () => {
    const failed = { ...entry('original'), preview: { sourceUrl: 'https://drive.google.com/file/d/replacement/view', deliverableTitle: 'Replacement' } };
    renderView(<AiReviewBatchFailures entries={[failed]} />);
    expect(screen.getByText('original.pdf')).toHaveAttribute('href', failed.identity.sourceUrl);
    expect(screen.queryByText('Replacement')).not.toBeInTheDocument();
  });

  it.each(['javascript:alert(1)', 'https://drive.google.com.evil.example/file/d/pdf/view', 'http://drive.google.com/file/d/pdf/view'])('does not link unsafe source %s', sourceUrl => {
    const failed = entry('invalid'); failed.identity.sourceUrl = sourceUrl;
    renderView(<AiReviewBatchFailures entries={[failed]} />);
    expect(screen.getByText('invalid.pdf').tagName).toBe('SPAN');
  });
});
