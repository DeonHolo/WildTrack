import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { StudentAiReviewPanel } from './StudentResultsDialog.jsx';
import { getStudentAiReview, requestStudentAiReview } from '../../lib/api.js';
import { createWorkspaceResourceCache } from '../../lib/workspaceResourceCache.js';

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
beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); getStudentAiReview.mockResolvedValue(available); });
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

  it('shows a saved review immediately after reopening while quietly checking for an updated result', async () => {
    const cached = { ...props, reviewCache: createWorkspaceResourceCache(), reviewAccountKey: 'student-account' };
    getStudentAiReview.mockResolvedValueOnce(completed);
    const first = render(panel(cached));
    await screen.findByText(completed.review.report.summary);
    first.unmount();

    let resolveRefresh;
    getStudentAiReview.mockImplementation(() => new Promise(resolve => { resolveRefresh = resolve; }));
    render(panel(cached));
    expect(screen.getByText(completed.review.report.summary)).toBeInTheDocument();
    expect(screen.queryByText('Loading saved AI Review…')).not.toBeInTheDocument();
    await waitFor(() => expect(getStudentAiReview).toHaveBeenCalledTimes(2));
    await act(async () => resolveRefresh({ ...completed, review: { ...completed.review,
      report: { ...completed.review.report, summary: 'The updated saved report.' } } }));
    expect(screen.getByText('The updated saved report.')).toBeInTheDocument();
    expect(requestStudentAiReview).not.toHaveBeenCalled();
  });

  it.each([
    ['account', { reviewAccountKey: 'another-student' }],
    ['workspace', { workspaceId: 'another-workspace' }],
    ['PDF', { fileLink: 'https://drive.google.com/file/d/new-file/view' }],
    ['artifact', { fieldId: 'another-pdf' }]
  ])('hides the cached report immediately when the %s changes', async (_label, change) => {
    const cached = { ...props, reviewCache: createWorkspaceResourceCache(), reviewAccountKey: 'student-account' };
    getStudentAiReview.mockResolvedValueOnce(completed);
    const view = render(panel(cached));
    await screen.findByText(completed.review.report.summary);
    getStudentAiReview.mockImplementation(() => new Promise(() => {}));
    view.rerender(panel({ ...cached, ...change }));
    expect(screen.queryByText(completed.review.report.summary)).not.toBeInTheDocument();
    expect(screen.getByText('Loading saved AI Review…')).toBeInTheDocument();
  });

  it('shares a pending saved-result read across closing and reopening the panel', async () => {
    const cached = { ...props, reviewCache: createWorkspaceResourceCache(), reviewAccountKey: 'student-account' };
    let resolveRead;
    getStudentAiReview.mockImplementation(() => new Promise(resolve => { resolveRead = resolve; }));
    const first = render(panel(cached));
    await waitFor(() => expect(getStudentAiReview).toHaveBeenCalledTimes(1));
    first.unmount();
    render(panel(cached));
    await act(async () => resolveRead(completed));
    expect(await screen.findByText(completed.review.report.summary)).toBeInTheDocument();
    expect(getStudentAiReview).toHaveBeenCalledTimes(1);
  });

  it('removes a cached report when the server denies access', async () => {
    const cached = { ...props, reviewCache: createWorkspaceResourceCache(), reviewAccountKey: 'student-account' };
    getStudentAiReview.mockResolvedValueOnce(completed);
    const first = render(panel(cached));
    await screen.findByText(completed.review.report.summary);
    first.unmount();
    getStudentAiReview.mockRejectedValueOnce(Object.assign(new Error('Access denied.'), { status: 403 }));
    const second = render(panel(cached));
    await screen.findByText('Access denied.');
    expect(screen.queryByText(completed.review.report.summary)).not.toBeInTheDocument();
    second.unmount();
    getStudentAiReview.mockImplementation(() => new Promise(() => {}));
    render(panel(cached));
    expect(screen.queryByText(completed.review.report.summary)).not.toBeInTheDocument();
  });
});
