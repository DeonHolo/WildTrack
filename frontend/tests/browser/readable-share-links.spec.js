import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

test('forms show inline readable links on first visit without per-form requests', async ({ page }) => {
  const fixture = await installApiFixtures(page, { role: 'admin', connected: true, monitoring: (payload) => ({
    ...payload, deliverables: payload.deliverables.map((item, index) => ({
      ...item, sharePath: `/s/${item.slug}/${(index ? 'b' : 'a').repeat(64)}`
    }))
  }) });
  await page.goto('/forms');
  const link = page.getByRole('link', { name: 'Open SRS submission form' });
  await expect(link).toHaveAttribute('href', `/s/week-9-srs/${'a'.repeat(64)}`);
  await expect(link).toContainText('/s/week-9-srs/');
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
