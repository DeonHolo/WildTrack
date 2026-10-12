import { expect, test } from '@playwright/test';

for (const width of [1440, 375]) {
  test(`Google branding pages remain public while sign-in resolves at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let release;
    const session = new Promise(resolve => { release = resolve; });
    const unexpected = [];
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/session') {
        await session;
        return route.fulfill({ json: { authenticated: false, roles: [], driveHistoryRequired: true, driveHistoryConfigured: true, driveHistoryConnected: false } });
      }
      unexpected.push(path);
      return route.fulfill({ status: 501, json: { error: 'Unexpected request' } });
    });
    await page.goto('/about', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'About WildTrack' })).toBeVisible();
    await expect(page.getByText('Checking Google sign-in…', { exact: true })).toBeHidden();
    await page.screenshot({ path: `test-results/public-about-${width}.png`, fullPage: true });
    const navigation = page.getByRole('navigation', { name: 'WildTrack information' });
    await navigation.getByRole('link', { name: 'Privacy', exact: true }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Google API Services User Data Policy' })).toHaveAttribute('href', 'https://developers.google.com/terms/api-services-user-data-policy');
    await page.screenshot({ path: `test-results/public-privacy-${width}.png`, fullPage: true });
    await navigation.getByRole('link', { name: 'Terms', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of Use' })).toBeVisible();
    release();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of Use' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Google Drive history access' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Open WildTrack' })).toHaveAttribute('href', '/login');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(unexpected).toEqual([]);
    await page.screenshot({ path: `test-results/public-terms-${width}.png`, fullPage: true });
  });
}
