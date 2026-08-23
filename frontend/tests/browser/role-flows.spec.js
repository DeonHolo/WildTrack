import { expect, test } from '@playwright/test';

const roleKey = 'wildtrack.v2.preview-role';
const artworkViewports = [
  { label: 'desktop', width: 1280, height: 720 },
  { label: 'mobile', width: 390, height: 844 }
];

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

async function expectRenderedArtwork(locator, expectedFile) {
  await expect(locator).toBeVisible();
  const result = await locator.evaluate((element, fileName) => {
    const box = element.getBoundingClientRect();
    const backgroundImage = decodeURI(getComputedStyle(element).backgroundImage);

    return {
      hasExpectedAsset: backgroundImage.includes(fileName),
      hasSize: box.width > 0 && box.height > 0
    };
  }, expectedFile);

  expect(result.hasExpectedAsset).toBe(true);
  expect(result.hasSize).toBe(true);
}

async function useVerifiedGoogleIdentity(page) {
  await page.addInitScript(() => {
    const email = 'student.browser-test@gmail.com';
    localStorage.setItem('wildtrack.v2.student-accounts', JSON.stringify([{
      email,
      googleSubject: 'browser-test-google-subject',
      displayName: 'Browser Test Student',
      workspaceClaims: {}
    }]));
    localStorage.setItem('wildtrack.v2.active-student-account', email);
  });
}
for (const viewport of artworkViewports) {
  test('public submission form renders approved artwork on ' + viewport.label, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await useVerifiedGoogleIdentity(page);
    await page.goto('/w/it-it332-2025-26-semester-2/submit/week-9-srs');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Software Requirements Specification');
    await expectRenderedArtwork(
      page.getByRole('img', { name: 'WildTrack mascot presenting a PDF' }),
      'Showing PDF.webp'
    );
    await expect(page.getByLabel('Student Number')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit response' })).toBeVisible();
    await expectNoPageOverflow(page);
  });
}

test('approved student artwork assets are served from the root public directory', async ({ request }) => {
  const assetPaths = [
    '/assets/Waving.webp',
    '/assets/Earn%20Your%20Badges.webp',
    '/assets/Showing%20PDF.webp',
    '/assets/Good%20Job.webp'
  ];

  for (const assetPath of assetPaths) {
    const response = await request.get(assetPath);
    expect(response.ok(), assetPath + ' should load').toBe(true);
    expect(response.headers()['content-type']).toBe('image/webp');
  }
});

test('submission success stays aligned and shows the submitted Student Number', async ({ page }) => {
  await page.setViewportSize({ width: 690, height: 912 });
  await useVerifiedGoogleIdentity(page);
  await page.goto('/w/cs-cs-capstone-2025-26-semester-2/submit/week-9-srs');

  const studentNumber = page.getByLabel('Student Number');
  await studentNumber.click();
  await page.getByRole('option').first().click();
  const selectedStudentNumber = await studentNumber.inputValue();
  await page.getByLabel('PDF Drive Link').fill('https://drive.google.com/file/d/1WildTrackBrowserCheck/view');
  await page.getByRole('button', { name: 'Submit response' }).click();
  await expect(page.getByRole('heading', { name: 'Response received' })).toBeVisible();

  await expectRenderedArtwork(
    page.getByRole('img', { name: 'WildTrack mascot celebrating a recorded submission' }),
    'Good Job.webp'
  );
  await expect(page.getByText('Student Number', { exact: true })).toBeVisible();
  await expect(page.getByText(selectedStudentNumber, { exact: true })).toBeVisible();

  const banner = await page.locator('.wt-form-artwork').boundingBox();
  const surface = await page.locator('.wt-form-surface').first().boundingBox();
  expect(Math.abs(banner.width - surface.width)).toBeLessThanOrEqual(1);
  expect(surface.y - (banner.y + banner.height)).toBe(16);
  expect(await page.locator('.wt-success-surface').evaluate((element) => (
    getComputedStyle(element).borderTopColor
  ))).not.toBe('rgb(47, 125, 91)');
  await expectNoPageOverflow(page);
});
test('signed-out public submission requires Google verification before showing response fields', async ({ page }) => {
  await page.goto('/w/it-it332-2025-26-semester-2/submit/week-9-srs');

  await expect(page.getByText('Use your Google account before entering your student and submission details.')).toBeVisible();
  await expect(page.getByText(/No separate WildTrack password/i)).toHaveCount(0);
  await expect(page.getByLabel('Student Number')).toHaveCount(0);
  await expect(page.getByLabel('PDF Drive Link')).toHaveCount(0);
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

for (const viewport of artworkViewports) {
  test('student dashboard renders the normal welcome artwork on ' + viewport.label, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.addInitScript(() => {
      const email = 'student.browser-test@gmail.com';
      localStorage.setItem('wildtrack.v2.student-accounts', JSON.stringify([{
        email,
        googleSubject: 'browser-test-student',
        workspaceClaims: {
          '11111111-1111-1111-1111-111111111111': {
            studentNumber: '22-1001-001',
            studentName: 'DELA CRUZ, JUAN CARLOS M.',
            teamCode: '2526-sem2-it332-11'
          }
        }
      }]));
      localStorage.setItem('wildtrack.v2.active-student-account', email);
    });
    await openAs(page, 'student', '/student');

    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectRenderedArtwork(
      page.getByRole('img', { name: 'WildTrack mascot waving' }),
      'Waving.webp'
    );
    await expectNoPageOverflow(page);
  });
}
