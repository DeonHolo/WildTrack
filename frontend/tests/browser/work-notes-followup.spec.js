import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

for (const width of [390, 1440]) {
  test(`work queue counts and bulk controls align with their inputs at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await installApiFixtures(page, { role: 'admin', submitted: true, checkedPdf: true });
    await page.goto('/');
    const toolbar = page.locator('.wt-command-toolbar');
    const count = toolbar.getByText(/Showing \d+-\d+ of \d+/);
    const dismiss = toolbar.getByRole('button', { name: 'Dismiss all work notifications' });
    await expect(count).toBeVisible();
    const countBox = await count.boundingBox(), buttonBox = await dismiss.boundingBox();
    expect(Math.abs(countBox.y + countBox.height / 2 - buttonBox.y - buttonBox.height / 2)).toBeLessThan(2);
    if (width > 1000) {
      const input = await toolbar.getByRole('searchbox', { name: 'Search work queue' }).boundingBox();
      expect(Math.abs(input.y + input.height / 2 - buttonBox.y - buttonBox.height / 2)).toBeLessThan(2);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/work-toolbar-${width}.png`, fullPage: true, animations: 'disabled' });
  });

  test(`unlocated Gemini text is optional and clearly distinguished from a PDF excerpt at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await installApiFixtures(page, { role: 'admin', submitted: true, checkedPdf: true, monitoring: payload => ({
      ...payload, aiReviewsByField: { 'response-1': { 'field-document-pdf': {
        status: 'COMPLETED', sourceUrl: 'https://drive.google.com/file/d/browser-pdf/view', generatedAt: '2026-04-18T09:00:00Z',
        report: {
          documentOverview: { text: 'This software requirements document describes student submissions and staff review tasks.', wrongDocument: false },
          outcome: 'NO_ISSUES_IN_CHECKED_AREAS', findings: [], coverage: { criteria: [{
            id: 'C1', title: 'Object-oriented components per transaction', requirement: 'Describe object-oriented components.',
            source: 'OFFICIAL_TEMPLATE', assessment: 'APPEARS_ADDRESSED', explanation: 'The document describes the transaction components.',
            documentEvidence: null, location: null,
            evidenceVerification: { status: 'NOT_LOCATED', providerQuotation: 'The claimed source words supplied by Gemini.', citedLocation: { page: 9 } }
          }] }
        }
      } } }
    }) });
    await page.goto('/review?response=response-1');
    await page.getByRole('button', { name: 'View AI Review', exact: true }).click();
    const report = page.getByRole('dialog', { name: 'AI Review: Software Requirements Specification' });
    await expect(report.getByText('Appears addressed (1)', { exact: true })).toBeVisible();
    await report.getByText('Review notes', { exact: true }).click();
    const notes = report.getByRole('region', { name: 'Supporting reference notes' });
    const quote = notes.getByRole('blockquote', { name: 'Unverified text supplied by Gemini', includeHidden: true });
    await expect(quote).not.toBeVisible();
    await notes.getByText('Object-oriented components per transaction', { exact: true }).click();
    await expect(quote).toBeVisible();
    await expect(notes.getByText('Gemini supplied this text; WildTrack couldn’t locate it in the PDF.')).toBeVisible();
    await expect(notes.getByText('Gemini cited PDF page 9. This page reference is unverified.')).toBeVisible();
    expect(await report.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/unverified-reference-${width}.png`, animations: 'disabled' });
  });
}

test('staff can open the older account submission without adding another current Review row', async ({ page }) => {
  await installApiFixtures(page, { role: 'admin', submitted: true, checkedPdf: true });
  await page.route('**/api/workspace/responses/staff/response-1/earlier-submissions?**', route => route.fulfill({ json: [{
    id: 'earlier-response', googleEmail: 'previous-account@example.invalid', updatedAt: '2026-03-01T08:00:00Z',
    valuesJson: JSON.stringify({ documentPdf: 'https://drive.google.com/file/d/earlier-pdf/view' })
  }] }));
  await page.goto('/review?response=response-1');
  const drawer = page.getByRole('dialog', { name: 'Review DELA CRUZ, JUAN CARLOS M.' });
  await drawer.getByText('Earlier submissions', { exact: true }).click();
  await expect(drawer.getByText('previous-account@example.invalid')).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Open submitted file or link' })).toHaveAttribute('href', 'https://drive.google.com/file/d/earlier-pdf/view');
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole('table', { name: 'SRS submissions' }).locator('tbody tr')).toHaveCount(1);
});
