import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';
test.use({ timezoneId: 'Asia/Singapore' });

const field = 'field-document-pdf';
const workspace = '11111111-1111-1111-1111-111111111111';
const sourceUrl = 'https://drive.google.com/file/d/browser-pdf/view';
const history = { observations: [{ changeType: 'CONTENT_CHANGED', firstObservedAt: '2026-10-13T16:20:29.869589',
  lastObservedAt: '2026-10-13T17:20:00', driveModifiedTime: '2026-10-13T16:07:03.930Z', contentIdentifier: 'md5:new-content' }] };
const review = { status: 'COMPLETED', generatedAt: '2026-10-13T14:55:20Z', sourceUrl,
  report: { outcome: 'ISSUES_IDENTIFIED', summary: 'An earlier saved review.', findings: [{ issue: 'A saved finding', source: 'DOCUMENT', evidence: 'Quoted PDF text' }] } };
const check = { id: 'check-one', fieldId: field, sourceUrl, status: 'COMPLETED', checkedAt: '2026-10-13T16:20:29.869589',
  summary: 'PDF is readable.', flags: [], redFlags: [], missingSections: [],
  metadata: { name: 'Updated PDF.pdf', canDownload: true, mimeType: 'application/pdf', modifiedTime: '2026-10-13T16:07:03.930Z' },
  document: { readable: true, pageCount: 12 }, templateComparison: { available: true, expectedTemplateHeadings: ['Introduction'], detectedTemplateHeadings: ['Introduction'] } };
function monitoring(payload) {
  return { ...payload, fileChecksByField: { 'response-1': { [field]: check } },
    observedFileHistoryByField: { 'response-1': { [field]: history } }, aiReviewsByField: { 'response-1': { [field]: review } } };
}

test('shows local detection times, changed content and an outdated saved AI review without starting AI', async ({ page }) => {
  const fixture = await installApiFixtures(page, { role: 'admin', submitted: true, monitoring,
    templates: [{ id: 'template-one', deliverableKey: 'SRS', fieldId: field, displayName: 'SRS template' }] });
  await page.goto('/review');
  await page.getByRole('button', { name: /Review DELA CRUZ/ }).click();
  await page.getByRole('button', { name: 'View Document Check', exact: true }).click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Updated PDF.pdf' }) });
  await expect(dialog.getByText('Document Check completed Oct 14, 2026, 12:20 AM')).toBeVisible();
  await expect(dialog.getByText('PDF content changed', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Open official template' })).toHaveAttribute('href', `/templates/template-one/preview?workspaceId=${workspace}`);
  const heading = await dialog.getByRole('heading', { name: 'Official template structure' }).boundingBox();
  const templateLink = await dialog.getByRole('link', { name: 'Open official template' }).boundingBox();
  expect(Math.abs(heading.y + heading.height / 2 - templateLink.y - templateLink.height / 2)).toBeLessThan(2);
  await dialog.getByRole('tab', { name: 'File history' }).click();
  await expect(dialog.getByText('Detected Oct 14, 2026, 12:20 AM', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Drive edit: Oct 14, 2026, 12:07 AM', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Last checked: Oct 14, 2026, 1:20 AM/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'View AI Review', exact: true }).click();
  const ai = page.getByRole('dialog', { name: 'AI Review: Software Requirements Specification' });
  await expect(ai.getByRole('alert')).toContainText('AI Review may be outdated');
  await expect(ai.getByText('A saved finding')).toBeVisible();
  expect(fixture.calls.filter(call => call.method === 'POST' && /ai-reviews|file-checks/.test(call.path))).toEqual([]);
  fixture.assertRequestsHandled();
});

test('acknowledges one file change after confirmation, persists it, and warns for a later change', async ({ page }) => {
  let currentHistory = history;
  const fixture = await installApiFixtures(page, { role: 'admin', submitted: true,
    monitoring: payload => ({ ...monitoring(payload), observedFileHistoryByField: { 'response-1': { [field]: currentHistory } } }) });
  const openCheck = async () => {
    await page.getByRole('button', { name: /Review DELA CRUZ/ }).click();
    await page.getByRole('button', { name: 'View Document Check', exact: true }).click();
  };
  await page.goto('/review');
  await openCheck();
  await page.getByRole('button', { name: 'Acknowledge change', exact: true }).click();
  let confirmation = page.getByRole('dialog', { name: 'Acknowledge this PDF change?' });
  await expect(confirmation).toContainText('This does not accept the submission or refresh AI Review');
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(fixture.calls.filter(call => call.method === 'POST')).toHaveLength(0);

  await page.route('**/api/work-task-dismissals', route => route.fulfill({ status: 503, json: { message: 'Unavailable' } }), { times: 1 });
  await page.getByRole('button', { name: 'Acknowledge change', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Acknowledge change', exact: true }).click();
  await expect(confirmation.getByRole('alert')).toContainText('could not be saved');
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('PDF content changed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Acknowledge change', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Acknowledge change', exact: true }).click();
  await expect(page.getByText('PDF content changed', { exact: true })).toHaveCount(0);
  const writes = fixture.calls.filter(call => call.path === '/work-task-dismissals' && call.method === 'POST');
  expect(writes).toHaveLength(1);
  await page.reload();
  await openCheck();
  await expect(page.getByText('PDF content changed', { exact: true })).toHaveCount(0);
  await page.goto('/');
  await page.getByRole('tab', { name: 'Dismissed (0)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete all dismissed notifications' })).toBeDisabled();
  await page.goto('/review');
  await openCheck();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'View AI Review', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('AI Review may be outdated');

  currentHistory = { observations: [{ ...history.observations[0], firstObservedAt: '2026-10-14T02:20:00',
    lastObservedAt: '2026-10-14T02:20:00', driveModifiedTime: '2026-10-14T02:04:00Z' }, ...history.observations] };
  await page.reload();
  await openCheck();
  await expect(page.getByText('PDF content changed', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Acknowledge change', exact: true })).toBeEnabled();
  expect(fixture.calls.filter(call => call.method === 'POST' && /ai-reviews|file-checks/.test(call.path))).toEqual([]);
  fixture.assertRequestsHandled();
});


test('hides template findings without an uploaded template and keeps finished batch dismissal after reload', async ({ page }) => {
  const fixture = await installApiFixtures(page, { role: 'admin', submitted: true, monitoring });
  const batch = { id: 'finished-batch', state: 'COMPLETED', version: 1, entries: [], completedDocuments: 1,
    selectedDocuments: 1, uniqueDocuments: 1, totalPdfs: 1, message: 'Saved results are available.' };
  await page.route('**/api/ai-reviews/batches/latest?*', route => route.fulfill({ json: batch }));
  await page.goto('/review');
  await page.getByRole('button', { name: 'Dismiss finished AI Review batch' }).click();
  await expect(page.getByText('AI Review batch finished', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('AI Review batch finished', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Review DELA CRUZ/ }).click();
  await page.getByRole('button', { name: 'View Document Check', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open official template' })).toHaveCount(0);
  fixture.assertRequestsHandled();
});

for (const width of [1440, 375]) {
  test(`keeps the universal logo loader centered and supports reduced motion at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installApiFixtures(page, { role: 'admin' });
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    await page.route('**/api/auth/session', async route => { await pending; await route.fallback(); });
    await page.goto('/forms', { waitUntil: 'domcontentloaded' });
    const loader = page.getByRole('main', { name: 'Loading WildTrack' });
    await expect(loader.getByRole('status')).toHaveText('Loading…');
    await expect(loader).toHaveText('Loading…');
    const ring = page.locator('.wt-session-loading-spinner');
    const box = await ring.boundingBox();
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
    await expect(page.locator('.wt-session-loading-mark')).toBeVisible();
    expect(await page.locator('.wt-session-loading-mark').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await page.screenshot({ path: `test-results/universal-loader-${width}.png` });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.locator('.wt-session-loading-ring').first().evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    release();
    await expect(loader).toHaveCount(0);
    fixture.assertRequestsHandled();
  });
}

test('confirms deletion, retains a deleted notification after reload, and opens a later content-change event', async ({ page }) => {
  const fixture = await installApiFixtures(page, { role: 'admin', submitted: true, monitoring });
  let events = [{ id: 'old-event', fileId: 'browser-pdf', kind: 'CONTENT_CHANGED', observedAt: '2026-10-13T16:20:00Z',
    responseIds: ['response-1'], teamCodes: ['2526-sem2-it332-11'] }];
  await page.route('**/api/file-monitor/events?*', route => route.fulfill({ json: events }));
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Sort by' })).toHaveValue('newest');
  expect(await page.getByRole('combobox', { name: 'Sort by' }).locator('option').allTextContents()).toEqual(['Newest activity', 'Oldest activity', 'Priority']);
  const checkActions = async () => {
    await page.evaluate(() => document.fonts.ready);
    for (const width of [1920, 1440, 1280, 1181, 1024, 375]) {
      await page.setViewportSize({ width, height: 900 });
      const clipped = await page.locator('.wt-command-row-actions .mantine-Button-label').evaluateAll(labels =>
        labels.filter(label => label.scrollWidth > label.clientWidth + 1)
          .map(label => ({ text: label.textContent, width: label.clientWidth, needed: label.scrollWidth })));
      expect(clipped, `Action labels at ${width}px`).toEqual([]);
      const positions = await page.locator('.wt-command-row-actions > :nth-child(2)').evaluateAll(buttons =>
        buttons.map(button => button.getBoundingClientRect().x));
      for (const x of positions) expect(x).toBeCloseTo(positions[0], 0);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  };
  await checkActions();
  await page.getByRole('button', { name: /^Dismiss PDF content changed:/ }).click();
  await page.getByRole('tab', { name: /^Dismissed/ }).click();
  await checkActions();
  await page.getByRole('button', { name: /^Delete dismissed PDF content changed:/ }).click();
  await page.getByRole('dialog', { name: 'Delete this dismissed notification?' }).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(fixture.calls.filter(call => call.path.endsWith('/deleted') && call.method === 'POST')).toHaveLength(0);
  await page.getByRole('button', { name: /^Delete dismissed PDF content changed:/ }).click();
  await page.getByRole('dialog', { name: 'Delete this dismissed notification?' }).getByRole('button', { name: 'Delete notification', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Delete dismissed PDF content changed:/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Review affected response for PDF content changed$/ })).toHaveCount(0);
  events = [{ ...events[0], id: 'new-event', observedAt: '2026-10-14T03:20:00Z' }, ...events];
  await page.reload();
  await expect(page.getByRole('button', { name: /^Review affected response for PDF content changed$/ })).toBeVisible();
  await page.getByRole('button', { name: /^Dismiss PDF content changed:/ }).click();
  await page.getByRole('button', { name: /^Dismiss Review decision:/ }).click();
  await page.getByRole('tab', { name: /^Dismissed/ }).click();
  await page.getByRole('button', { name: 'Delete all dismissed notifications' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete all dismissed notifications?' });
  await expect(confirmation).toContainText('New PDF changes will still create new notifications');
  await confirmation.getByRole('button', { name: 'Delete all', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Dismissed (0)' })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: /^Dismissed/ }).click();
  await expect(page.getByText('No dismissed notifications', { exact: true })).toBeVisible();
  fixture.assertRequestsHandled();
});
