import { expect, test } from '@playwright/test';

const roleKey = 'wildtrack.v2.preview-role';

async function openAs(page, role, path) {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: roleKey,
    value: role
  });
  await page.goto(path);
}

async function expectNoPageOverflow(page) {
  const overflows = await page.evaluate(() => (
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  ));
  expect(overflows).toBe(false);
}

test('public submission form remains usable at a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/w/it-it332-2025-26-semester-2/submit/week-9-srs');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Software Requirements Specification');
  await expect(page.getByLabel('Student Number')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit response' })).toBeVisible();
  await expectNoPageOverflow(page);
});

test('admin review opens in the staff shell without page-level clipping', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openAs(page, 'admin', '/review');

  await expect(page.getByRole('heading', { name: 'Submission review' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Staff navigation' })).toBeVisible();
  await expectNoPageOverflow(page);
});

test('adviser lands on assigned-team review', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openAs(page, 'adviser', '/adviser');

  await expect(page.getByRole('heading', { name: 'My advised teams' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Staff navigation' })).toBeVisible();
  await expectNoPageOverflow(page);
});

test('student role opens the student application shell on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAs(page, 'student', '/student');

  await expect(page.locator('main')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoPageOverflow(page);
});

