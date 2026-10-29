import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

const restriction = 'The submitted Drive PDF could not be opened. Google Drive reported a file-access or download restriction.';
const entry = (id, category, extra = {}) => ({ target: { responseId: id, fieldId: 'field-document-pdf' },
  phase: 'DONE', selected: true, resultStatus: 'COMPLETED', error: '',
  preview: { key: id, category, responseId: id, fieldId: 'field-document-pdf', deliverableTitle: 'SRS', studentName: 'Example Student', artifactLabel: 'PDF Drive Link' }, ...extra });
const failed = entry('failed', 'FAILED', { resultStatus: 'FAILED', error: 'Gemini returned an incomplete or invalid review.' });
const manual = entry('manual', 'INCONCLUSIVE', { error: 'Limited review coverage or manual verification needed.' });
const access = entry('access', 'FAILED', { resultStatus: 'FAILED', noAiStarted: true, error: restriction });
const clean = entry('clean', 'CLEAN');
const batch = (id, state, entries) => ({ id, state, version: 1, entries, totalPdfs: entries.length,
  preparedPdfs: entries.length, selectedDocuments: entries.length, completedDocuments: entries.length, message: 'AI Review batch finished.' });

for (const width of [390, 1440]) test(`technical retry and Check in PDF scopes stay separate at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 950 });
  await installApiFixtures(page, { role: 'admin', submitted: true });
  await page.route('**/api/ai-reviews/status', route => route.fulfill({ json: { configured: true } }));
  let saved = batch('finished', 'COMPLETED', [failed, manual, access, clean]);
  const preparations = [], starts = [];
  await page.route('**/api/ai-reviews/batches**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path.endsWith('/batches')) {
      preparations.push(request.postDataJSON().targets);
      const entries = preparations.length === 1 ? [failed] : [failed, manual, clean];
      saved = batch(`prepared-${preparations.length}`, 'READY', entries);
    } else if (request.method() === 'POST') starts.push(path);
    await route.fulfill({ json: saved });
  });
  await page.goto('/review');
  await expect(page.getByRole('table', { name: 'All deliverables submissions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show PDFs with failed AI Reviews' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry failed AI Reviews (1)', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'AI review submissions' });
  await expect(dialog.getByText('1 unique review to run', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Only PDFs with technical failures/)).toBeVisible();
  expect(preparations).toEqual([[failed.target]]);
  expect(starts).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`failed-review-confirmation-${width}.png`) });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'AI review all', exact: true }).click();
  await page.getByRole('button', { name: 'Start precheck', exact: true }).click();
  await page.getByRole('button', { name: 'Choose review scope', exact: true }).click();
  await expect(dialog.getByText('1 unique review to run', { exact: true })).toBeVisible();
  await dialog.getByRole('radio', { name: 'Check in PDF reviews only', exact: true }).check();
  await expect(dialog.getByText('1 unique review to run', { exact: true })).toBeVisible();
  await dialog.getByRole('radio', { name: 'Failed AI Reviews only', exact: true }).check();
  await expect(dialog.getByText('1 unique review to run', { exact: true })).toBeVisible();
  await dialog.getByRole('radio', { name: 'Include successful reviews too', exact: true }).check();
  await expect(dialog.getByText('3 unique reviews to run', { exact: true })).toBeVisible();
  expect(starts).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`review-scope-options-${width}.png`) });
});
