import { test, expect } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

for (const width of [375, 820, 1440]) {
  test(`archive and drawer at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installApiFixtures(page, { role: 'admin', submitted: true });
    await page.route('**/api/archive**', async route => {
      const path = new URL(route.request().url()).pathname;
      const record = { id: 'archive-1', projectTitle: 'Community Resource Manager', softwareName: 'Community Resource Manager', teamCode: '2526-sem2-it332-01', studentName: 'Pacio, Muriel D.', workspaceName: 'IT Capstone', deliverableTitle: 'Software Requirements Specification', version: 'v1', archivedAt: '2026-06-18T10:15:00+08:00', captureState: 'COMPLETE', lifecycleState: 'Archived', stateVersion: 1, storageStatus: 'Stored', integrityStatus: 'Verified', files: [{ id: 'file-1', label: 'Requirements document', filename: 'requirements.pdf', status: 'STORED', size: 34567, sha256: 'a'.repeat(64), downloadUrl: '/api/archive/archive-1/files/file-1?workspaceId=fixture' }], history: [{ action: 'Archived', occurredAt: '2026-06-18T10:15:00+08:00', actor: 'Adviser' }] };
      await route.fulfill({ json: path.endsWith('/storage') ? { configured: true, ready: true } : [record] });
    });
    await page.goto('/archive');
    await expect(page.getByLabel('Record view')).toHaveValue('archived');
    await expect(page.getByLabel('Archive status')).toHaveValue('');
    await expect(page.getByRole('table', { name: 'Archive records' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const openButton = page.getByRole('button', { name: 'Open Community Resource Manager archive details' });
    const buttonBox = await openButton.boundingBox();
    expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `test-results/archive-${width}.png` });
    await openButton.click();
    await expect(page.getByRole('dialog', { name: 'Archive record details' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/archive-drawer-${width}.png` });
  });
}

test('All statuses excludes inactive history until its record view is selected', async ({ page }) => {
  await installApiFixtures(page, { role: 'admin', submitted: true });
  let active = true;
  const record = { id: 'failed-archive', softwareName: 'Failed capture', deliverableTitle: 'SRS', lifecycleState: 'Archived', captureState: 'FAILED', stateVersion: 3, storageStatus: 'Storage failed', files: [], history: [] };
  await page.route('**/api/archive**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/storage')) return route.fulfill({ json: { configured: true, ready: true } });
    if (path.endsWith('/unarchive')) { active = false; return route.fulfill({ json: {} }); }
    return route.fulfill({ json: [{ ...record, lifecycleState: active ? 'Archived' : 'Active' }] });
  });
  await page.goto('/archive');
  await page.getByRole('button', { name: 'Open Failed capture archive details' }).click();
  await page.getByRole('dialog', { name: 'Archive record details' }).getByRole('button', { name: 'Unarchive', exact: true }).click();
  await page.getByRole('dialog', { name: 'Unarchive this submission?' }).getByRole('button', { name: 'Unarchive', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Archive record details' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Failed capture archive details' })).not.toBeVisible();
  await expect(page.getByLabel('Archive status')).toHaveValue('');
  await page.getByLabel('Record view').selectOption('history');
  await page.getByRole('button', { name: 'Open Failed capture archive details' }).click();
  const historyDrawer = page.getByRole('dialog', { name: 'Archive record details' });
  await expect(historyDrawer.getByText('Unarchived — history only')).toBeInViewport();
  await expect(historyDrawer.getByRole('button', { name: 'Unarchive', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/archive-unarchived-history.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open Failed capture archive details' })).toBeVisible();
  await page.getByLabel('Record view').selectOption('all');
  await expect(page.getByRole('button', { name: 'Open Failed capture archive details' })).toBeVisible();
});
