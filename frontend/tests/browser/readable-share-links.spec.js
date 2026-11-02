import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

test('forms show inline readable links on first visit without per-form requests', async ({ page }) => {
  const fixture = await installApiFixtures(page, { role: 'admin', connected: true, shortShareLinks: true, monitoring: (payload) => ({
    ...payload, deliverables: payload.deliverables.map((item, index) => ({
      ...item, sharePath: `/s/it-it332-2025-26-semester-2/${item.slug}/${index ? 'SdD_4aB-8xY2' : 'SrS_7aB-9xY3'}`
    }))
  }) });
  await page.goto('/forms');
  const link = page.getByRole('link', { name: 'Open SRS submission form' });
  await expect(link).toHaveAttribute('href', '/s/it-it332-2025-26-semester-2/week-9-srs/SrS_7aB-9xY3');
  await expect(link).toContainText('/s/it-it332-2025-26-semester-2/week-9-srs/');
  await expect(page.getByLabel('Active workspace', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Academic workspace' })).toBeVisible();
  await page.screenshot({ path: 'test-results/short-readable-form-links.png', fullPage: true });
  expect(fixture.calls.filter((call) => call.path.endsWith('/share-link'))).toHaveLength(0);
  await expect(page.getByText('Loading share link…')).toHaveCount(0);
});

for (const path of [`/s/week-9-srs/${'a'.repeat(64)}`, `/s/${'a'.repeat(64)}`]) {
  test(`public entry works at ${path.includes('week-9') ? 'readable' : 'legacy'} path`, async ({ page }) => {
    await installApiFixtures(page, { role: 'anonymous' });
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Software Requirements Specification' })).toBeVisible();
  });
}

test('short links retain the workspace, sign-in return path and deliverable navigation', async ({ page }) => {
  await installApiFixtures(page, { role: 'student', connected: false, shortShareLinks: true });
  const path = '/s/it-it332-2025-26-semester-2/week-9-srs/SrS_7aB-9xY3';
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Software Requirements Specification' })).toBeVisible();
  await page.getByRole('link', { name: 'Student dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connect your student account' })).toBeVisible();
  await page.getByRole('link', { name: 'Return to deliverable' }).click();
  await expect(page).toHaveURL(new RegExp(path + '$'));
  await expect(page.getByRole('heading', { name: 'Software Requirements Specification' })).toBeVisible();
});
