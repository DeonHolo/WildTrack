import { afterEach, expect, it, vi } from 'vitest';
import { runAiReview, runAiReviews, runDocumentChecks } from './reviewDeskClient.js';

const request = vi.hoisted(() => vi.fn());
const ai = vi.hoisted(() => ({ start: vi.fn(), saved: vi.fn() }));
vi.mock('./api.js', async (original) => ({ ...(await original()), runDocumentCheck: request,
  requestAiReview: ai.start, getSavedAiReview: ai.saved }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

it('polls a running AI job without submitting a second generation request', async () => {
  vi.useFakeTimers();
  ai.start.mockResolvedValue({ status: 'RUNNING', reused: false });
  ai.saved.mockResolvedValue({ status: 'COMPLETED', reused: true, report: { summary: 'Feedback' } });
  const pending = runAiReview('workspace', 'response');
  await vi.advanceTimersByTimeAsync(2500);
  const result = await pending;
  expect(result.ok).toBe(true);
  expect(result.review.reused).toBe(false);
  expect(ai.start).toHaveBeenCalledTimes(1);
  expect(ai.saved).toHaveBeenCalledWith('workspace', 'response', null);
});

it('stops polling when the account or workspace changes', async () => {
  vi.useFakeTimers();
  let active = true;
  ai.start.mockResolvedValue({ status: 'RUNNING' });
  const pending = runAiReview('workspace', 'response', null, false, null, () => active);
  await Promise.resolve();
  active = false;
  await vi.advanceTimersByTimeAsync(2500);
  expect((await pending).cancelled).toBe(true);
  expect(ai.saved).not.toHaveBeenCalled();
  expect(ai.start).toHaveBeenCalledTimes(1);
});

it('does not send remaining batch actions after the caller leaves its session/workspace', async () => {
  let active = true;
  const pending = [];
  request.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  const responses = ['one', 'two', 'three', 'must-not-start'].map(id => ({
    id, deliverableId: 'SRS', values: { documentPdf: `https://example.test/${id}` }
  }));
  const batch = runDocumentChecks('workspace', responses, [{
    id: 'SRS',
    fields: [{ id: 'documentPdf', type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO' }]
  }], { shouldContinue: () => active });
  active = false;
  pending.forEach(resolve => resolve({ status: 'COMPLETED' }));
  await Promise.resolve();
  await Promise.resolve();
  // Resolve any incorrectly launched request as well, so a regression cannot hang the test.
  pending.forEach(resolve => resolve({ status: 'COMPLETED' }));
  await batch;
  expect(request.mock.calls.map(([, payload]) => payload.responseId)).toEqual(['one', 'two', 'three']);
});

it('checks only explicitly reviewable PDF fields and never infers the first submitted URL', async () => {
  request.mockResolvedValue({ status: 'Current', checkedAt: '2026-09-11T01:00:00Z' });
  const deliverable = {
    id: 'mvp-validation',
    fields: [
      { id: 'validationInstrument', definitionId: 'field-form', type: 'googleForm', pdfRequired: false, documentCheckPolicy: 'OFF' },
      { id: 'frameworkModel', definitionId: 'field-framework', type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO' },
      { id: 'responseSheet', definitionId: 'field-sheet', type: 'googleSheet', pdfRequired: false, documentCheckPolicy: 'OFF' },
      { id: 'validationHighlights', definitionId: 'field-highlights', type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO' },
      { id: 'validationEvidence', definitionId: 'field-folder', type: 'driveFolder', pdfRequired: false, documentCheckPolicy: 'OFF' }
    ]
  };
  const response = {
    id: 'response-1',
    deliverableId: deliverable.id,
    updatedAt: '2026-09-11T00:30:00Z',
    values: {
      validationInstrument: 'https://docs.google.com/forms/d/e/form-id/viewform',
      frameworkModel: 'https://drive.google.com/file/d/framework-pdf/view',
      responseSheet: 'https://docs.google.com/spreadsheets/d/sheet-id/edit',
      validationHighlights: 'https://drive.google.com/file/d/highlights-pdf/view',
      validationEvidence: 'https://drive.google.com/drive/folders/evidence-folder'
    }
  };

  const result = await runDocumentChecks('workspace', [response], [deliverable]);

  expect(result.total).toBe(2);
  expect(request.mock.calls.map(([, payload]) => ({ fieldId: payload.fieldId, sourceUrl: payload.sourceUrl }))).toEqual([
    { fieldId: 'field-framework', sourceUrl: 'https://drive.google.com/file/d/framework-pdf/view' },
    { fieldId: 'field-highlights', sourceUrl: 'https://drive.google.com/file/d/highlights-pdf/view' }
  ]);
});

it('continues an AI batch past a saved uncertain result without automatically retrying it', async () => {
  ai.start.mockResolvedValueOnce({ status: 'UNCERTAIN', failureCode: 'PROVIDER_OUTCOME_UNKNOWN', retryToken: 'retry', message: 'Unknown outcome' })
    .mockResolvedValueOnce({ status: 'COMPLETED', reused: true })
    .mockResolvedValueOnce({ status: 'COMPLETED', reused: false });
  const onResult = vi.fn();
  await runAiReviews('workspace', ['uncertain', 'saved', 'new'], { onResult });
  expect(ai.start.mock.calls.map(args => args[1])).toEqual(['uncertain', 'saved', 'new']);
  expect(ai.start.mock.calls.every(args => args[2] === false && args[3] === null)).toBe(true);
  expect(onResult).toHaveBeenCalledTimes(3);
  expect(onResult.mock.calls[0][1].uncertain).toBe(true);
});

it('acknowledges retries only for responses that have retry tokens in a mixed batch', async () => {
  ai.start.mockResolvedValue({ status: 'COMPLETED', reused: false });
  await runAiReviews('workspace', ['fresh', 'retry-me', 'fresh-two'], {
    retryTokens: { 'retry-me': 'retry-token' }
  });
  expect(ai.start.mock.calls.map(args => [args[1], args[2], args[3]])).toEqual([
    ['fresh', false, null],
    ['retry-me', true, 'retry-token'],
    ['fresh-two', false, null]
  ]);
});

it.each(['RATE_LIMITED', 'API_KEY_REJECTED', 'QUEUE_FULL', 'PROVIDER_TIMEOUT', 'PROVIDER_CONNECTION_FAILED'])(
  'pauses an AI batch on %s instead of sending more requests', async (failureCode) => {
    ai.start.mockResolvedValueOnce({ status: 'UNCERTAIN', failureCode, message: 'Blocked' });
    await runAiReviews('workspace', ['first', 'must-not-start']);
    expect(ai.start.mock.calls.map(args => args[1])).toEqual(['first']);
  });

it('stops sending AI batch actions after a workspace change', async () => {
  let active = true;
  ai.start.mockResolvedValueOnce({ status: 'COMPLETED' });
  await runAiReviews('workspace', ['first', 'must-not-start'], {
    shouldContinue: () => active, onResult: () => { active = false; }
  });
  expect(ai.start.mock.calls.map(args => args[1])).toEqual(['first']);
});
