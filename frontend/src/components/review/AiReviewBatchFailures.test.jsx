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
  it('puts only the short provider status beside the affected PDF and keeps advice in closed Error details', () => {
    const failed = { ...entry('STD', unavailable), failureDiagnostics: {
      provider: 'drive', stage: 'download', httpStatus: 403, reasonCode: 'UPSTREAM_ERROR',
      explanation: 'Drive refused the request.'
    } };
    renderView(<AiReviewBatchFailures entries={[failed]} />);
    const row = screen.getByRole('link', { name: 'STD.pdf' }).closest('li');
    expect(row).toHaveTextContent('(Drive HTTP 403)');
    const details = screen.getByLabelText('Google Drive error details');
    expect(details).not.toHaveAttribute('open');
    expect(details).toHaveTextContent('temporary limits may apply');
    expect(details).not.toHaveTextContent('rate limit reached');
  });

  it('retains the specific Gemini failure code when there was no HTTP response', () => {
    renderView(<AiReviewBatchFailures entries={[{ ...entry('AI'), noAiStarted: false, resultStatus: 'UNCERTAIN',
      error: 'Gemini returned an incomplete or invalid review.',
      failureDiagnostics: { provider: 'gemini', reasonCode: 'INVALID_RESPONSE' }
    }]} />);
    expect(screen.getByRole('link', { name: 'AI.pdf' }).closest('li')).toHaveTextContent('(Gemini · INVALID_RESPONSE)');
    expect(screen.getByLabelText('Gemini error details')).not.toHaveTextContent('rate limit');
  });

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

  it('keeps completed inconclusive reviews green with an informational icon and affected PDF', () => {
    const batch = completedBatch();
    batch.message = 'AI Review batch finished with items needing attention. Open the affected PDFs below.';
    batch.entries[0] = { ...batch.entries[0], error: 'Review finished with checks needing manual verification. Open the saved review to inspect the cited areas.',
      identity: { fileName: 'reviewed.pdf', sourceUrl: 'https://drive.google.com/file/d/reviewed/view' } };
    renderView(<AiReviewBatchPanel batch={batch} onRefresh={vi.fn()} onPrepare={vi.fn()} />);
    expect(screen.getByRole('status').style.getPropertyValue('--alert-color')).toContain('green');
    expect(screen.getByRole('progressbar').style.getPropertyValue('--progress-section-color')).toContain('green');
    expect(screen.getByText('AI Review batch finished. Saved results are available.')).toBeInTheDocument();
    expect(screen.queryByText(/finished with items needing attention/)).not.toBeInTheDocument();
    expect(screen.getByText(/finished with items to check in the PDF/)).toBeInTheDocument();
    const advisoryButton = screen.getByRole('button', { name: 'Show PDFs with items to check' });
    expect(advisoryButton.style.getPropertyValue('--ai-color')).toContain('blue');
    expect(advisoryButton.querySelector('svg').innerHTML).not.toBe(
      screen.getByRole('button', { name: 'Show PDFs with access restrictions' }).querySelector('svg').innerHTML);
    expect(screen.getByText(/These PDFs could not be opened/)).toBeInTheDocument();
    expect(screen.getByText('1 AI review available')).toBeInTheDocument();
    const details = screen.getByText('reviewed.pdf').closest('details');
    fireEvent.click(advisoryButton);
    expect(details.open).toBe(true);
    expect(details.querySelector('summary')).toHaveFocus();
    expect(screen.getByRole('link', { name: 'reviewed.pdf' })).toHaveAttribute('href', 'https://drive.google.com/file/d/reviewed/view');
  });

  it.each(['FAILED', 'UNCERTAIN', undefined])('keeps a %s attempt orange alongside completed review advisories', resultStatus => {
    const batch = completedBatch();
    batch.entries[0].error = 'Review finished with checks needing manual verification. Open the saved review to inspect the cited areas.';
    batch.entries.unshift({ target: { responseId: 'failed', fieldId: 'pdf' }, preview: { key: 'failed' },
      selected: true, phase: 'DONE', resultStatus, noAiStarted: false,
      error: "Gemini rejected WildTrack's AI request (HTTP 400)." });
    batch.entries.unshift({ ...entry('approval'), selected: false, resultStatus: 'TEMPLATE_APPROVAL_REQUIRED',
      templateChecklistUrl: '/templates/00000000-0000-0000-0000-000000000001/preview?workspaceId=00000000-0000-0000-0000-000000000002' });
    renderView(<AiReviewBatchPanel batch={batch} onRefresh={vi.fn()} onPrepare={vi.fn()} />);
    expect(screen.getByRole('status').style.getPropertyValue('--alert-color')).toContain('orange');
    expect(screen.getByText(/finished with items to check in the PDF/)).toBeInTheDocument();
    expect(screen.getByText(/Gemini rejected/)).toBeInTheDocument();
    expect(screen.getByText(/1 failed or unconfirmed/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Show PDFs with/ })[0])
      .toHaveAccessibleName('Show PDFs with items to check');
    expect(screen.getByText(/These AI Reviews finished with items/)
      .compareDocumentPosition(screen.getByText('Template checklists need approval')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps completed duplicate groups available while showing each advisory only as a review limit', () => {
    const batch = completedBatch();
    batch.entries[0].error = 'This review is inconclusive; it does not establish a clean result.';
    batch.entries.push({ ...batch.entries[0], target: { responseId: 'duplicate', fieldId: 'pdf' } });
    renderView(<AiReviewBatchPanel batch={batch} onRefresh={vi.fn()} onPrepare={vi.fn()} />);
    expect(screen.getByText('1 AI review available')).toBeInTheDocument();
    expect(screen.queryByText(/failed or unconfirmed/)).not.toBeInTheDocument();
    expect(screen.getByRole('status').style.getPropertyValue('--alert-color')).toContain('green');
    expect(screen.getByText(/finished with limited coverage/)).toBeInTheDocument();
    expect(screen.queryByText(/finished with items to check in the PDF/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show PDFs with review limits' }).style.getPropertyValue('--ai-color')).toContain('blue');
  });

  it('keeps backend-shaped selected pre-AI FILE_ACCESS failures green without counting them as reviews', () => {
    const blocked = { ...entry('selected-restricted'), selected: true, phase: 'DONE', resultStatus: 'FAILED',
      noAiStarted: true, preview: { key: 'selected-restricted' } };
    const batch = { id: 'all-access', state: 'COMPLETED', entries: [blocked], totalPdfs: 1,
      selectedDocuments: 1, completedDocuments: 1, pendingDocuments: 0, uniqueDocuments: 1 };
    renderView(<AiReviewBatchPanel batch={batch} onRefresh={vi.fn()} onPrepare={vi.fn()} />);
    expect(screen.getByRole('status').style.getPropertyValue('--alert-color')).toContain('green');
    expect(screen.getByText('0 AI reviews available · 1 blocked before AI')).toBeInTheDocument();
    expect(screen.getByText('AI Review batch finished. No reviews were produced; check the file-access notices below.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show PDFs with access restrictions' })).toBeInTheDocument();
    expect(screen.queryByText(/failed or unconfirmed/)).not.toBeInTheDocument();
  });

  it.each(['RUNNING', 'PLANNING'])('keeps %s blue while earlier attempts have technical failures', state => {
    renderView(<AiReviewBatchPanel batch={{ ...completedBatch({ error: unavailable }), state, preparedPdfs: 2 }} onRefresh={vi.fn()} onPrepare={vi.fn()} />);
    expect(screen.getByRole('status').style.getPropertyValue('--alert-color')).toContain('blue');
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
    expect(screen.getByText(/Student SDD/)).toHaveTextContent('Access restricted');
    expect(screen.getByText(/Student STD/)).toHaveTextContent('Drive error');
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
    expect(screen.getByText('2 of 2 PDF submissions checked')).toBeInTheDocument();
    expect(screen.queryByText(/AI reviews available/)).not.toBeInTheDocument();
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
