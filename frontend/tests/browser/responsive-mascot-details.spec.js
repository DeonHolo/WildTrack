import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

const viewports = [
  { width: 320, height: 740 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 414, height: 896 },
  { width: 640, height: 900 },
  { width: 641, height: 900 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 844, height: 390 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 }
];

async function expectArtworkClear(banner, copySelector, artSelector) {
  await expect(banner).toBeVisible();
  const bounds = await banner.evaluate((element, selectors) => {
    const rect = node => {
      const { left, top, right, bottom, width, height } = node.getBoundingClientRect();
      return { left, top, right, bottom, width, height };
    };
    return {
      banner: rect(element),
      copy: rect(element.querySelector(selectors.copy)),
      art: rect(element.querySelector(selectors.art)),
      contentWidth: element.scrollWidth,
      width: element.clientWidth,
      viewport: window.innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      clippedArtwork: getComputedStyle(element).overflowX === 'hidden',
      text: [...element.querySelectorAll(`${selectors.copy} > *`)].map(rect)
    };
  }, { copy: copySelector, art: artSelector });
  const intersect = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
    && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  expect(bounds.banner.left).toBeGreaterThanOrEqual(0);
  expect(bounds.banner.right).toBeLessThanOrEqual(bounds.viewport + 1);
  // Artwork may deliberately extend beyond the clipping banner; text may not.
  expect(bounds.pageWidth).toBeLessThanOrEqual(bounds.viewport + 1);
  if (!bounds.clippedArtwork) expect(bounds.contentWidth).toBeLessThanOrEqual(bounds.width + 1);
  expect(bounds.art.width).toBeGreaterThan(0);
  expect(bounds.art.height).toBeGreaterThan(0);
  expect(intersect(bounds.copy, bounds.art), JSON.stringify(bounds)).toBe(false);
  for (const text of bounds.text) {
    expect(text.left).toBeGreaterThanOrEqual(bounds.banner.left);
    expect(text.right).toBeLessThanOrEqual(bounds.banner.right);
    expect(text.top).toBeGreaterThanOrEqual(bounds.banner.top);
    expect(text.bottom).toBeLessThanOrEqual(bounds.banner.bottom);
  }
}

for (const complete of [false, true]) {
  test(`dashboard ${complete ? 'trophy' : 'waving paw'} stays clear of long names across viewports`, async ({ page }, testInfo) => {
    const api = await installApiFixtures(page, {
      connected: true,
      submitted: complete,
      dashboard: payload => ({
        ...payload,
        association: { ...payload.association, studentName: 'Alexanderthegreatstudent Example' },
        students: payload.students.map(student => ({ ...student, studentName: 'Alexanderthegreatstudent Example' })),
        deliverables: complete ? payload.deliverables.slice(0, 1) : payload.deliverables
      })
    });
    await page.goto('/student');
    const banner = page.getByRole('region', { name: 'Student dashboard welcome' });
    await expect(banner.getByRole('heading', { name: 'Welcome back, Alexanderthegreatstudent' })).toBeVisible();
    await expect(banner.getByRole('img', { name: complete ? 'WildTrack mascot holding a trophy' : 'WildTrack mascot waving', exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    for (const viewport of viewports) {
      await test.step(`${viewport.width}×${viewport.height}`, async () => {
        await page.setViewportSize(viewport);
        await expectArtworkClear(banner, '.wt-student-welcome-copy', '.wt-student-welcome-art');
        {
          await testInfo.attach(`dashboard-${complete ? 'complete' : 'welcome'}-${viewport.width}`, {
            body: await banner.screenshot({ path: testInfo.outputPath(`dashboard-${complete ? 'complete' : 'welcome'}-${viewport.width}x${viewport.height}.png`) }), contentType: 'image/png'
          });
        }
      });
    }
    api.assertRequestsHandled();
  });
}

test('dashboard keeps enlarged text and a long next-deliverable name clear of the paw', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const api = await installApiFixtures(page, {
    connected: true,
    dashboard: payload => ({
      ...payload,
      deliverables: payload.deliverables.map(item => ({ ...item, trackerColumnKey: 'ExtremelyLongUnbrokenDeliverableName' }))
    })
  });
  await page.goto('/student');
  const banner = page.getByRole('region', { name: 'Student dashboard welcome' });
  await expect(banner).toContainText('ExtremelyLongUnbrokenDeliverableName');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await page.evaluate(() => document.fonts.ready);
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expectArtworkClear(banner, '.wt-student-welcome-copy', '.wt-student-welcome-art');
  }
  await testInfo.attach('dashboard-enlarged-text', { body: await banner.screenshot(), contentType: 'image/png' });
  api.assertRequestsHandled();
});

for (const scenario of [
  { name: 'sign-in', path: '/login', role: 'anonymous' },
  { name: 'registration', path: '/register', role: 'anonymous' },
  { name: 'student entry', path: '/student', role: 'student' },
  { name: 'submission form', path: '/s/' + 'a'.repeat(64), role: 'student', connected: true },
  { name: 'submission success', path: '/s/' + 'a'.repeat(64), role: 'student', connected: true, submit: true }
]) {
  test(`${scenario.name} artwork keeps its text readable across viewports`, async ({ page }, testInfo) => {
    // A synthetic GIS button keeps this layout check independent of Google/network availability.
    await page.addInitScript(() => {
      window.google = { accounts: { id: {
        initialize() {}, prompt() {}, cancel() {}, disableAutoSelect() {},
        renderButton(container) {
          const button = document.createElement('button');
          button.textContent = 'Sign in with Google';
          container.append(button);
        }
      } } };
    });
    const api = await installApiFixtures(page, { role: scenario.role, connected: Boolean(scenario.connected) });
    await page.goto(scenario.path);
    if (scenario.submit) {
      await page.getByLabel('PDF Drive Link').fill('https://drive.google.com/file/d/new-submitted-pdf/view');
      await page.getByRole('button', { name: 'Submit response', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Response received' })).toBeVisible();
    }
    const banner = page.locator('.wt-form-artwork');
    await expect(banner).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    for (const viewport of viewports) {
      await test.step(`${viewport.width}×${viewport.height}`, async () => {
        await page.setViewportSize(viewport);
        await expectArtworkClear(banner, '.wt-artwork-copy', '.wt-artwork-mascot');
        if ([390, 1280].includes(viewport.width)) {
          await testInfo.attach(`${scenario.name}-${viewport.width}`, { body: await banner.screenshot(), contentType: 'image/png' });
        }
      });
    }
    api.assertRequestsHandled();
  });
}

const sourceUrl = 'https://drive.google.com/file/d/browser-pdf/view';
const savedCheck = {
  id: 'responsive-check', responseId: 'response-1', fieldId: 'field-document-pdf',
  sourceUrl, sourceResponseUpdatedAt: '2026-04-17T09:00:00Z', checkedAt: '2026-04-17T09:00:00Z',
  status: 'COMPLETED', attentionRequired: false, summary: 'The submitted PDF is accessible and readable.',
  flags: [], redFlags: [], missingSections: [],
  metadata: { name: 'Browser SRS.pdf', mimeType: 'application/pdf', canDownload: true },
  document: { readable: true, pageCount: 5 }
};

for (const role of ['student', 'admin', 'adviser']) {
  test(`${role} Document Check folds missing details and supports keyboard reveal`, async ({ page }, testInfo) => {
    const withCheck = payload => ({ ...payload, fileChecksByField: { 'response-1': { 'field-document-pdf': savedCheck } } });
    const api = await installApiFixtures(page, {
      role, connected: true, submitted: true, dashboard: withCheck, monitoring: withCheck
    });
    await page.goto(role === 'student' ? '/student' : role === 'admin' ? '/review?response=response-1' : '/adviser');
    const open = role === 'student'
      ? page.getByRole('button', { name: 'View results', exact: true })
      : page.getByRole('button', { name: 'View Document Check', exact: true });
    await open.click();
    const dialog = page.getByRole('dialog').last();
    const validation = dialog.locator('.document-check-section').filter({ has: page.getByRole('heading', { name: 'File validation', exact: true }) });
    const summary = validation.locator('summary').filter({ hasText: /^Unavailable details \(\d+\)$/ });
    const details = summary.locator('..');
    for (const viewport of viewports.filter(item => [320, 390, 768, 1280].includes(item.width))) {
      await test.step(`${viewport.width}×${viewport.height}`, async () => {
        await page.setViewportSize(viewport);
        await expect(details).toHaveJSProperty('open', false);
        await expect(validation.getByText('Created time', { exact: true })).toBeHidden();
        await expect(validation.getByText('Pages', { exact: true })).toBeVisible();
        await expect(validation.getByText('PDF integrity', { exact: true })).toBeVisible();
        const box = await summary.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        await summary.focus();
        await page.keyboard.press('Enter');
        await expect(details).toHaveJSProperty('open', true);
        await expect(validation.getByText('Created time', { exact: true })).toBeVisible();
        if (role === 'student') {
          await expect(dialog.getByText('Drive owner', { exact: true })).toHaveCount(0);
          await expect(dialog.getByText('Last modified by', { exact: true })).toHaveCount(0);
        }
        const size = await dialog.evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
        expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
        await page.keyboard.press('Space');
        await expect(details).toHaveJSProperty('open', false);
        if (viewport.width === 390) {
          await testInfo.attach(`${role}-document-check-collapsed`, { body: await dialog.screenshot(), contentType: 'image/png' });
        }
      });
    }
    await summary.click();
    await expect(details).toHaveJSProperty('open', true);
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await open.click();
    await expect(details).toHaveJSProperty('open', false);
    api.assertRequestsHandled();
  });
}
