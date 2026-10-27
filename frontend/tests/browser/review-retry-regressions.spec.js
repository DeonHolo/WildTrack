import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';
import { documentChangeAcknowledgementKey } from '../../src/lib/documentChangeAcknowledgement.js';
import { templatePdf } from './template-pdf-fixture.js';

const workspaceId = '11111111-1111-1111-1111-111111111111';
const fieldId = 'field-document-pdf';
const sourceUrl = 'https://drive.google.com/file/d/browser-pdf/view';
const observation = { changeType: 'CONTENT_CHANGED', firstObservedAt: '2026-10-13T16:20:00',
  lastObservedAt: '2026-10-13T16:20:00', contentIdentifier: 'md5:new-content' };
const savedReport = { outcome: 'ISSUES_IDENTIFIED', summary: 'An earlier saved review.',
  findings: [{ issue: 'A saved finding', source: 'DOCUMENT', evidence: 'Quoted PDF text' }] };
const check = { id: 'check-one', fieldId, sourceUrl, status: 'COMPLETED',
  checkedAt: observation.firstObservedAt, summary: 'PDF is readable.', flags: [],
  metadata: { name: 'Updated PDF.pdf', canDownload: true, mimeType: 'application/pdf' },
  document: { readable: true, pageCount: 12 },
  templateComparison: { available: true, expectedTemplateHeadings: ['Introduction'], detectedTemplateHeadings: ['Introduction'] } };

function monitoring(payload, review) {
  return { ...payload, fileChecksByField: { 'response-1': { [fieldId]: check } },
    observedFileHistoryByField: { 'response-1': { [fieldId]: { observations: [observation] } } },
    aiReviewsByField: review ? { 'response-1': { [fieldId]: review } } : {} };
}

test('never paints an acknowledged PDF-change warning while its first receipt request is pending', async ({ page }) => {
  const fixture = await installApiFixtures(page, { role: 'admin', submitted: true, monitoring });
  const key = documentChangeAcknowledgementKey({ workspaceId, responseId: 'response-1', fieldId }, observation);
  let release;
  let requested = false;
  let delivered = false;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/work-task-dismissals?*', async route => {
    requested = true;
    await pending;
    await route.fulfill({ json: [key] });
    delivered = true;
  });
  await page.goto('/review');
  await page.getByRole('button', { name: /Review DELA CRUZ/ }).click();
  await page.evaluate(() => {
    window.changeNoticePaints = 0;
    window.noticeObserver = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes)
        if (node.nodeType === Node.ELEMENT_NODE && node.textContent.includes('PDF content changed'))
          window.changeNoticePaints++;
    });
    window.noticeObserver.observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole('button', { name: 'View Document Check', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByText('PDF content changed', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.changeNoticePaints)).toBe(0);
  release();
  await expect.poll(() => delivered).toBe(true);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByText('PDF content changed', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.changeNoticePaints)).toBe(0);
  fixture.assertRequestsHandled();
});

test('keeps the outdated warning alongside a failed rerun and its previous saved report', async ({ page }) => {
  const review = { status: 'UNCERTAIN', failureCode: 'REQUEST_REJECTED',
    message: "Gemini rejected WildTrack's AI request (HTTP 400). No review was generated.",
    sourceUrl, sourceVerifiedAt: null, previousGeneratedAt: '2026-10-13T14:55:20Z', previousReport: savedReport };
  const fixture = await installApiFixtures(page, { role: 'admin', submitted: true,
    monitoring: payload => monitoring(payload, review) });
  await page.goto('/review');
  await page.getByRole('button', { name: /Review DELA CRUZ/ }).click();
  await page.getByRole('button', { name: 'View previous AI Review', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'AI Review: Software Requirements Specification' });
  await expect(dialog.getByText('AI Review may be outdated', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Latest AI Review did not finish', { exact: true })).toBeVisible();
  await expect(dialog.getByText('A saved finding')).toBeVisible();
  expect(fixture.calls.filter(call => call.method === 'POST')).toEqual([]);
  fixture.assertRequestsHandled();
});

test('an Adviser can open the official template from their own Document Check', async ({ page, context }) => {
  const fixture = await installApiFixtures(page, { role: 'adviser', submitted: true, monitoring,
    templates: [{ id: 'template-one', deliverableKey: 'SRS', fieldId, displayName: 'SRS template' }] });
  await page.goto('/adviser');
  await page.getByRole('button', { name: 'View Document Check', exact: true }).click();
  const link = page.getByRole('link', { name: 'Open official template' });
  await expect(link).toHaveAttribute('href', '/templates/template-one/preview?workspaceId=' + workspaceId);
  // Popup requests use the same Adviser identity and real application routing.
  await context.route('**/api/**', async route => {
    if (route.request().frame().page() === page) return route.fallback();
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/session') return route.fulfill({ json: {
      authenticated: true, email: 'adviser.browser-test@gmail.com', googleSubject: 'adviser-subject', roles: ['ADVISER'] } });
    if (path === '/api/workspaces') return route.fulfill({ json: [{ id: workspaceId, name: 'IT Capstone', active: true }] });
    if (path === '/api/templates/template-one/structure') {
      expect(new URL(route.request().url()).searchParams.get('workspaceId')).toBe(workspaceId);
      return route.fulfill({ json: { originalFilename: 'Official SRS.pdf', displayName: 'SRS template', sha256: 'template-source',
        expectedHeadings: ['Introduction'], detectedHeadings: ['Introduction'], extractedText: 'Official template body.' } });
    }
    if (path === '/api/templates/template-one/pdf-state') return route.fulfill({ json: {
      templateId: 'template-one', versionId: 'template-version', sourceSha256: 'template-source',
      state: 'READY', pages: 1, originalAvailable: true } });
    if (path === '/api/templates/template-one/pdf') return route.fulfill({
      contentType: 'application/pdf', body: templatePdf() });
    throw new Error('Unexpected Adviser template request: ' + path);
  });
  const popupPromise = page.waitForEvent('popup');
  await link.click();
  const popup = await popupPromise;
  await expect(popup.getByRole('heading', { name: 'Official SRS.pdf' })).toBeVisible();
  await expect(popup.getByRole('link', { name: 'Back to my teams' })).toHaveAttribute('href', '/adviser');
  await expect(popup.getByRole('link', { name: 'Original file' })).toHaveAttribute('href',
    '/api/templates/template-one/file?workspaceId=' + workspaceId);
  await expect(popup.getByRole('link', { name: 'Open PDF', exact: true })).toHaveAttribute('href',
    '/api/templates/template-one/pdf?workspaceId=' + workspaceId + '&versionId=template-version');
  await expect(popup.getByRole('button', { name: 'Prepare AI draft', exact: true })).toHaveCount(0);
  await expect(popup.getByRole('button', { name: 'Approve checklist', exact: true })).toHaveCount(0);
  await popup.close();
  fixture.assertRequestsHandled();
});
