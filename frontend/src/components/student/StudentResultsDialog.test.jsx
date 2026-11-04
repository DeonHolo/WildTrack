import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { StudentAiReviewPanel } from './StudentResultsDialog.jsx';
import { getStudentAiReview, requestStudentAiReview } from '../../lib/api.js';

vi.mock('../../lib/api.js', () => ({ getStudentAiReview: vi.fn(), requestStudentAiReview: vi.fn() }));
vi.mock('../review/AiReviewReport.jsx', () => ({ AiReviewReport: ({ report }) => <div>{report.summary}</div> }));
const props = { workspaceId: 'workspace', responseId: 'own-response', fieldId: 'pdf',
  fileLink: 'https://drive.google.com/file/d/own-file/view', deliverableTitle: 'STD' };
const available = { canRun: true, message: 'Run AI Review for your submitted PDF.', review: { status: 'NOT_REVIEWED' } };
const running = { canRun: false, review: { status: 'RUNNING', message: 'Reviewing on the server.' } };
const completed = { canRun: false, review: { status: 'COMPLETED', report: { summary: 'The submitted file needs attention.',
  findings: [{ message: 'Missing test results' }] } } };
function panel(next = props) {
  return <MantineProvider theme={wildTrackTheme}><StudentAiReviewPanel {...next} /></MantineProvider>;
}
beforeEach(() => { vi.resetAllMocks(); getStudentAiReview.mockResolvedValue(available); });
afterEach(() => { vi.useRealTimers(); });

describe('student AI Review access', () => {
  it('loads a full saved result without a Run control, including a Needs attention result', async () => {
    getStudentAiReview.mockResolvedValue(completed);
    render(panel());
    expect(await screen.findByText(completed.review.report.summary)).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run AI Review' })).not.toBeInTheDocument();
    expect(requestStudentAiReview).not.toHaveBeenCalled();
  });

  it('uses the selected response and artifact and suppresses repeat clicks while the server runs', async () => {
    requestStudentAiReview.mockResolvedValue(running);
    render(panel());
    fireEvent.click(await screen.findByRole('button', { name: 'Run AI Review' }));
    expect(await screen.findByText('AI Review is running')).toBeInTheDocument();
    expect(requestStudentAiReview).toHaveBeenCalledExactlyOnceWith('workspace', 'own-response', 'pdf', false, null);
    expect(screen.queryByRole('button', { name: 'Run AI Review' })).not.toBeInTheDocument();
  });

  it('keeps a pre-request technical failure retryable without pretending it produced a result', async () => {
    requestStudentAiReview.mockRejectedValue(new Error('Google Drive is temporarily unavailable.'));
    render(panel());
    fireEvent.click(await screen.findByRole('button', { name: 'Run AI Review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Google Drive is temporarily unavailable.');
    expect(screen.getByRole('button', { name: 'Run AI Review' })).toBeEnabled();
    expect(screen.queryByText('No issues')).not.toBeInTheDocument();
  });

  it('requires confirmation and the saved retry token before retrying an uncertain request', async () => {
    getStudentAiReview.mockResolvedValue({ canRun: true, review: { status: 'UNCERTAIN', retryToken: 'current-attempt',
      message: 'The previous request failed.', failureCode: 'PROVIDER_CONNECTION_FAILED' } });
    requestStudentAiReview.mockResolvedValue(completed);
    render(panel());
    fireEvent.click(await screen.findByRole('button', { name: 'Retry AI Review', exact: true }));
    const confirm = await screen.findByRole('dialog', { name: 'Retry AI Review?' });
    expect(requestStudentAiReview).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Retry AI Review', exact: true }));
    await waitFor(() => expect(requestStudentAiReview).toHaveBeenCalledExactlyOnceWith('workspace', 'own-response', 'pdf', true, 'current-attempt'));
  });

  it('does not display a result that finishes loading after switching to another response', async () => {
    let resolveOld;
    getStudentAiReview.mockImplementation((_workspace, id) => id === 'own-response'
      ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(available));
    const view = render(panel());
    view.rerender(panel({ ...props, responseId: 'another-own-response' }));
    await screen.findByRole('button', { name: 'Run AI Review' });
    await act(async () => resolveOld(completed));
    expect(screen.queryByText(completed.review.report.summary)).not.toBeInTheDocument();
  });
});
