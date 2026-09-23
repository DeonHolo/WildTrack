import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

for (const viewport of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 }
]) {
  test(`student deliverables filter and rows stay readable on ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const api = await installApiFixtures(page, { role: 'student', connected: true, submitted: true });
    await page.goto('/student');

    const deliverables = page.getByRole('list', { name: 'Your deliverables' });
    const filter = page.getByRole('group', { name: 'Filter deliverables' });
    await expect(deliverables.getByRole('listitem')).toHaveCount(2);
    await expect(filter).toBeVisible();
    await expect(page.getByText('Show deliverables', { exact: true })).toHaveCount(0);
    await expect(filter.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

    // Measure actual browser layout. This catches the old mobile flex-basis
    // regression that made the filters look like a very tall empty table.
    const layout = await filter.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const controls = [...element.querySelectorAll('button')].map((button) => {
        const box = button.getBoundingClientRect();
        return { width: box.width, height: box.height, top: box.top, bottom: box.bottom };
      });
      return {
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        controls,
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth
      };
    });
    expect(layout.height).toBeLessThanOrEqual(60);
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.controls).toHaveLength(3);
    expect(layout.controls.every(({ width, height }) => width >= 65 && height >= 35 && height <= 55)).toBe(true);
    expect(Math.max(...layout.controls.map(({ top }) => top)) - Math.min(...layout.controls.map(({ top }) => top))).toBeLessThanOrEqual(1);

    // Keep row backgrounds consistent. Submission lateness already has its own
    // badge, so a pink/red whole-row tint is unnecessary and was rejected.
    const backgrounds = await deliverables.getByRole('listitem').evaluateAll((rows) => rows.map(
      (row) => getComputedStyle(row).backgroundColor
    ));
    expect(new Set(backgrounds).size).toBe(1);

    await testInfo.attach(`student-deliverables-${viewport.name}`, {
      body: await page.screenshot(), contentType: 'image/png'
    });

    await filter.getByRole('button', { name: 'To submit' }).click();
    await expect(filter.getByRole('button', { name: 'To submit' })).toHaveAttribute('aria-pressed', 'true');
    await expect(deliverables.getByRole('listitem')).toHaveCount(1);
    await filter.getByRole('button', { name: 'Submitted' }).click();
    await expect(deliverables.getByRole('listitem')).toHaveCount(1);
    api.assertRequestsHandled();
  });
}
