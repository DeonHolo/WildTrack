import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
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
  const completedBatch = blocked => ({ id: 'finished', state: 'COMPLETED', entries: [
    { target: { responseId: 'reviewed', fieldId: 'pdf' }, preview: { key: 'reviewed' }, selected: true,
      phase: 'DONE', resultStatus: 'COMPLETED', noAiStarted: false, error: '' },
    { ...entry('restricted'), selected: false, noAiStarted: true, ...blocked }
  ], totalPdfs: 2, selectedDocuments: 1, completedDocuments: 1, pendingDocuments: 0, uniqueDocuments: 1,
    message: 'AI Review batch finished. Saved results are available.' });

  it('shows a green finished batch and progress bar when only access-restricted PDFs were excluded', () => {
    renderView(<AiReviewBatchPanel batch={completedBatch()} onRefresh={vi.fn()} onPrepare={vi.fn()} />);
    expect(screen.getByRole('status').style.getPropertyValue('--alert-color')).toContain('green');
    expect(screen.getByRole('progressbar').style.getPropertyValue('--progress-section-color')).toContain('green');
    expect(screen.getByText('1 AI review available')).toBeInTheDocument();
    expect(screen.getByText(/These PDFs could not be opened/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review retry options' })).toBeInTheDocument();
  });

  it('opens the affected PDF list and moves keyboard focus there from the access-restriction icon', () => {
    renderView(<AiReviewBatchPanel batch={completedBatch()} onRefresh={vi.fn()} onPrepare={vi.fn()} />);
    const details = screen.getByText('restricted.pdf').closest('details');
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Show PDFs with access restrictions' }));
    expect(details.open).toBe(true);
    expect(details.querySelector('summary')).toHaveFocus();
    expect(screen.getByRole('link', { name: 'restricted.pdf' })).toHaveAttribute('href', entry('restricted').identity.sourceUrl);
  });

  it.each([
    ['Drive retrieval failure', { error: unavailable }],
    ['unclassified Drive 403', { error: 'Google Drive returned an unrecognized response. HTTP 403.' }],
    ['Gemini 400', { error: "Gemini rejected WildTrack's AI request (HTTP 400).", noAiStarted: false }],
    ['uncertain provider outcome', { error: 'Gemini outcome could not be confirmed.', noAiStarted: false }],
    ['access wording after AI started', { error: restricted, noAiStarted: false }],
    ['failed result without an error message', { error: '', selected: true, preview: { key: 'failed' },
      phase: 'DONE', resultStatus: 'FAILED', noAiStarted: false }]
  ])('keeps the finished batch orange for %s', (_name, failure) => {
    renderView(<AiReviewBatchPanel batch={completedBatch(failure)} onRefresh={vi.fn()} onPrepare={vi.fn()} />);
    expect(screen.getByRole('status').style.getPropertyValue('--alert-color')).toContain('orange');
    expect(screen.getByRole('progressbar').style.getPropertyValue('--progress-section-color')).toContain('orange');
  });

  it.each([['RUNNING', 'blue'], ['PLANNING', 'blue'], ['PAUSED', 'orange']])(
    'preserves the %s state with access restrictions', (state, color) => {
      renderView(<AiReviewBatchPanel batch={{ ...completedBatch(), state, preparedPdfs: 2 }} onRefresh={vi.fn()} onPrepare={vi.fn()} />);
      expect(screen.getByRole('status').style.getPropertyValue('--alert-color')).toContain(color);
    }
  );

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

  it('reports completed, failed, reused, and pending groups separately', () => {
    const reviewEntry = (id, key, overrides = {}) => ({
      target: { responseId: id, fieldId: 'pdf' }, preview: { key }, selected: true,
      phase: 'DONE', resultStatus: 'COMPLETED', reused: false, error: '', ...overrides
    });
    const batch = { id: 'mixed', state: 'RUNNING', entries: [
      reviewEntry('first', 'shared'),
      reviewEntry('duplicate', 'shared'),
      reviewEntry('reused', 'reused', { reused: true }),
      reviewEntry('failed', 'failed', { resultStatus: 'FAILED', error: 'Provider failed' }),
      reviewEntry('pending', 'pending', { phase: 'PENDING', resultStatus: null })
    ], totalPdfs: 5, selectedDocuments: 4, completedDocuments: 3, pendingDocuments: 1, uniqueDocuments: 4,
      reusedDocuments: 1, message: 'Running' };
    renderView(<AiReviewBatchPanel batch={batch} onRefresh={vi.fn()} onPrepare={vi.fn()} />);
    expect(screen.getByText('3 of 4 unique review attempts finished · 5 total PDF submissions')).toBeInTheDocument();
    expect(screen.getByText(/2 AI reviews available/)).toBeInTheDocument();
    expect(screen.getByText(/1 failed or unconfirmed/)).toBeInTheDocument();
    expect(screen.getByText(/1 pending/)).toBeInTheDocument();
  });

  it('does not count unselected blocked rows as selected review groups or AI blocks', () => {
    const blockedEntry = id => ({ ...entry(id), selected: false, noAiStarted: true,
      identity: { ...entry(id).identity, sourceUrl: 'https://drive.google.com/file/d/same/view' } });
    const batch = { id: 'blocked', state: 'READY', entries: [blockedEntry('one'), blockedEntry('two')], totalPdfs: 2,
      preparedPdfs: 2, selectedDocuments: 0, completedDocuments: 0, pendingDocuments: 0, uniqueDocuments: 0 };
    renderView(<AiReviewBatchPanel batch={batch} onRefresh={vi.fn()} onPrepare={vi.fn()} />);
    expect(screen.getByText('0 of 0 unique review attempts finished · 2 total PDF submissions')).toBeInTheDocument();
    expect(screen.queryByText(/blocked before AI/)).not.toBeInTheDocument();
  });

  it('keeps selected blocked groups separate from preparation failures and counts scoped reviews', () => {
    const selected = (id, key, overrides = {}) => ({
      target: { responseId: id, fieldId: 'pdf' }, preview: { key }, selected: true,
      phase: 'DONE', resultStatus: 'FAILED', noAiStarted: true, error: 'Drive access failed', ...overrides
    });
    const unselected = (id, preview = null) => ({ target: { responseId: id, fieldId: 'pdf' }, preview,
      selected: false, phase: preview ? 'PREPARED' : 'UNVERIFIED', noAiStarted: true, error: 'Drive access failed' });
    const sameUrlA = selected('same-url-a', 'scope-a', { noAiStarted: false, resultStatus: 'COMPLETED', error: '' });
    const sameUrlB = selected('same-url-b', 'scope-b', { noAiStarted: false, resultStatus: 'COMPLETED', error: '' });
    const batch = { id: 'live-shape', state: 'COMPLETED', entries: [
      selected('blocked-a', 'blocked-a'), selected('blocked-b', 'blocked-b'), sameUrlA, sameUrlB,
      unselected('prepared-clean', { key: 'clean', category: 'CLEAN' }),
      unselected('unverified-1'), unselected('unverified-2'), unselected('unverified-3')
    ], totalPdfs: 8, selectedDocuments: 4, completedDocuments: 4, pendingDocuments: 0, uniqueDocuments: 5 };
    renderView(<AiReviewBatchPanel batch={batch} onRefresh={vi.fn()} onPrepare={vi.fn()} />);
    expect(screen.getByText('4 of 4 unique review attempts finished · 8 total PDF submissions')).toBeInTheDocument();
    expect(screen.getByText(/2 AI reviews available/)).toBeInTheDocument();
    expect(screen.getByText(/2 blocked before AI/)).toBeInTheDocument();
    expect(screen.queryByText(/failed after start/)).not.toBeInTheDocument();
  });

  it('counts an alternate successful copy as available for a shared review group', () => {
    const copy = (id, overrides = {}) => ({
      target: { responseId: id, fieldId: 'pdf' }, preview: { key: 'shared-file' }, selected: true,
      phase: 'DONE', resultStatus: 'FAILED', noAiStarted: true, error: 'Drive access failed', ...overrides
    });
    const batch = { id: 'alternate', state: 'COMPLETED', entries: [
      copy('blocked-copy'), copy('successful-copy', { noAiStarted: false, resultStatus: 'COMPLETED', error: '' })
    ], totalPdfs: 2, selectedDocuments: 1, completedDocuments: 1, pendingDocuments: 0, uniqueDocuments: 1 };
    renderView(<AiReviewBatchPanel batch={batch} onRefresh={vi.fn()} onPrepare={vi.fn()} />);
    expect(screen.getByText('1 of 1 unique review attempts finished · 2 total PDF submissions')).toBeInTheDocument();
    expect(screen.getByText(/1 AI review available/)).toBeInTheDocument();
    expect(screen.queryByText(/blocked before AI/)).not.toBeInTheDocument();
    expect(screen.queryByText(/failed or unconfirmed/)).not.toBeInTheDocument();
  });
});
