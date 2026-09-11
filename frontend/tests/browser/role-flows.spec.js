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
  test('login reuses the shared artwork layout while keeping its own mascot on ' + viewport.label, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    page.apiFixture = await installApiFixtures(page, { role: 'anonymous' });
    await page.goto('/login');

    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to WildTrack' })).toBeVisible();
    const artwork = page.getByRole('img', { name: 'WildTrack mascot exploring quest nodes' });
    await expectRenderedArtwork(artwork, 'FIND QUEST NODES.webp');
    const composition = await artwork.evaluate(async (element) => {
      const styles = getComputedStyle(element);
      const match = styles.backgroundImage.match(/url\(["']?(.*?)["']?\)/);
      const image = new Image();
      image.src = match?.[1] || '';
      await image.decode();

      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = canvas.width;
      let maxX = -1;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          if (pixels[(y * canvas.width + x) * 4 + 3] > 8) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
          }
        }
      }

      const percent = Number.parseFloat(styles.backgroundSize.split(' ')[1]) / 100;
      const imageHeight = element.clientHeight * percent;
      const scale = imageHeight / image.naturalHeight;
      const imageWidth = image.naturalWidth * scale;
      const positionX = Number.parseFloat(styles.backgroundPosition.split(' ')[0]) / 100;
      const imageLeft = (element.clientWidth - imageWidth) * positionX;
      const visibleLeft = imageLeft + minX * scale;
      const visibleRight = imageLeft + (maxX + 1) * scale;
      const box = element.getBoundingClientRect();
      const parentBox = element.parentElement.getBoundingClientRect();

      return {
        position: styles.backgroundPosition,
        size: styles.backgroundSize,
        visibleLeft,
        visibleRight,
        clientWidth: element.clientWidth,
        withinParent: box.left >= parentBox.left - 1 && box.right <= parentBox.right + 1
      };
    });
    expect(composition.position).toBe('50% 100%');
    expect(composition.visibleLeft).toBeGreaterThanOrEqual(-1);
    expect(composition.visibleRight).toBeLessThanOrEqual(composition.clientWidth + 1);
    expect(composition.withinParent).toBe(true);
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
    const staffToggle = page.getByRole('button', { name: 'Collapse Staff & Advisers' });
    await expect(workspaceToggle).toHaveClass(/wt-collapsible-trigger/);
    await expect(staffToggle).toHaveClass(/wt-collapsible-trigger/);
    await expect(workspaceToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(workspaceToggle).toContainText('Show');
    await expect(page.getByText('Deliverable columns', { exact: true })).toHaveCount(0);
    await workspaceToggle.click();
    await expect(workspaceToggle).toContainText('Hide');
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

test('workspace archive closeout preflight stays readable without overlapping controls on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAs(page, 'admin', '/workspace');
  await page.getByRole('button', { name: 'Expand Academic workspaces' }).click();
  await page.getByRole('button', { name: 'Archive' }).click();

  const dialog = page.getByRole('dialog', { name: 'Archive workspace?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Submissions archived')).toBeVisible();
  await expect(dialog.getByText('Forms unpublished')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Manage forms' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Archive anyway' })).toBeVisible();

  const metrics = await dialog.evaluate((element) => {
    const dialogBox = element.getBoundingClientRect();
    const cards = [...element.querySelectorAll('.wt-archive-readiness-card')];
    return {
      insideViewport: dialogBox.left >= 0 && dialogBox.right <= window.innerWidth,
      noHorizontalOverflow: element.scrollWidth <= element.clientWidth + 1,
      cards: cards.map((card) => {
        const copy = card.querySelector(':scope > span');
        const button = card.querySelector('.mantine-Button-root');
        return {
          noOverflow: card.scrollWidth <= card.clientWidth + 1,
          noButtonOverlap: !copy || !button || button.getBoundingClientRect().top >= copy.getBoundingClientRect().bottom - 1
        };
      })
    };
  });
  expect(metrics.insideViewport).toBe(true);
  expect(metrics.noHorizontalOverflow).toBe(true);
  expect(metrics.cards).toHaveLength(2);
  for (const card of metrics.cards) {
    expect(card.noOverflow).toBe(true);
    expect(card.noButtonOverlap).toBe(true);
  }
  await expectNoPageOverflow(page);
});

test('forms exposes one guarded unpublish-all cleanup action', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openAs(page, 'admin', '/forms');

  const cleanup = page.getByRole('button', { name: 'Unpublish all' });
  await expect(cleanup).toBeVisible();
  await cleanup.click();
  const dialog = page.getByRole('dialog', { name: 'Unpublish all 2 published forms?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('existing response');
  await expect(dialog.getByRole('button', { name: 'Unpublish all' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep published' }).click();
});

test('forms shows server-side cleanup progress while unpublishing all forms', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openAs(page, 'admin', '/forms');
  await page.route('**/api/deliverables/unpublish-all**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fallback();
  });

  await page.getByRole('button', { name: 'Unpublish all' }).click();
  const dialog = page.getByRole('dialog', { name: 'Unpublish all 2 published forms?' });
  await dialog.getByRole('button', { name: 'Unpublish all' }).click();

  const progress = page.getByRole('status', { name: 'Unpublishing all forms' });
  await expect(progress).toBeVisible();
  await expect(progress).toContainText('one server-side batch');
  await expect(page.getByRole('button', { name: 'Publish form' })).toBeDisabled();
  await expect(progress).toHaveCount(0, { timeout: 5000 });
  await expect(page.getByText('Unpublished', { exact: true })).toHaveCount(2);
});

test('short desktop pages do not reserve an empty global scrollbar gutter', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openAs(page, 'admin', '/forms');

  const metrics = await page.evaluate(() => ({
    gutter: getComputedStyle(document.documentElement).scrollbarGutter,
    innerWidth: window.innerWidth,
    headerRight: document.querySelector('.wt-staff-header')?.getBoundingClientRect().right ?? 0
  }));
  expect(metrics.gutter).toBe('auto');
  expect(Math.abs(metrics.innerWidth - metrics.headerRight)).toBeLessThanOrEqual(1);
});

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
