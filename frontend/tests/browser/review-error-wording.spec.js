import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

for (const width of [375, 1440]) {
  test(`provider error labels stay short and explanations stay expandable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1050 });
    const fixture = await installApiFixtures(page, { role: 'admin', submitted: true });
    const identity = name => ({ fileName: `${name}.pdf`, deliverableTitle: 'SRS', studentName: 'Example Student',
      artifactLabel: 'PDF Drive Link', sourceUrl: `https://drive.google.com/file/d/${name}/view` });
    const entries = [
      { target: { responseId: 'drive-failed', fieldId: 'pdf' }, identity: identity('Drive example'),
        phase: 'UNVERIFIED', selected: false, noAiStarted: true,
        error: 'WildTrack could not retrieve the submitted PDF from Google Drive.',
        failureDiagnostics: { provider: 'drive', stage: 'download', httpStatus: 403, reasonCode: 'UPSTREAM_ERROR' } },
      { target: { responseId: 'gemini-failed', fieldId: 'pdf' }, identity: identity('AI example'),
        preview: { key: 'failed', category: 'FAILED' }, phase: 'DONE', selected: true, noAiStarted: false,
        resultStatus: 'UNCERTAIN', error: 'Gemini returned an incomplete or invalid review.',
        failureDiagnostics: { provider: 'gemini', reasonCode: 'INVALID_RESPONSE' } }
    ];
    await page.route('**/api/ai-reviews/batches/latest**', route => route.fulfill({ json: {
      id: 'finished', state: 'COMPLETED', entries, totalPdfs: 2, preparedPdfs: 2,
      selectedDocuments: 1, completedDocuments: 1, pendingDocuments: 0, uniqueDocuments: 1
    } }));
    await page.goto('/review');
    await expect(page.locator('.wt-ai-batch-details')).toHaveCount(2);
    for (const details of await page.locator('.wt-ai-batch-details').all()) await details.locator(':scope > summary').click();
    const drive = page.locator('li').filter({ has: page.getByRole('button', { name: /View AI Review: Drive example\.pdf/ }) });
    await expect(drive).toContainText('(Drive HTTP 403)');
    const extra = drive.getByLabel('Google Drive error details');
    await expect(extra).not.toHaveAttribute('open', '');
    await expect(extra.getByText(/temporary limits may apply/)).toBeHidden();
    await extra.locator('summary').click();
    await expect(extra.getByText(/temporary limits may apply/)).toBeVisible();
    await expect(page.getByLabel('Gemini error details')).not.toContainText('rate limit');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ animations: 'disabled', fullPage: true, path: `test-results/short-errors-${width}.png` });
    expect(fixture.calls.some(call => call.method === 'POST')).toBe(false);
  });

  test(`historical template instructions read as a sentence with a clear submitted PDF excerpt at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1050 });
    const field = 'field-document-pdf', sourceUrl = 'https://drive.google.com/file/d/browser-pdf/view';
    const report = { outcome: 'INCONCLUSIVE', findings: [], verifiedChecks: [], missingRequiredSections: [], verificationNotes: [], limitations: [],
      documentOverview: { text: 'This requirements document describes a student project.', wrongDocument: false },
      coverage: { omittedCriteria: 0, criteria: [{ id: 'T1', title: 'Definitions and acronyms',
        requirement: '1. Introduction\n\nProvide content for:\n1.3 Definitions and Acronyms', source: 'OFFICIAL_TEMPLATE',
        assessment: 'CHECK_MANUALLY', explanation: 'The document names its abbreviations, but the extracted table does not retain their definitions. Check the definitions table in the PDF.',
        documentEvidence: 'Abbreviations used: UI, API', location: { page: 5 },
        findingIndexes: [], verifiedCheckIndexes: [], missingSectionIndexes: [], verificationNoteIndexes: [] }] } };
    const fixture = await installApiFixtures(page, { role: 'admin', submitted: true, monitoring: payload => {
      const response = payload.responses[0];
      return { ...payload, reviewStates: { [response.id]: { feedback: [], acceptance: null } },
        fileChecksByField: { [response.id]: { [field]: { status: 'COMPLETED', sourceUrl, checkedAt: '2026-10-27T00:00:00Z',
          sourceResponseUpdatedAt: response.updatedAt, attentionRequired: false, flags: [], document: { readable: true, pageCount: 10 } } } },
        aiReviewsByField: { [response.id]: { [field]: { status: 'COMPLETED', fieldId: field, sourceUrl,
          sourceResponseUpdatedAt: response.updatedAt, generatedAt: '2026-10-27T00:01:00Z', report } } } };
    } });
    await page.goto('/review?response=response-1');
    await page.getByRole('button', { name: 'View AI Review', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'AI Review: Software Requirements Specification' });
    const row = modal.locator('details.wt-ai-review-assessment-row');
    await row.locator('summary').click();
    await expect(row.getByText('Provide content for 1.3 Definitions and Acronyms, under 1. Introduction.', { exact: false })).toBeVisible();
    await expect(row.getByRole('blockquote')).toContainText('Abbreviations used: UI, API');
    await expect(row).toContainText('Submitted PDF · page 5');
    expect(await row.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await row.locator('summary').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await page.screenshot({ animations: 'disabled', path: `test-results/readable-instruction-${width}.png` });
    expect(fixture.calls.some(call => call.method === 'POST' && /ai-reviews|file-checks/.test(call.path))).toBe(false);
  });
}
