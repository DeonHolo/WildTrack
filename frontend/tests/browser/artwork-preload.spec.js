import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

for (const path of ['/student', '/s/' + 'a'.repeat(64)]) {
  test(`banner image starts before the application at ${path.slice(0, 12)}`, async ({ page }) => {
    await installApiFixtures(page, { role: 'student', connected: false });
    let releaseApp;
    const applicationHeld = new Promise(resolve => { releaseApp = resolve; });
    await page.route('**/src/main.jsx', async route => {
      await applicationHeld;
      await route.abort();
    });
    const filename = path === '/student' ? 'WELCOME TO WILDMAPS.webp' : 'Showing PDF.webp';
    const imageLoaded = page.waitForResponse(response => decodeURIComponent(new URL(response.url()).pathname).endsWith('/' + filename));
    try {
      await page.goto(path, { waitUntil: 'commit' });
      const response = await imageLoaded;
      expect(response.ok()).toBe(true);
      await response.finished();
      const preload = page.locator('head link[rel="preload"][as="image"]');
      await expect(preload).toHaveAttribute('fetchpriority', 'high');
      // The image is ready while the application has deliberately not executed.
      await expect(page.locator('#root')).toBeEmpty();
    } finally {
      releaseApp();
    }
  });
}
