import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

const sourceUrl = 'https://drive.google.com/file/d/browser-pdf/view';
const field = 'field-document-pdf';
const reviewDate = '2026-10-14T11:22:46Z';

for (const width of [390, 1440]) {
test(`admin can inspect another adviser as a read-only preview at ${width}px without review mutations`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  const fixture = await installApiFixtures(page, {
    role: 'admin',
    submitted: true,
    monitoring: savedReviewMonitoring
  });
  const paidOrMutating = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' || request.method() === 'PUT' || request.method() === 'DELETE') {
      paidOrMutating.push(new URL(request.url()).pathname);
    }
  });

  await page.goto('/adviser');
  await expect(page.getByRole('heading', { name: 'My advised teams' })).toBeVisible();
  await page.getByRole('button', { name: 'View another adviser' }).click();
  await expect(page.getByRole('alert')).toContainText('Read-only adviser preview');
  const previewDescription = page.getByRole('alert').getByText(/^You are viewing another/);
  const returnButton = page.getByRole('button', { name: 'Back to my teams', exact: true });
  const descriptionBox = await previewDescription.boundingBox();
  const returnBox = await returnButton.boundingBox();
  expect(returnBox.y).toBeGreaterThanOrEqual(descriptionBox.y + descriptionBox.height + 8);
  expect(Math.abs(returnBox.x - descriptionBox.x)).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath(`batch1-preview-banner-${width}.png`) });

  const adviserSelect = page.getByRole('textbox', { name: 'Reviewing as adviser' });
  await expect(adviserSelect).toHaveValue('Dr. Elena Mercado');
  await page.getByRole('button', { name: 'Open SRS details' }).click();

  const output = page.getByRole('region', { name: /SRS group output details/i });
  await expect(output).toContainText('DELA CRUZ, JUAN CARLOS M.');
  await expect(output.getByText('Feedback for student')).toBeVisible();
  await expect(output.getByText('No student-visible feedback has been saved.')).toBeVisible();
  await expect(output.getByRole('button', { name: 'Accept group output' })).toHaveCount(0);
  await expect(output.getByRole('button', { name: 'Revoke acceptance' })).toHaveCount(0);
  await expect(output.getByRole('button', { name: /Check document|Check .*unchecked/i })).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Read-only adviser preview');
  await expect.poll(() => output.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`batch1-preview-${width}.png`) });

  await output.getByRole('button', { name: 'View Document Check' }).click();
  const checkDialog = page.getByRole('dialog', { name: /Document Check/i });
  await expect(checkDialog).toBeVisible();
  await expect(checkDialog.getByRole('button', { name: 'Check again' })).toHaveCount(0);
  await checkDialog.getByRole('button', { name: /Close/i }).click();

  await output.getByRole('button', { name: 'View AI Review' }).click();
  const ai = page.getByRole('dialog', { name: /AI Review:/i });
  await expect(ai).toBeVisible();
  await expect(ai.getByText(/^Reviewed on /)).toBeVisible();
  await expect(ai.getByRole('link', { name: 'Open PDF', exact: true })).toHaveAttribute('href', sourceUrl);
  await page.keyboard.press('Escape');
  await expect(ai).toBeHidden();
  await expect(output).toBeVisible();

  expect(paidOrMutating).toEqual([]);
  await page.getByRole('button', { name: 'Back to my teams', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Read-only adviser preview' })).toHaveCount(0);
  await page.goto('/review?response=response-1');
  await expect(page.getByRole('button', { name: 'Accept response', exact: true })).toBeVisible();
  fixture.assertRequestsHandled();
});
}

for (const width of [390, 1440]) {
  test(`keeps saved review labels and AI modal header readable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installApiFixtures(page, {
      role: 'admin', submitted: true, monitoring: savedReviewMonitoring
    });
    await page.goto('/review?response=response-1');
    const actions = page.getByRole('group', { name: 'Document and AI Review actions' });
    await expect(actions.getByRole('button', { name: 'View Document Check' })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'View AI Review' })).toBeVisible();
    await actions.getByRole('button', { name: 'View Document Check' }).click();
    const check = page.getByRole('dialog', { name: /Document Check/i });
    await expect(check.getByText('Looks filled')).toBeVisible();
    await expect(check.getByText('COMPLETED', { exact: true })).toHaveCount(0);
    await check.getByRole('button', { name: /Close/i }).click();
    await actions.getByRole('button', { name: 'View AI Review' }).click();
    const ai = page.getByRole('dialog', { name: /AI Review:/i });
    await expect(ai.getByRole('status')).toContainText('Check in PDF');
    await expect(ai).not.toContainText('before requesting a revision');
    const header = ai.locator('.mantine-Modal-header');
    await expect(header.getByRole('link', { name: 'Open PDF', exact: true })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Close AI Review details' })).toBeVisible();
    const reviewed = ai.getByText(/^Reviewed on /);
    await expect(reviewed).toBeVisible();
    const overviewHeading = ai.getByRole('heading', { name: 'Document overview' });
    await expect(ai.locator('.wt-ai-review-overview-heading')).toContainText('Reviewed on');
    const dateBox = await reviewed.boundingBox();
    const headingBox = await overviewHeading.boundingBox();
    if (width > 800) {
      expect(dateBox.x).toBeGreaterThan(headingBox.x + headingBox.width);
      expect(Math.abs(dateBox.y - headingBox.y)).toBeLessThan(8);
    }
    expect(await ai.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`batch1-ai-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(ai).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Review DELA CRUZ, JUAN CARLOS M.' })).toBeVisible();
    fixture.assertRequestsHandled();
  });

  test(`keeps the selected student's latest activity inside its summary at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installApiFixtures(page, { role: 'admin', submitted: true });
    await page.goto('/tracker');
    const latest = page.locator('.wt-tracker-latest');
    await expect(latest).toContainText('Latest:');
    await expect(latest).toContainText('2026');
    const visibleText = await latest.evaluate(node => {
      const box = node.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(node);
      return Array.from(range.getClientRects()).every(rect => rect.left >= box.left - 1
        && rect.right <= box.right + 1 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1);
    });
    expect(visibleText).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`batch1-tracker-${width}.png`) });
    fixture.assertRequestsHandled();
  });
}

function savedReviewMonitoring(payload) {
  const response = payload.responses[0];
  return {
    ...payload,
    reviewStates: { [response.id]: { feedback: [], acceptance: null } },
    fileChecksByField: { [response.id]: { [field]: savedCheck(sourceUrl) } },
    aiReviewsByField: { [response.id]: { [field]: savedReview(sourceUrl) } }
  };
}

function savedCheck(url) {
  return {
    fieldId: field,
    sourceUrl: url,
    sourceResponseUpdatedAt: '2026-04-17T09:00:00Z',
    checkedAt: '2026-10-14T11:20:00Z',
    status: 'COMPLETED',
    attentionRequired: false,
    summary: 'Readable PDF.',
    metadata: { name: 'Submitted PDF.pdf', mimeType: 'application/pdf', canDownload: true },
    document: { readable: true, pageCount: 5 },
    flags: [], missingSections: []
  };
}

function savedReview(url) {
  return {
    fieldId: field,
    sourceUrl: url,
    status: 'COMPLETED',
    generatedAt: reviewDate,
    report: {
      documentOverview: { text: 'This requirements document describes the submission workflow.', actualDocumentType: 'a software requirements specification', wrongDocument: false },
      outcome: 'INCONCLUSIVE',
      findings: [],
      verificationNotes: [{ title: 'Confirm the diagram in the PDF', issue: 'Check that the diagram labels match the described workflow.',
        source: 'OFFICIAL_TEMPLATE', evidence: 'Workflow diagram', requirement: 'Describe the workflow.', location: { page: 4 } }],
      verifiedChecks: [],
      coverage: { criteria: [] }
    }
  };
}
