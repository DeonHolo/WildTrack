import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

for (const width of [1440, 375]) {
  test(`public form stays revealed through hydration and preserves keyboard edits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const fixture = await installApiFixtures(page, { connected: true, submitted: true });
    const session = gate();
    const roster = gate();
    await page.route('**/api/auth/session', async route => { await session.promise; await route.fallback(); });
    await page.route('**/api/workspace/students/options?*', async route => { await roster.promise; await route.fallback(); });
    await page.goto('/w/it-it332-2025-26-semester-2/submit/week-9-srs', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Software Requirements Specification');
    await page.evaluate(() => {
      window.reopened = false;
      new MutationObserver(() => {
        if (document.body.textContent.includes('Opening submission form')) window.reopened = true;
      }).observe(document.body, { childList: true, subtree: true });
    });
    session.release();
    const answer = page.getByLabel('PDF Drive Link');
    await expect(answer).toHaveValue('https://drive.google.com/file/d/browser-pdf/view');
    await expect(answer).toBeEnabled();
    await expect(page.getByLabel('Student Number')).toBeDisabled();
    await answer.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('https://example.test/keyboard-edit');
    roster.release();
    await expect(page.getByLabel('Student Number')).toBeEnabled();
    await expect(answer).toHaveValue('https://example.test/keyboard-edit');
    await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.reopened)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/friction-public-${width}.png`, fullPage: true });
    fixture.assertRequestsHandled();
  });

  test(`Forms keeps rows on return while refresh is pending at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const fixture = await installApiFixtures(page, { role: 'admin', submitted: true });
    await page.goto('/forms');
    await expect(page.getByRole('button', { name: 'Edit SRS form' })).toBeVisible();
    await page.evaluate(() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.getByRole('heading', { name: /Today.s work/ })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const refresh = gate();
    await page.route('**/api/monitoring?*', async route => { await refresh.promise; await route.fallback(); });
    await page.evaluate(() => { history.pushState({}, '', '/forms'); dispatchEvent(new PopStateEvent('popstate')); });
    const edit = page.getByRole('button', { name: 'Edit SRS form' });
    await expect(edit).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await edit.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.screenshot({ path: `test-results/friction-forms-${width}.png`, fullPage: true });
    refresh.release();
    await page.waitForLoadState('networkidle');
    fixture.assertRequestsHandled();
  });
}
