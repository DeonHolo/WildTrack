import { afterEach, expect, it, vi } from 'vitest';
import { applyArtifactAiReview, runAiReview, runAiReviews, runDocumentChecks } from './reviewDeskClient.js';

const request = vi.hoisted(() => vi.fn());
const batchRequest = vi.hoisted(() => vi.fn());
const ai = vi.hoisted(() => ({ start: vi.fn(), saved: vi.fn(), session: vi.fn() }));
vi.mock('./api.js', async (original) => ({ ...(await original()), runDocumentCheck: request,
  runDocumentCheckBatch: batchRequest, requestAiReview: ai.start, getSavedAiReview: ai.saved,
  getCurrentSession: ai.session }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

const twoVerifiedChecks = [
  { aspect: 'Scope identifies student users', source: 'DELIVERABLE_REQUIREMENTS',
    documentEvidence: 'Section 1.3: The system is used by capstone students.',
    requirement: 'Describe the system scope and intended users.' },
  { aspect: 'Functional requirement covers submission', source: 'OFFICIAL_TEMPLATE',
    documentEvidence: 'FR-01: Students submit PDF links for review.',
    requirement: '3.2 Functional requirements' }
];

it('polls a running AI job without submitting a second generation request', async () => {
  vi.useFakeTimers();
  ai.start.mockResolvedValue({ status: 'RUNNING', reused: false });
  ai.saved.mockResolvedValue({ status: 'COMPLETED', reused: true, report: {
    summary: 'Feedback', verifiedChecks: twoVerifiedChecks } });
  const pending = runAiReview('workspace', 'response');
  await vi.advanceTimersByTimeAsync(2500);
  const result = await pending;
  expect(result.ok).toBe(true);
  expect(result.review.reused).toBe(false);
  expect(ai.start).toHaveBeenCalledTimes(1);
  expect(ai.saved).toHaveBeenCalledWith('workspace', 'response', null);
});

it('treats a completed summary-only zero-issue report as inconclusive even if it claims success', async () => {
  ai.start.mockResolvedValueOnce({ status: 'COMPLETED', report: {
    summary: 'The document satisfies all requirements.', findings: [], missingRequiredSections: [] } });

  const result = await runAiReview('workspace', 'response');

  expect(result).toMatchObject({ ok: false, inconclusive: true,
    error: expect.stringContaining('inconclusive, not verification') });
  expect(ai.start).toHaveBeenCalledTimes(1);
  expect(ai.saved).not.toHaveBeenCalled();
});

it('marks insufficient grounded positive observations inconclusive without silently retrying Gemini', async () => {
  ai.start.mockResolvedValueOnce({ status: 'UNCERTAIN', failureCode: 'INSUFFICIENT_REVIEW_EVIDENCE',
    message: 'Only one distinct evidence-backed check survived validation.', retryToken: 'retry-token' });

  const result = await runAiReview('workspace', 'response', 'field-pdf');

  expect(result).toMatchObject({ ok: false, inconclusive: true, uncertain: true,
    error: 'Only one distinct evidence-backed check survived validation.',
    review: { failureCode: 'INSUFFICIENT_REVIEW_EVIDENCE', retryToken: 'retry-token' } });
  expect(ai.start).toHaveBeenCalledTimes(1);
  expect(ai.saved).not.toHaveBeenCalled();
});

it('checks actual session state after an AI polling 401 and never retries the paid request', async () => {
  vi.useFakeTimers();
  ai.start.mockResolvedValueOnce({ status: 'RUNNING', fieldId: 'field-pdf' });
  ai.saved.mockRejectedValueOnce(Object.assign(new Error('Request failed with status 401'), { status: 401 }));
  ai.session.mockResolvedValueOnce({ authenticated: false });

  const pending = runAiReview('workspace', 'response', 'field-pdf');
  await vi.advanceTimersByTimeAsync(2500);
  const result = await pending;

  expect(result).toMatchObject({ ok: false, pauseBatch: true, authenticationRequired: true,
    error: expect.stringContaining('Continue with Google without signing out first') });
  expect(result.review).toBeUndefined();
  expect(ai.session).toHaveBeenCalledTimes(1);
  expect(ai.start).toHaveBeenCalledTimes(1);
  expect(ai.saved).toHaveBeenCalledTimes(1);
});

it('fails fast after an AI endpoint 401 without repeating paid requests or declaring session expiry', async () => {
  ai.start.mockRejectedValueOnce(Object.assign(new Error('Request failed with status 401'), { status: 401 }));
  ai.session.mockResolvedValueOnce({ authenticated: true, roles: ['ADMIN'] });
  const onResult = vi.fn();

  const outcome = await runAiReviews('workspace', ['first', 'must-not-start', 'also-must-not-start'], { onResult });

  expect(outcome).toEqual({ completed: 1, total: 3, paused: true, authenticationRequired: false,
    sessionConfirmed: true, reason: expect.stringContaining('still recognizes your Administrator session') });
  expect(onResult).toHaveBeenCalledTimes(1);
  expect(onResult.mock.calls[0][1]).toMatchObject({ authenticationRequired: false,
    sessionConfirmed: true, pauseBatch: true });
  expect(ai.start.mock.calls.map(args => args[1])).toEqual(['first']);
  expect(ai.saved).not.toHaveBeenCalled();
});

it('surfaces a forbidden AI POST without claiming session expiry or automatically repeating generation', async () => {
  ai.start.mockRejectedValueOnce(Object.assign(new Error('Request failed with status 403'), { status: 403 }));
  const result = await runAiReview('workspace', 'response', 'field-pdf');

  expect(result).toMatchObject({ ok: false, pauseBatch: true, authenticationRequired: false,
    error: expect.stringContaining('returned HTTP 403') });
  expect(result.error).toContain('XSRF cookie/security header or insufficient access');
  expect(result.error).toContain('Check saved reviews');
  expect(ai.start).toHaveBeenCalledTimes(1);
  expect(ai.saved).not.toHaveBeenCalled();
  expect(ai.session).not.toHaveBeenCalled();
});

it('continues past a confirmed preclaim inaccessible PDF without a Gemini retry or a false completed report', async () => {
  ai.start.mockRejectedValueOnce(Object.assign(new Error(
    'The submitted Drive PDF is inaccessible. Check its link and sharing permissions.'), { status: 422 }));
  ai.start.mockResolvedValueOnce({ status: 'COMPLETED', report: {
    summary: 'Source-grounded observations', verifiedChecks: twoVerifiedChecks
  } });
  const onResult = vi.fn();

  const outcome = await runAiReviews('workspace', ['inaccessible-pdf', 'next-pdf'], { onResult });

  expect(outcome).toEqual({ completed: 2, total: 2, paused: false });
  expect(onResult.mock.calls[0][1]).toMatchObject({
    ok: false, pauseBatch: false, notStarted: true,
    error: expect.stringContaining('Drive PDF is inaccessible')
  });
  expect(onResult.mock.calls[1][1]).toMatchObject({ ok: true, pauseBatch: false });
  expect(ai.start.mock.calls.map(args => args[1])).toEqual(['inaccessible-pdf', 'next-pdf']);
  expect(ai.saved).not.toHaveBeenCalled();
  expect(ai.session).not.toHaveBeenCalled();
});

it('recovers a transient polling 401 with one read-only retry only after Administrator session verification', async () => {
  vi.useFakeTimers();
  ai.start.mockResolvedValueOnce({ status: 'RUNNING', fieldId: 'field-pdf', reused: false });
  ai.saved.mockRejectedValueOnce(Object.assign(new Error('HTTP 401'), { status: 401 }))
    .mockResolvedValueOnce({ status: 'COMPLETED', fieldId: 'field-pdf', report: {
      summary: 'The sampled sections have source-backed observations.', verifiedChecks: twoVerifiedChecks
    } });
  ai.session.mockResolvedValueOnce({ authenticated: true, roles: ['ADMIN'] });

  const pending = runAiReview('workspace', 'response', 'field-pdf');
  await vi.advanceTimersByTimeAsync(2500);
  const result = await pending;

  expect(result).toMatchObject({ ok: true, review: { status: 'COMPLETED' } });
  expect(ai.start).toHaveBeenCalledTimes(1);
  expect(ai.saved).toHaveBeenCalledTimes(2);
  expect(ai.session).toHaveBeenCalledTimes(1);
});

it('does not loop on a persistent polling 401 after one authenticated read recovery', async () => {
  vi.useFakeTimers();
  ai.start.mockResolvedValueOnce({ status: 'RUNNING', fieldId: 'field-pdf' });
  ai.saved.mockRejectedValue(Object.assign(new Error('HTTP 401'), { status: 401 }));
  ai.session.mockResolvedValue({ authenticated: true, roles: ['ADMIN'] });

  const pending = runAiReview('workspace', 'response', 'field-pdf');
  await vi.advanceTimersByTimeAsync(2500);
  const result = await pending;

  expect(result).toMatchObject({ ok: false, pauseBatch: true, authenticationRequired: false,
    sessionConfirmed: true });
  expect(ai.start).toHaveBeenCalledTimes(1);
  expect(ai.saved).toHaveBeenCalledTimes(2);
  expect(ai.session).toHaveBeenCalledTimes(2);
});

it('does not suggest signing out if the read-only session diagnostic itself fails', async () => {
  ai.start.mockRejectedValueOnce(Object.assign(new Error('Request failed with status 401'), { status: 401 }));
  ai.session.mockRejectedValueOnce(new Error('Upstream unavailable'));

  const result = await runAiReview('workspace', 'response');

  expect(result).toMatchObject({ ok: false, pauseBatch: true, authenticationRequired: false,
    sessionConfirmed: false, error: expect.stringContaining('could not verify the current session') });
  expect(ai.start).toHaveBeenCalledTimes(1);
  expect(ai.session).toHaveBeenCalledTimes(1);
  expect(ai.saved).not.toHaveBeenCalled();
});

it('explains a backend-reported missing AI cookie when a separate session check remains authenticated', async () => {
  ai.start.mockRejectedValueOnce(Object.assign(new Error('HTTP 401'), {
    status: 401, sessionState: 'missing_cookie'
  }));
  ai.session.mockResolvedValueOnce({ authenticated: true, roles: ['ADMIN'] });

  const result = await runAiReview('workspace', 'response');

  expect(result).toMatchObject({ authenticationRequired: false, sessionConfirmed: true,
    error: expect.stringContaining('did not receive a WildTrack session cookie') });
  expect(result.error).toContain('logging out again is unlikely to help');
  expect(ai.start).toHaveBeenCalledTimes(1);
  expect(ai.saved).not.toHaveBeenCalled();
});

it('keeps Gemini API_KEY_REJECTED distinct from an expired WildTrack sign-in', async () => {
  ai.start.mockResolvedValueOnce({ status: 'UNCERTAIN', failureCode: 'API_KEY_REJECTED',
    message: 'Gemini rejected the API key or its permissions.' });

  const result = await runAiReview('workspace', 'response');

  expect(result).toMatchObject({ ok: false, pauseBatch: true, uncertain: true,
    error: 'Gemini rejected the API key or its permissions.' });
  expect(result.authenticationRequired).toBeUndefined();
  expect(ai.start).toHaveBeenCalledTimes(1);
  expect(ai.saved).not.toHaveBeenCalled();
});

it('sends an explicit rerun flag for a current saved PDF and replaces its report with the newly completed saved result', async () => {
  vi.useFakeTimers();
  ai.start.mockResolvedValueOnce({ status: 'RUNNING', reused: false, fieldId: 'field-pdf' });
  ai.saved.mockResolvedValueOnce({ status: 'COMPLETED', fieldId: 'field-pdf', reused: false,
    report: { summary: 'New rerun output', verifiedChecks: twoVerifiedChecks },
    sourceUrl: 'https://drive.test/file', generatedAt: '2026-09-22T05:00:00Z' });
  const pending = runAiReview('workspace', 'response', 'field-pdf', false, null, () => true, true);
  await vi.advanceTimersByTimeAsync(2500);
  const result = await pending;
  expect(ai.start).toHaveBeenCalledTimes(1);
  expect(ai.start).toHaveBeenCalledWith('workspace', 'response', false, null, 'field-pdf', true);
  expect(ai.saved).toHaveBeenCalledWith('workspace', 'response', 'field-pdf');
  expect(result).toMatchObject({ ok: true, review: {
    fieldId: 'field-pdf', report: { summary: 'New rerun output', verifiedChecks: twoVerifiedChecks }, reused: false
  } });
});

it('surfaces a quota-limited rerun and never silently sends another generation request', async () => {
  vi.useFakeTimers();
  ai.start.mockResolvedValueOnce({ status: 'RUNNING', fieldId: 'field-pdf' });
  ai.saved.mockResolvedValueOnce({ status: 'UNCERTAIN', fieldId: 'field-pdf', failureCode: 'RATE_LIMITED',
    retryToken: 'retry-token', message: "Gemini's quota or rate limit was reached." });
  const pending = runAiReview('workspace', 'response', 'field-pdf', false, null, () => true, true);
  await vi.advanceTimersByTimeAsync(2500);
  const result = await pending;
  expect(result).toMatchObject({ ok: false, uncertain: true, pauseBatch: true,
    error: "Gemini's quota or rate limit was reached.", review: { retryToken: 'retry-token' } });
  expect(ai.start).toHaveBeenCalledTimes(1);
  expect(ai.start).toHaveBeenCalledWith('workspace', 'response', false, null, 'field-pdf', true);
});

it.each(['NO_GROUNDED_FINDINGS', 'FINDINGS_FILTERED'])(
  'marks a %s rerun inconclusive without hiding the previous saved substantive report', async (failureCode) => {
    vi.useFakeTimers();
    ai.start.mockResolvedValueOnce({ status: 'RUNNING', fieldId: 'field-pdf', previousReport: {
      summary: 'Grounded findings from the previous saved run.'
    } });
    ai.saved.mockResolvedValueOnce({ status: 'UNCERTAIN', fieldId: 'field-pdf', failureCode,
      message: 'The new run could not establish source-grounded findings.', retryToken: 'retry-token',
      previousReport: { summary: 'Grounded findings from the previous saved run.', findings: [{
        issue: 'A document issue.', source: 'DOCUMENT', evidence: 'Exact PDF passage'
      }] }, previousGeneratedAt: '2026-09-22T08:00:00Z' });
    const pending = runAiReview('workspace', 'response', 'field-pdf', false, null, () => true, true);
    await vi.advanceTimersByTimeAsync(2500);
    const result = await pending;
    expect(result).toMatchObject({ ok: false, inconclusive: true, uncertain: true, pauseBatch: false,
      review: { status: 'UNCERTAIN', failureCode, previousReport: { summary: 'Grounded findings from the previous saved run.' },
        previousGeneratedAt: '2026-09-22T08:00:00Z' } });
    expect(ai.start).toHaveBeenCalledTimes(1);
    expect(ai.saved).toHaveBeenCalledTimes(1);
  });

it('retains a previous substantive report in the response model after an uncertain rerun', () => {
  const response = { deliverableId: 'deliverable-1', values: { documentPdf: 'https://drive.test/pdf' },
    updatedAt: '2026-09-22T01:00:00Z', artifactAiReviews: { 'field-pdf': {
      status: 'COMPLETED', report: { summary: 'Original finding' }
    } } };
  const review = { fieldId: 'field-pdf', status: 'UNCERTAIN', failureCode: 'NO_GROUNDED_FINDINGS',
    sourceUrl: response.values.documentPdf, sourceResponseUpdatedAt: response.updatedAt,
    previousReport: { summary: 'Original finding' }, previousGeneratedAt: '2026-09-22T02:00:00Z' };
  const updated = applyArtifactAiReview(response, review);
  expect(updated.artifactAiReviews['field-pdf']).toEqual(review);
  expect(updated.artifactAiReviews['field-pdf'].report).toBeUndefined();
  expect(updated.artifactAiReviews['field-pdf'].previousReport).toEqual({ summary: 'Original finding' });
});

it('does not misclassify a pre-existing completed generic fallback as a successful new review', async () => {
  const generic = {
    summary: 'The AI review returned no grounded findings from the submitted PDF or supplied requirement sources.',
    findings: [], missingRequiredSections: [], limitations: ['No official template was supplied.']
  };
  ai.start.mockResolvedValueOnce({ status: 'COMPLETED', report: generic, reused: true });
  const result = await runAiReview('workspace', 'response', 'field-pdf');
  expect(result).toMatchObject({ ok: false, inconclusive: true, uncertain: false,
    review: { status: 'COMPLETED', report: generic },
    error: expect.stringContaining('inconclusive, not verification') });
  expect(ai.start).toHaveBeenCalledTimes(1);
  expect(ai.saved).not.toHaveBeenCalled();
});

it('surfaces a failed rerun POST without replacing the saved report with a fictitious result', async () => {
  ai.start.mockRejectedValueOnce(Object.assign(new Error('Quota exceeded (429)'), { status: 429 }));
  const result = await runAiReview('workspace', 'response', 'field-pdf', false, null, () => true, true);
  expect(result).toMatchObject({ ok: false, pauseBatch: true, error: 'Quota exceeded (429)' });
  expect(result.review).toBeUndefined();
  expect(ai.saved).not.toHaveBeenCalled();
  expect(ai.start).toHaveBeenCalledTimes(1);
});

it('applies the backend legacy field ID to both legacy and migrated PDF view models', () => {
  const response = { deliverableId: 'deliverable-1', values: { documentPdf: 'https://drive.test/pdf' },
    updatedAt: '2026-09-22T01:00:00Z', aiReviewState: { status: 'COMPLETED', report: { summary: 'Old report' } } };
  const review = { fieldId: 'deliverable-1:legacy', status: 'COMPLETED', sourceUrl: response.values.documentPdf,
    generatedAt: '2026-09-22T02:00:00Z', sourceResponseUpdatedAt: response.updatedAt,
    report: { summary: 'Rerun result from backend' } };
  const updated = applyArtifactAiReview(response, review);
  expect(updated.aiReviewState?.report?.summary).toBe('Rerun result from backend');
  expect(updated.aiReport?.summary).toBe('Rerun result from backend');
  expect(updated.artifactAiReviews['deliverable-1:legacy']?.report?.summary).toBe('Rerun result from backend');
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

const srs = {
  id: 'SRS', trackerColumn: 'Refactored SRS',
  fields: [{ id: 'documentPdf', definitionId: 'field-pdf', type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO' }]
};

function response(id, sourceUrl, deliverableId = 'SRS') {
  return {
    id, deliverableId, updatedAt: `2026-09-22T12:00:${String(Number(id.replace(/\D/g, '')) % 60).padStart(2, '0')}+08:00`,
    values: { documentPdf: sourceUrl }
  };
}

it('groups all students sharing a canonical Drive file before chunking across many file groups', async () => {
  const sharedFile = 'shared-canonical-drive-id';
  const shared = [
    `https://drive.google.com/file/d/${sharedFile}/view`,
    `https://drive.google.com/open?id=${sharedFile}`,
    `https://drive.google.com/uc?export=download&id=${sharedFile}`,
    `https://DRIVE.GOOGLE.COM/file/d/${sharedFile}/view?usp=sharing`,
    `https://drive.google.com/open?ID=${sharedFile}&resourcekey=0-123`
  ];
  // Interleave the five students with enough other files to cross both the
  // previous 30-target boundary and several 8-file group boundaries.
  const responses = Array.from({ length: 67 }, (_, index) => response(`student-${index + 1}`,
    [0, 12, 30, 43, 66].includes(index)
      ? shared[[0, 12, 30, 43, 66].indexOf(index)]
      : `https://drive.google.com/file/d/file-${Math.floor(index / 2)}/view`));
  const expectedIds = new Set(responses.map((item) => {
    const url = new URL(item.values.documentPdf);
    return url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || [...url.searchParams.entries()].find(([key]) => key.toLowerCase() === 'id')?.[1];
  }));
  const progress = [];
  batchRequest.mockImplementation(async (_workspace, payload) => payload.map((item) => ({
    responseId: item.responseId, fieldId: item.fieldId,
    report: { status: 'COMPLETED', fieldId: item.fieldId, sourceResponseUpdatedAt: item.sourceResponseUpdatedAt, sourceUrl: item.sourceUrl },
    error: null
  })).reverse());

  const outcome = await runDocumentChecks('workspace', responses, [srs], {
    useDedup: true, onProgress: (value) => progress.push(value)
  });

  expect(batchRequest.mock.calls.length).toBeGreaterThan(2);
  const seen = new Map();
  for (const [, payload] of batchRequest.mock.calls) {
    expect(payload.length).toBeLessThanOrEqual(40);
    const files = new Set(payload.map((item) => {
      const url = new URL(item.sourceUrl);
      return url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || [...url.searchParams.entries()].find(([key]) => key.toLowerCase() === 'id')?.[1];
    }));
    expect(files.size).toBeLessThanOrEqual(8);
    files.forEach((file) => seen.set(file, (seen.get(file) || 0) + 1));
    const common = payload.filter((item) => shared.includes(item.sourceUrl));
    if (common.length) expect(common).toHaveLength(5);
  }
  expect(new Set(seen.keys())).toEqual(expectedIds);
  expect([...seen.values()].every((count) => count === 1)).toBe(true);
  expect(request).not.toHaveBeenCalled();
  expect(outcome).toMatchObject({ ok: true, cancelled: false, completed: 67, total: 67, failed: 0 });
  expect(outcome.results).toHaveLength(67);
  expect(new Set(outcome.results.map((item) => item.attemptId)))
    .toEqual(new Set(responses.map((item) => item.id)));
  for (const item of outcome.results) {
    expect(item.report.fieldId).toBe('field-pdf');
    expect(item.report.sourceUrl).toBe(responses.find((candidate) => candidate.id === item.attemptId).values.documentPdf);
  }
  expect(progress).toHaveLength(batchRequest.mock.calls.length);
  expect(progress.at(-1)).toEqual({ completed: 67, total: 67 });
  expect(progress.map((value) => value.completed)).toEqual([...progress.map((value) => value.completed)].sort((a, b) => a - b));
});

it('preserves distinct response and PDF field reports when the same file is submitted for multiple artifacts', async () => {
  const deliverable = {
    ...srs,
    fields: [...srs.fields, { id: 'appendixPdf', definitionId: 'field-appendix', type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO' }]
  };
  const first = response('response-1', 'https://drive.google.com/file/d/shared-id/view');
  first.values.appendixPdf = 'https://drive.google.com/open?id=shared-id';
  const second = response('response-2', 'https://drive.google.com/file/d/shared-id/view');
  second.values.appendixPdf = 'https://drive.google.com/file/d/other-id/view';
  batchRequest.mockImplementation(async (_workspace, payload) => payload.map((item) => ({
    responseId: item.responseId, fieldId: item.fieldId,
    report: { fieldId: item.fieldId, responseId: item.responseId, sourceUrl: item.sourceUrl }, error: null
  })).reverse());

  const result = await runDocumentChecks('workspace', [first, second], [deliverable], { useDedup: true });
  expect(batchRequest).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({ ok: true, completed: 4, total: 4, failed: 0 });
  expect(result.results.map((item) => [item.attemptId, item.fieldId, item.fieldKey])).toEqual([
    ['response-1', 'field-pdf', 'documentPdf'], ['response-1', 'field-appendix', 'appendixPdf'],
    ['response-2', 'field-pdf', 'documentPdf'], ['response-2', 'field-appendix', 'appendixPdf']
  ]);
  expect(result.results.every((item) => item.report.fieldId === item.fieldId && item.report.responseId === item.attemptId)).toBe(true);
});

it('counts missing per-artifact responses and a failed chunk while continuing with the remaining file groups', async () => {
  const responses = Array.from({ length: 20 }, (_, index) => response(`response-${index + 1}`, `https://drive.google.com/file/d/file-${index}/view`));
  batchRequest.mockImplementationOnce(async (_workspace, payload) => payload.slice(1).map((item) => ({
    responseId: item.responseId, fieldId: item.fieldId, report: { fieldId: item.fieldId }, error: null
  }))).mockRejectedValueOnce(new Error('Temporary batch failure'))
    .mockImplementationOnce(async (_workspace, payload) => payload.map((item) => ({
      responseId: item.responseId, fieldId: item.fieldId, report: { fieldId: item.fieldId }, error: null
    })));

  const result = await runDocumentChecks('workspace', responses, [srs], { useDedup: true });
  expect(batchRequest).toHaveBeenCalledTimes(3);
  expect(result).toMatchObject({ ok: false, cancelled: false, completed: 20, total: 20, failed: 9 });
  expect(result.results).toHaveLength(20);
  expect(result.results[0]).toMatchObject({ attemptId: 'response-1', ok: false, error: expect.stringContaining('did not return') });
  expect(result.results.filter((entry) => entry.error === 'Temporary batch failure')).toHaveLength(8);
  expect(result.results.at(-1).ok).toBe(true);
});

it('stops starting new deduplicated chunks after the caller cancels', async () => {
  const responses = Array.from({ length: 17 }, (_, index) => response(`response-${index + 1}`, `https://drive.google.com/file/d/file-${index}/view`));
  let continueRunning = true;
  let releaseFirst;
  batchRequest.mockImplementationOnce(() => new Promise((resolve) => { releaseFirst = resolve; }));
  const running = runDocumentChecks('workspace', responses, [srs], {
    useDedup: true, shouldContinue: () => continueRunning
  });
  continueRunning = false;
  releaseFirst(batchRequest.mock.calls[0][1].map((item) => ({ responseId: item.responseId, fieldId: item.fieldId, report: { fieldId: item.fieldId } })));
  const result = await running;
  expect(batchRequest).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({ cancelled: true, completed: 8, total: 17, failed: 0 });
});

it('keeps a large shared-file group intact even when it exceeds the normal 40-target chunk size', async () => {
  const responses = Array.from({ length: 46 }, (_, index) => response(`response-${index + 1}`,
    index === 0 ? 'https://drive.google.com/file/d/independent/view'
      : index % 2 ? 'https://drive.google.com/file/d/one-shared-pdf/view'
        : 'https://drive.google.com/open?id=one-shared-pdf'));
  batchRequest.mockImplementation(async (_workspace, payload) => payload.map((item) => ({
    responseId: item.responseId, fieldId: item.fieldId, report: { fieldId: item.fieldId }
  })));

  const result = await runDocumentChecks('workspace', responses, [srs], { useDedup: true });
  expect(batchRequest).toHaveBeenCalledTimes(2);
  expect(batchRequest.mock.calls[0][1]).toHaveLength(1);
  expect(batchRequest.mock.calls[1][1]).toHaveLength(45);
  expect(result).toMatchObject({ ok: true, completed: 46, total: 46, failed: 0 });
});

it('reports an over-400-target shared-file group without splitting it into repeated downloads', async () => {
  const responses = Array.from({ length: 401 }, (_, index) => response(`response-${index + 1}`,
    'https://drive.google.com/file/d/one-shared-pdf/view'));
  const result = await runDocumentChecks('workspace', responses, [srs], { useDedup: true });
  expect(batchRequest).not.toHaveBeenCalled();
  expect(result).toMatchObject({ ok: false, cancelled: false, completed: 401, total: 401, failed: 401 });
  expect(result.results[0].error).toMatch(/More than 400 submissions/);
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
