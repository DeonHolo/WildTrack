import { expect, it, vi } from 'vitest';
import { runDocumentChecks } from './reviewDeskClient.js';

const request = vi.hoisted(() => vi.fn());
vi.mock('./api.js', async (original) => ({ ...(await original()), runDocumentCheck: request }));

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
