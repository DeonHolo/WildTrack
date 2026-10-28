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
