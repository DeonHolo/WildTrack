import { test, expect } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

for (const width of [390, 1440]) {
  test(`archive preparation shows ready and blocked PDFs at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 920 });
    const fixture = await installApiFixtures(page, { role: 'admin', submitted: true, monitoring: payload => {
      const original = payload.responses[0];
      const other = { ...original, id: 'blocked-response', studentName: 'Blocked Student' };
      return { ...payload, responses: [original, other], reviewStates: Object.fromEntries([original, other].map(item => [item.id, {
        feedback: [], acceptance: { acceptedAt: item.updatedAt, sourceResponseUpdatedAt: item.updatedAt }
      }])) };
    } });
    const checked = [], queued = [];
    await page.route('**/api/file-checks?**', async route => {
      const body = route.request().postDataJSON(); checked.push(body);
      return route.fulfill({ json: body.responseId === 'blocked-response'
        ? { status: 'BLOCKED', summary: 'Google Drive could not open this PDF. Check its sharing settings.' }
        : { status: 'COMPLETED', document: { readable: true } } });
    });
    await page.route('**/api/archive**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/storage')) return route.fulfill({ json: { configured: true, ready: true } });
      if (path.endsWith('/prepare')) return route.fulfill({ json: [{ responseId: 'response-1', ready: true, pdfCount: 1,
        evidenceAdded: true, message: 'PDFs checked. This older acceptance had no saved file fingerprint; archiving will preserve the current files.' }] });
      if (route.request().method() === 'POST') {
        queued.push(route.request().postDataJSON());
        return route.fulfill({ json: [{ captureState: 'QUEUED', lifecycleState: 'Archived' }] });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto('/archive');
    await page.getByRole('button', { name: 'Archive accepted finals (2)' }).click();
    const summary = page.getByRole('dialog', { name: 'Archive accepted finals', exact: true });
    await expect(summary.getByText('1 ready', { exact: true })).toBeVisible();
    await expect(summary.getByText('Needs attention: 1', { exact: true })).toBeVisible();
    await expect(summary.getByText(/Google Drive could not open this PDF/)).toBeVisible();
    await expect(summary.getByRole('link', { name: 'Review response' })).toHaveAttribute('href', '/review?response=blocked-response');
    expect(checked).toHaveLength(2); expect(queued).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/archive-preparation-${width}.png`, fullPage: true });
    await summary.getByRole('button', { name: 'Archive 1 final' }).click();
    await expect(summary.getByText('Queued for copying', { exact: true })).toBeVisible();
    expect(queued).toEqual([{ responseIds: ['response-1'] }]);
    expect(fixture.calls.some(call => call.path.startsWith('/ai-review'))).toBe(false);
  });
}

test('unarchive can revoke acceptance in one confirmed request while keeping history', async ({ page }) => {
  await installApiFixtures(page, { role: 'admin', submitted: true });
  let active = true, body;
  const record = { id: 'archive-1', responseId: 'response-1', attemptId: 'response-1', softwareName: 'Archive sample',
    deliverableTitle: 'SRS', captureState: 'COMPLETE', lifecycleState: 'Archived', stateVersion: 5, storageStatus: 'Stored', files: [], history: [] };
  await page.route('**/api/archive**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/storage')) return route.fulfill({ json: { configured: true, ready: true } });
    if (path.endsWith('/unarchive')) { body = route.request().postDataJSON(); active = false; return route.fulfill({ json: { ...record, lifecycleState: 'Active' } }); }
    return route.fulfill({ json: [{ ...record, lifecycleState: active ? 'Archived' : 'Active' }] });
  });
  await page.goto('/archive');
  await page.getByRole('button', { name: 'Open Archive sample archive details' }).click();
  await page.getByRole('dialog', { name: 'Archive record details' }).getByRole('button', { name: 'Unarchive', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Unarchive this submission?' });
  await expect(dialog.getByRole('checkbox', { name: 'Also revoke acceptance' })).not.toBeChecked();
  await dialog.getByRole('checkbox', { name: 'Also revoke acceptance' }).check();
  await page.screenshot({ path: 'test-results/archive-unarchive-revoke.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Unarchive', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Archive sample archive details' })).toHaveCount(0);
  expect(body).toEqual({ stateVersion: 5, revokeAcceptance: true });
  await page.getByLabel('Record view').selectOption('history');
  await expect(page.getByRole('button', { name: 'Open Archive sample archive details' })).toBeVisible();
});
