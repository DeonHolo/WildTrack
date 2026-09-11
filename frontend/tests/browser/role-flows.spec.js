import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

const artworkViewports = [
  { label: 'desktop', width: 1280, height: 720 },
  { label: 'mobile', width: 390, height: 844 }
];

async function openAs(page, role, path) {
  page.apiFixture = await installApiFixtures(page, { role, connected: true, submitted: true });
  await page.goto(path);
}

test.afterEach(async ({ page }) => {
  page.apiFixture?.assertRequestsHandled();
});

async function expectNoPageOverflow(page) {
  const overflows = await page.evaluate(() => (
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  ));
  expect(overflows).toBe(false);
}

async function expectStatusIndicatorsReadable(page) {
  const indicators = page.locator('.wt-status-indicator:visible');
  await expect(indicators.first()).toBeVisible();
  const clippedLabels = await indicators.locator('.wt-status-indicator-label').evaluateAll((labels) => (
    labels.filter((label) => label.scrollWidth > label.clientWidth + 1).map((label) => label.textContent)
  ));
  expect(clippedLabels).toEqual([]);
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

async function useVerifiedGoogleIdentity(page, program = 'IT') {
  page.apiFixture = await installApiFixtures(page, { program });
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

for (const viewport of artworkViewports) {
  test('login reuses the public submission artwork on ' + viewport.label, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    page.apiFixture = await installApiFixtures(page, { role: 'anonymous' });
    await page.goto('/login');

    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to WildTrack' })).toBeVisible();
    const artwork = page.getByRole('img', { name: 'WildTrack mascot presenting a PDF' });
    await expectRenderedArtwork(artwork, 'Showing PDF.webp');
    const composition = await artwork.evaluate((element) => ({
      position: element.style.backgroundPosition,
      size: element.style.backgroundSize
    }));
    expect(composition).toEqual({ position: 'center bottom', size: 'auto 100%' });
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
  await useVerifiedGoogleIdentity(page, 'CS');
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
  page.apiFixture = await installApiFixtures(page, { role: 'anonymous' });
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
  await expectStatusIndicatorsReadable(page);
  await expectNoPageOverflow(page);
});

test('compact statuses remain readable in narrow staff tables', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 912 });
  await openAs(page, 'admin', '/forms');
  await expect(page.getByRole('heading', { name: 'Forms', exact: true })).toBeVisible();
  await expectStatusIndicatorsReadable(page);

  await page.goto('/workspace');
  await expect(page.getByRole('heading', { name: 'Workspace setup', exact: true })).toBeVisible();
  await expectStatusIndicatorsReadable(page);
});

test('workspace source imports fit at desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openAs(page, 'admin', '/workspace');

  const sourceTable = page.getByRole('table', { name: 'Workspace source sheets' });
  await expect(sourceTable).toBeVisible();
  for (const name of ['Import Team Formation', 'Import Tracker', 'Import Project Monitor']) {
    const action = sourceTable.getByRole('button', { name });
    await expect(action).toBeVisible();
    await expect(action).toHaveText('Import');
  }
  expect(await page.locator('.wt-source-table-wrap').evaluate((element) => (
    element.scrollWidth <= element.clientWidth + 1
  ))).toBe(true);
});

for (const viewport of artworkViewports) {
  test('workspace administration keeps inactive records out of the main flow on ' + viewport.label, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openAs(page, 'admin', '/workspace');

    const workspaceToggle = page.getByRole('button', { name: /Academic workspaces/i });
    await expect(workspaceToggle).toHaveAttribute('aria-expanded', 'false');
    await workspaceToggle.click();
    await expect(page.getByRole('table', { name: 'Academic workspaces' })).toBeVisible();

    await expect(page.getByText('1 assigned capstone team. Open Edit access to review assignments.')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Revoked access (1)' })).toBeVisible();
    await expect(page.getByText('revoked.browser-test@gmail.com')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Revoked access (1)' }).click();
    await expect(page.getByText('revoked.browser-test@gmail.com')).toBeVisible();

    await page.getByRole('button', { name: 'Collapse Staff & Advisers' }).click();
    await expect(page.getByRole('button', { name: 'Expand Staff & Advisers' })).toHaveAttribute('aria-expanded', 'false');
    await expectNoPageOverflow(page);
  });
}

test('adviser lands on assigned-team review', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openAs(page, 'adviser', '/adviser');

  await expect(page.getByRole('heading', { name: 'My advised teams' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Staff navigation' })).toBeVisible();
  await expectStatusIndicatorsReadable(page);

  const feedback = page.getByRole('textbox', { name: 'Feedback for student' });
  await feedback.scrollIntoViewIfNeeded();
  const editorBox = await page.locator('.wt-adviser-feedback-editor').boundingBox();
  const detailBox = await page.locator('.wt-adviser-output-detail').boundingBox();
  expect(Math.abs((editorBox.x + editorBox.width / 2) - (detailBox.x + detailBox.width / 2))).toBeLessThanOrEqual(2);
  await expectNoPageOverflow(page);
});

for (const viewport of artworkViewports) {
  test('student dashboard renders the normal welcome artwork on ' + viewport.label, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openAs(page, 'student', '/student');

    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectRenderedArtwork(
      page.getByRole('img', { name: 'WildTrack mascot waving' }),
      'Waving.webp'
    );
    await expectStatusIndicatorsReadable(page);
    const trackerHelp = page.getByRole('button', { name: 'Explain tracker values' });
    await trackerHelp.focus();
    await expect(page.getByRole('tooltip')).toHaveText('Numbers show days late. 0 means submitted on time.');
    const submittedDetail = page.locator('.wt-student-deliverable-detail').first();
    await expect(submittedDetail).toBeVisible();
    expect(await submittedDetail.evaluate((element) => getComputedStyle(element).borderTopStyle)).toBe('none');
    await expectNoPageOverflow(page);
  });
}
