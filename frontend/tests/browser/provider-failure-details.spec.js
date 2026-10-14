import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

const field = 'field-document-pdf';
const sourceUrl = 'https://drive.google.com/file/d/browser-pdf/view';
const diagnostic = { provider: 'gemini', stage: 'generation', httpStatus: 400,
  providerStatus: 'INVALID_ARGUMENT', reasonCode: 'REQUEST_PARAMETER_REJECTED',
  parameterFields: ['generationConfig.maxOutputTokens'],
  explanation: 'Gemini rejected maxOutputTokens.',
  requestId: 'request-reference-'.repeat(6), model: 'gemini-3.1-flash-lite', elapsedMs: 120 };
const check = { id: 'check-failed', fieldId: field, sourceUrl, status: 'BLOCKED',
  checkedAt: '2026-10-14T13:15:00Z', summary: 'Google Drive could not complete the download.',
  flags: ['Download Failed'], redFlags: ['Download Failed'], missingSections: [],
  metadata: { name: 'Browser SRS.pdf', canDownload: true, mimeType: 'application/pdf' },
  failureDetails: { stage: 'download', category: 'TRANSPORT', code: 'TIMEOUT',
    reason: 'The Google Drive request timed out.', causeType: 'SocketTimeoutException', elapsedMs: 20000 } };
function monitoring(payload) {
  return { ...payload, fileChecksByField: { 'response-1': { [field]: check } },
    aiReviewsByField: { 'response-1': { [field]: { status: 'UNCERTAIN', fieldId: field, sourceUrl,
      message: 'Gemini rejected an AI request setting.', failureCode: 'REQUEST_PARAMETER_REJECTED',
      failureDiagnostics: diagnostic, retryToken: 'retry-one' } } } };
}

for (const width of [375, 820, 1440]) {
  test(`opens saved provider diagnostics and keeps review sort controls usable at ${width}px without starting AI`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installApiFixtures(page, { role: 'admin', submitted: true, monitoring });
    await page.goto('/review');
    const sorter = page.getByRole('textbox', { name: 'Sort by' });
    await expect(sorter).toHaveValue('Newest activity');
    await sorter.click();
    await expect(page.getByRole('option', { name: 'Oldest activity', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Priority', exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: 'Oldest activity', exact: true }).click();
    await expect(sorter).toHaveValue('Oldest activity');
    await page.getByRole('button', { name: /Review DELA CRUZ/ }).click();
    const drawer = page.getByRole('dialog', { name: /Review DELA CRUZ/ });
    const gemini = drawer.getByLabel('Gemini error details');
    await gemini.getByText('Error details', { exact: true }).click();
    await expect(gemini.getByText('400', { exact: true })).toBeVisible();
    await expect(gemini.getByText('INVALID_ARGUMENT', { exact: true })).toBeVisible();
    await expect(gemini.getByText('generationConfig.maxOutputTokens', { exact: true })).toBeVisible();
    await expect(gemini.getByText(diagnostic.explanation, { exact: true })).toBeVisible();
    expect(await gemini.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(drawer.getByRole('button', { name: 'View AI Review', exact: true })).toBeDisabled();
    await drawer.getByRole('button', { name: 'View Document Check', exact: true }).click();
    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Browser SRS.pdf' }) });
    const drive = dialog.getByLabel('Google Drive error details');
    await drive.getByText('Error details', { exact: true }).click();
    await expect(drive.getByText('TIMEOUT', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Accessible', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Allowed', { exact: true })).toBeVisible();
    expect(await drive.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/provider-details-${width}.png` });
    expect(fixture.calls.filter(call => call.method === 'POST' && /ai-reviews|file-checks/.test(call.path))).toEqual([]);
    fixture.assertRequestsHandled();
  });
}
