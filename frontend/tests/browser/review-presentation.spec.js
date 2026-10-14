import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

const field = 'field-document-pdf';
const sourceUrl = 'https://drive.google.com/file/d/browser-pdf/view';
const report = { outcome: 'NO_ISSUES_IN_CHECKED_AREAS', findings: [], verifiedChecks: [
  { aspect: 'Scope identifies users', source: 'DELIVERABLE_REQUIREMENTS', documentEvidence: 'Scope: students and advisers.', requirement: 'Identify intended users.' },
  { aspect: 'Submission workflow described', source: 'OFFICIAL_TEMPLATE', documentEvidence: 'FR-01: submit a PDF.', requirement: 'Functional requirements' }
] };
const review = { status: 'COMPLETED', sourceUrl, generatedAt: '2026-10-14T11:22:46Z', report };
const check = { fieldId: field, sourceUrl, status: 'COMPLETED', checkedAt: '2026-10-14T11:20:00Z',
  summary: 'Readable PDF.', metadata: { name: 'Submitted PDF.pdf', mimeType: 'application/pdf', canDownload: true },
  document: { readable: true, pageCount: 5 }, flags: [], missingSections: [] };
function savedMonitoring(payload) {
  return { ...payload, fileChecksByField: { 'response-1': { [field]: check } },
    aiReviewsByField: { 'response-1': { [field]: review } } };
}
function batch(entries) {
  return { id: 'saved-browser-batch', state: 'COMPLETED', version: 11, entries,
    selectedDocuments: entries.length, uniqueDocuments: entries.length, completedDocuments: entries.length,
    totalPdfs: entries.length, pendingDocuments: 0, message: 'Saved results are available.' };
}
function entry(responseId = 'response-1', url = sourceUrl) {
  return { target: { responseId, fieldId: field }, preview: { key: 'same-shared-pdf', category: 'FAILED', sourceUrl: url },
    identity: { sourceUrl: url }, phase: 'DONE', resultStatus: 'COMPLETED', error: '' };
}
async function installSavedBatch(page, entries) {
  await page.route('**/api/ai-reviews/batches/latest**', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(batch(entries))
  }));
}
function paidRequests(page) {
  const calls = [];
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.includes('/api/ai-reviews')) calls.push(request.url());
  });
  return calls;
}

for (const width of [375, 820, 1440]) {
  test(`keeps review actions in two complete rows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    const fixture = await installApiFixtures(page, { role: 'admin', submitted: true, monitoring: savedMonitoring });
    await page.goto('/review?response=response-1');
    const actions = page.getByRole('group', { name: 'Document and AI Review actions' });
    const buttons = actions.getByRole('button');
    await expect(buttons).toHaveText(['View Document Check', 'View AI Review', 'Rerun Document Check', 'Rerun AI Review']);
    const boxes = await Promise.all([0, 1, 2, 3].map(index => buttons.nth(index).boundingBox()));
    expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(2);
    expect(Math.abs(boxes[2].y - boxes[3].y)).toBeLessThan(2);
    expect(boxes[2].y).toBeGreaterThan(boxes[0].y + boxes[0].height);
    expect(Math.abs(boxes[0].x - boxes[2].x)).toBeLessThan(2);
    for (const button of await buttons.all()) {
      expect(await button.evaluate(node => {
        const label = node.querySelector('.mantine-Button-label');
        return label.scrollWidth <= label.clientWidth + 1 && label.scrollHeight <= label.clientHeight + 1;
      })).toBe(true);
    }
    fixture.assertRequestsHandled();
  });
}

test('keeps unavailable view actions in place and makes only the first document run available', async ({ page }) => {
  const calls = paidRequests(page);
  const fixture = await installApiFixtures(page, { role: 'admin', submitted: true });
  await page.goto('/review?response=response-1');
  const actions = page.getByRole('group', { name: 'Document and AI Review actions' });
  await expect(actions.getByRole('button', { name: 'View Document Check' })).toBeDisabled();
  await expect(actions.getByRole('button', { name: 'View AI Review' })).toBeDisabled();
  await expect(actions.getByRole('button', { name: 'Run Document Check' })).toBeEnabled();
  await expect(actions.getByRole('button', { name: 'Run AI Review' })).toBeDisabled();
  expect(calls).toEqual([]);
  fixture.assertRequestsHandled();
});

test('opens the saved successful result and quoted PDF evidence without another AI request', async ({ page }) => {
  const calls = paidRequests(page);
  const fixture = await installApiFixtures(page, { role: 'admin', submitted: true, monitoring: savedMonitoring });
  await installSavedBatch(page, [entry()]);
  await page.goto('/review');
  await page.getByRole('button', { name: 'Check saved reviews' }).click();
  const ai = page.getByRole('dialog', { name: 'AI Review: Software Requirements Specification' });
  await expect(ai).toBeVisible();
  await expect(ai.getByText(/Artifact:/)).toHaveCount(0);
  await ai.getByText('Checks with supporting excerpts (2)').click();
  await expect(ai.getByText(/PDF excerpts quote the extracted document text/)).toBeVisible();
  await expect(ai.locator('blockquote').first()).toHaveText('Scope: students and advisers.');
  await expect(ai.getByText('PDF excerpt', { exact: true })).toHaveCount(2);
  expect(calls).toEqual([]);
  fixture.assertRequestsHandled();
});

test('opens the chosen saved submission and returns to a deduplicated chooser', async ({ page }) => {
  const calls = paidRequests(page);
  const secondUrl = 'https://drive.google.com/file/d/second-pdf/view';
  const fixture = await installApiFixtures(page, { role: 'admin', submitted: true, monitoring: payload => {
    const second = { ...payload.responses[0], id: 'response-2', studentNumber: '22-1001-002', studentName: 'SECOND STUDENT',
      valuesJson: JSON.stringify({ documentPdf: secondUrl }) };
    return { ...savedMonitoring(payload), responses: [...payload.responses, second],
      reviewStates: { ...payload.reviewStates, 'response-2': { feedback: [], acceptance: null } },
      fileChecksByField: { 'response-1': { [field]: check }, 'response-2': { [field]: { ...check, sourceUrl: secondUrl } } },
      aiReviewsByField: { 'response-1': { [field]: review }, 'response-2': { [field]: { ...review, sourceUrl: secondUrl,
        report: { findings: [{ issue: 'Second saved PDF review', source: 'DOCUMENT', evidence: 'Second exact PDF excerpt.' }] } } } } };
  } });
  await installSavedBatch(page, [entry(), entry(), entry('response-2', secondUrl)]);
  await page.goto('/review');
  await page.getByRole('button', { name: 'Check saved reviews' }).click();
  const chooser = page.getByRole('dialog', { name: 'Saved AI Reviews' });
  await expect(chooser.getByRole('button')).toHaveCount(3);
  await chooser.getByRole('button', { name: /View review:.*SECOND STUDENT/ }).click();
  const ai = page.getByRole('dialog', { name: 'AI Review: Software Requirements Specification' });
  await expect(ai.getByText('Second saved PDF review')).toBeVisible();
  await ai.getByRole('button', { name: 'Close AI Review details' }).click();
  await expect(chooser).toBeVisible();
  expect(calls).toEqual([]);
  fixture.assertRequestsHandled();
});
