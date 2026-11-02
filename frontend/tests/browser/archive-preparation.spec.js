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
    let batch = null;
    const preparations = [], starts = [];
    const items = [
      { responseId: 'response-1', studentName: 'Ready Student', deliverableTitle: 'SRS', ready: true, stage: 'READY', pdfCount: 1, message: 'PDFs checked against the accepted files.' },
      { responseId: 'blocked-response', studentName: 'Blocked Student', deliverableTitle: 'SRS', ready: false, stage: 'BLOCKED', pdfCount: 0,
        message: 'Google Drive could not open this PDF. Check its sharing settings.' }
    ];
    await page.route('**/api/archive**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/storage')) return route.fulfill({ json: { configured: true, ready: true } });
      if (path.endsWith('/batches/latest')) return route.fulfill({ json: batch });
      if (path.endsWith('/batches') && route.request().method() === 'POST') {
        preparations.push(route.request().postDataJSON());
        batch = { id: 'batch-1', state: 'READY', version: 2, items };
        return route.fulfill({ json: batch });
      }
      if (path.endsWith('/start')) {
        starts.push(route.request().postDataJSON());
        batch = { ...batch, state: 'ARCHIVING', version: 3, items: items.map(item => item.ready ? { ...item, stage: 'COPYING', message: 'Copying PDFs on the server.' } : item) };
        return route.fulfill({ json: batch });
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
    expect(preparations).toEqual([{ responseIds: ['response-1', 'blocked-response'] }]);
    expect(starts).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/archive-preparation-${width}.png`, fullPage: true });
    await summary.getByRole('button', { name: 'Archive 1 final' }).click();
    await expect(summary.getByText('Copying PDFs on the server.', { exact: true })).toBeVisible();
    expect(starts).toEqual([{ stateVersion: 2 }]);
    await summary.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(summary).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Archiving PDFs…' })).toBeDisabled();
    expect(fixture.calls.some(call => call.path.startsWith('/file-checks'))).toBe(false);
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
    if (path.endsWith('/batches/latest')) return route.fulfill({ json: null });
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

test('closing, navigating and refreshing restore the same server preparation and archive job', async ({ page }) => {
  await installApiFixtures(page, { role: 'admin', submitted: true, monitoring: payload => {
    const response = payload.responses[0];
    return { ...payload, responses: [response, { ...response, id: 'response-2' }], reviewStates: Object.fromEntries(
      [response.id, 'response-2'].map(id => [id, { feedback: [], acceptance: { acceptedAt: response.updatedAt, sourceResponseUpdatedAt: response.updatedAt } }])) };
  } });
  let batch = null, preparations = 0, starts = 0;
  const record = { id: 'copy-1', responseId: 'response-1', attemptId: 'response-1', softwareName: 'Copy sample',
    deliverableTitle: 'SRS', lifecycleState: 'Archived', files: [], history: [] };
  await page.route('**/api/archive**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/storage')) return route.fulfill({ json: { ready: true, configured: true } });
    if (path.endsWith('/batches/latest')) return route.fulfill({ json: batch });
    if (path.endsWith('/batches') && route.request().method() === 'POST') {
      preparations++;
      batch = { id: 'saved-job', state: 'CHECKING', version: 0, items: ['response-1', 'response-2'].map(responseId => ({
        responseId, studentName: responseId, deliverableTitle: 'SRS', stage: 'PENDING', ready: false, message: 'Waiting for PDF checks.'
      })) };
      return route.fulfill({ json: batch });
    }
    if (path.endsWith('/start')) {
      starts++;
      batch = { ...batch, state: 'ARCHIVING', version: 3, items: batch.items.map(item => ({ ...item, stage: 'COPYING', message: 'Copying PDFs on the server.' })) };
      return route.fulfill({ json: batch });
    }
    return route.fulfill({ json: batch?.state === 'ARCHIVING' ? [{ ...record, captureState: 'COPYING' }] : [] });
  });
  await page.goto('/archive');
  await page.getByRole('button', { name: 'Archive accepted finals (2)' }).click();
  const summary = page.getByRole('dialog', { name: 'Archive accepted finals', exact: true });
  await summary.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(summary).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Checking PDFs…' })).toBeDisabled();
  await page.getByRole('link', { name: 'Tracker', exact: true }).click();
  batch = { ...batch, state: 'READY', version: 2, items: batch.items.map(item => ({ ...item, stage: 'READY', ready: true, pdfCount: 1, message: 'PDFs checked against the accepted files.' })) };
  await page.getByRole('link', { name: 'Archive', exact: true }).click();
  await page.getByRole('button', { name: 'View archive summary' }).click();
  await expect(summary.getByRole('button', { name: 'Archive 2 finals' })).toBeVisible();
  await summary.getByRole('button', { name: 'Archive 2 finals' }).click();
  await summary.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Archiving PDFs…' })).toBeDisabled();
  await page.getByRole('button', { name: 'View archive summary' }).click();
  await expect(summary.getByText('Copying PDFs on the server.')).toHaveCount(2);
  await summary.getByRole('button', { name: 'Close', exact: true }).click();
  expect(preparations).toBe(1); expect(starts).toBe(1);
  batch = { ...batch, state: 'COMPLETE', version: 4, items: batch.items.map(item => ({ ...item, stage: 'COMPLETE', message: 'PDFs preserved.' })) };
  await expect(page.getByRole('button', { name: /Archive accepted finals/ })).toBeEnabled({ timeout: 10000 });
  expect(preparations).toBe(1); expect(starts).toBe(1);
});

for (const width of [390, 1440]) {
  test(`archive history shows newest events and expands older records at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 920 });
    await installApiFixtures(page, { role: 'admin', submitted: true });
    const record = { id: 'history-1', softwareName: 'History sample', deliverableTitle: 'SRS', lifecycleState: 'Archived',
      captureState: 'COMPLETE', storageStatus: 'Stored', files: [], history: Array.from({ length: 9 }, (_, index) => ({
        action: index % 2 ? 'ARCHIVE_REACTIVATED' : 'ARCHIVE_UNARCHIVED', occurredAt: `2026-11-02T01:0${index}:00Z`, actor: 'archive-worker'
      })) };
    await page.route('**/api/archive**', route => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({ json: path.endsWith('/storage') ? { ready: true, configured: true } : path.endsWith('/batches/latest') ? null : [record] });
    });
    await page.goto('/archive');
    await page.getByRole('button', { name: 'Open History sample archive details' }).click();
    const history = page.getByRole('region', { name: 'Archive history' });
    await expect(history.getByRole('heading', { name: 'History (9)' })).toBeVisible();
    await expect(history.locator('details')).not.toHaveAttribute('open', '');
    await expect(history.getByRole('listitem')).toHaveCount(3);
    await history.getByText('Older archive records (6)').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/archive-history-collapsed-${width}.png`, animations: 'disabled' });
    await history.getByText('Older archive records (6)').focus();
    await page.keyboard.press('Enter');
    await expect(history.getByRole('listitem')).toHaveCount(9);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/archive-history-expanded-${width}.png`, animations: 'disabled' });
    await page.keyboard.press('Enter');
    await expect(history.getByRole('listitem')).toHaveCount(3);
  });
}
