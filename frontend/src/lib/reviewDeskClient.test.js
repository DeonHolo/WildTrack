import { afterEach, expect, it, vi } from 'vitest';
import { runAiReview, runDocumentChecks } from './reviewDeskClient.js';

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
  expect(ai.saved).toHaveBeenCalledWith('workspace', 'response');
});

it('stops polling when the account or workspace changes', async () => {
  vi.useFakeTimers();
  let active = true;
  ai.start.mockResolvedValue({ status: 'RUNNING' });
  const pending = runAiReview('workspace', 'response', false, null, () => active);
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
  const batch = runDocumentChecks('workspace', responses, [], { shouldContinue: () => active });
  active = false;
  pending.forEach(resolve => resolve({ status: 'COMPLETED' }));
  await Promise.resolve();
  await Promise.resolve();
  // Resolve any incorrectly launched request as well, so a regression cannot hang the test.
  pending.forEach(resolve => resolve({ status: 'COMPLETED' }));
  await batch;
  expect(request.mock.calls.map(([, payload]) => payload.responseId)).toEqual(['one', 'two', 'three']);
});
