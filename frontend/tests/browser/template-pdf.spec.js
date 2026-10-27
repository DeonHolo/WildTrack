import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

const workspaceId = '11111111-1111-1111-1111-111111111111';
const templateId = '33333333-3333-3333-3333-333333333333';
const versionId = '44444444-4444-4444-4444-444444444444';
const nextVersion = '55555555-5555-5555-5555-555555555555';
const previewUrl = `/templates/${templateId}/preview?workspaceId=${workspaceId}`;
const structure = {
  id: templateId, originalFilename: 'Software Project Management Plan - Official Template.docx',
  displayName: 'Project management template', sha256: 'source-one',
  detectedHeadings: ['Introduction', 'Roles and responsibilities', 'Resources and schedule'],
  expectedHeadings: ['Introduction', 'Roles and responsibilities', 'Resources and schedule'],
  extractedText: 'This text-only preview must not replace the retained PDF.'
};
const ready = { templateId, versionId, sourceSha256: 'source-one', state: 'READY', pages: 2, originalAvailable: true };

// A real two-page PDF with an xref table, rendered by Chromium's native PDF viewer.
function templatePdf() {
  const content = text => `BT /F1 20 Tf 48 760 Td (${text}) Tj 0 -36 Td /F1 12 Tf (Describe the project scope, users, roles and schedule.) Tj ET`;
  const first = content('Official template - page 1');
  const second = content('Workflow and validation - page 2');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(first)} >>\nstream\n${first}\nendstream`,
    `<< /Length ${Buffer.byteLength(second)} >>\nstream\n${second}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  return Buffer.from(`${pdf}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

async function installTemplate(page, { role = 'admin', state = ready, getStructure = () => structure, retry, checklist } = {}) {
  const fixture = await installApiFixtures(page, { role });
  const calls = [];
  let lastState = ready;
  let checklistView = checklist;
  await page.route(`**/api/templates/${templateId}/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    expect(url.searchParams.get('workspaceId')).toBe(workspaceId);
    calls.push({ path: url.pathname, method: request.method(), versionId: url.searchParams.get('versionId') });
    const json = value => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname.endsWith('/structure')) return json(getStructure());
    if (url.pathname.endsWith('/pdf-state')) { lastState = typeof state === 'function' ? state() : state; return json(lastState); }
    if (url.pathname.endsWith('/checklist')) {
      checklistView ||= { versionId: lastState.versionId, revision: 0, state: 'UNPREPARED', pdfPages: 2, items: [] };
      if (request.method() === 'PUT') checklistView = { ...checklistView, revision: checklistView.revision + 1, state: 'DRAFT', items: request.postDataJSON().items };
      return json(checklistView);
    }
    if (url.pathname.endsWith('/checklist/approve')) {
      expect(request.postDataJSON().expectedRevision).toBe(checklistView.revision);
      checklistView = { ...checklistView, state: 'APPROVED', revision: checklistView.revision + 1 };
      return json(checklistView);
    }
    if (url.pathname.endsWith('/pdf/retry')) {
      expect(request.method()).toBe('POST');
      expect(url.searchParams.get('versionId')).toBe(versionId);
      retry?.();
      return json({ accepted: true });
    }
    if (url.pathname.endsWith('/pdf')) return route.fulfill({ contentType: 'application/pdf', body: templatePdf(),
      headers: { 'content-disposition': 'inline; filename="Official template.pdf"', 'x-frame-options': 'SAMEORIGIN' } });
    if (url.pathname.endsWith('/file')) return route.fulfill({ contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: Buffer.from('original-file-fixture') });
    throw new Error(`Unexpected template fixture request: ${request.method()} ${url.pathname}`);
  });
  return { ...fixture, templateCalls: calls };
}

for (const width of [390, 1440]) {
  test(`shows the retained PDF and keeps template headings and actions readable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 950 });
    const fixture = await installTemplate(page);
    const pdfResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/templates/${templateId}/pdf`);
    await page.goto(previewUrl);
    await expect(page.getByRole('heading', { name: 'Template headings', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Template body sections' }).getByRole('listitem')).toHaveText(structure.detectedHeadings);
    await expect(page.getByText(structure.extractedText)).toHaveCount(0);
    const frame = page.locator('iframe[title="Official template PDF"]');
    await expect(frame).toHaveAttribute('src', new RegExp(`workspaceId=${workspaceId}&versionId=${versionId}`));
    const response = await pdfResponse;
    expect(response.headers()['content-type']).toContain('application/pdf');
    // The PDF plugin navigates away from Chromium's original resource identifier.
    const servedBytes = await page.evaluate(async src => Array.from(new Uint8Array(await (await fetch(src)).arrayBuffer())), await frame.getAttribute('src'));
    expect(Buffer.from(servedBytes).equals(templatePdf())).toBe(true);
    await expect(page.getByRole('link', { name: 'Open PDF', exact: true })).toHaveAttribute('href', await frame.getAttribute('src'));
    await expect(page.getByRole('link', { name: 'Original file', exact: true })).toHaveAttribute('href', `/api/templates/${templateId}/file?workspaceId=${workspaceId}`);
    await frame.scrollIntoViewIfNeeded();
    await expect(frame).toBeVisible();
    const box = await frame.boundingBox();
    expect(box.width).toBeGreaterThan(width === 390 ? 260 : 430);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.getByRole('region', { name: 'Template body sections' }).evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
    await page.screenshot({ path: testInfo.outputPath(`template-pdf-${width}.png`), fullPage: true });
    fixture.assertRequestsHandled();
  });
}

for (const width of [390, 1440]) {
  test(`an admin can inspect, correct and approve a long checklist beside its PDF at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 950 });
    const items = Array.from({ length: 33 }, (_, index) => ({ title: `Describe project activity ${index + 1}`,
      instruction: 'Describe the project scope, users, roles and schedule.', sourceQuote: 'Describe the project scope, users, roles and schedule.',
      section: 'Project planning', page: 1, applicability: 'REQUIRED', condition: '' }));
    const fixture = await installTemplate(page, { checklist: { versionId, revision: 2, state: 'DRAFT', pdfPages: 2, items } });
    await page.goto(previewUrl);
    const editor = page.locator('.template-checklist');
    await expect(editor.getByRole('button', { name: 'Describe project activity 33', exact: true })).toBeAttached();
    await editor.getByRole('button', { name: 'Describe project activity 1', exact: true }).click();
    await editor.getByRole('textbox', { name: 'Instruction', exact: true }).fill('Describe the project scope and identify its users.');
    await expect(editor.getByRole('button', { name: 'Approve checklist', exact: true })).toBeDisabled();
    await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Approve checklist', exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath(`checklist-edit-${width}.png`), fullPage: true });
    await editor.getByRole('button', { name: 'Approve checklist', exact: true }).click();
    await expect(page.getByText('Confirm that you checked the saved checklist against the template PDF.')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm approval', exact: true }).click();
    await expect(editor.getByText('Approved', { exact: true })).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Describe project activity 33', exact: true })).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await editor.getByRole('button', { name: 'Describe project activity 1', exact: true }).evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
    await page.screenshot({ path: testInfo.outputPath(`checklist-approved-${width}.png`), fullPage: true });
    expect(fixture.templateCalls.filter(call => call.method !== 'GET').map(call => call.method)).toEqual(['PUT', 'POST']);
    fixture.assertRequestsHandled();
  });
}

test('preparation polls to a ready PDF without starting an AI request', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 950 });
  let polls = 0, readyNow = false;
  const fixture = await installTemplate(page, { state: () => { polls++; return readyNow ? ready : { ...ready, state: 'PROCESSING' }; } });
  await page.goto(previewUrl);
  await expect(page.getByText('Preparing template PDF…')).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('template-pdf-preparing-390.png'), fullPage: true });
  readyNow = true;
  await expect(page.locator('iframe[title="Official template PDF"]')).toBeVisible({ timeout: 10000 });
  expect(polls).toBeGreaterThanOrEqual(2);
  expect(fixture.calls.filter(call => call.method !== 'GET')).toEqual([]);
  expect(fixture.templateCalls.filter(call => call.method !== 'GET')).toEqual([]);
  fixture.assertRequestsHandled();
});

test('an administrator can retry failed preparation and retain the original-file action', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 950 });
  let retried = false;
  const fixture = await installTemplate(page, { state: () => retried ? ready : { ...ready, state: 'FAILED', retryable: true, error: 'The original is retained. PDF preparation could not finish.' }, retry: () => { retried = true; } });
  await page.goto(previewUrl);
  await expect(page.getByText('Template PDF unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Original file', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open PDF', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('template-pdf-failed-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'Retry PDF preparation' }).click();
  await expect(page.locator('iframe[title="Official template PDF"]')).toBeVisible();
  expect(fixture.templateCalls.filter(call => call.method === 'POST')).toHaveLength(1);
  fixture.assertRequestsHandled();
});

test('an older non-PDF original explains PDF replacement without a useless retry', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 950 });
  const fixture = await installTemplate(page, { state: { ...ready, state: 'FAILED', retryable: false,
    error: 'Upload this template as a PDF. The original file is retained.' } });
  await page.goto(previewUrl);
  await expect(page.getByText('Upload this template as a PDF. The original file is retained.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Original file', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry PDF preparation' })).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('template-legacy-pdf-replacement-390.png'), fullPage: true });
  expect(fixture.templateCalls.every(call => call.method === 'GET')).toBe(true);
  fixture.assertRequestsHandled();
});

test('advisers can inspect failed preparation but cannot restart it', async ({ page }) => {
  const fixture = await installTemplate(page, { role: 'adviser', state: { ...ready, state: 'FAILED' } });
  await page.goto(previewUrl);
  await expect(page.getByText('Template PDF unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to my teams' })).toHaveAttribute('href', '/adviser');
  await expect(page.getByRole('button', { name: 'Retry PDF preparation' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Original file', exact: true })).toBeVisible();
  fixture.assertRequestsHandled();
});

test('an unavailable original offers neither a broken original-file action nor retry', async ({ page }) => {
  const fixture = await installTemplate(page, { state: { ...ready, state: 'FAILED', originalAvailable: false, error: 'Re-upload this template to prepare its PDF.' } });
  await page.goto(previewUrl);
  await expect(page.getByText('Re-upload this template to prepare its PDF.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Original file', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry PDF preparation' })).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
  fixture.assertRequestsHandled();
});

test('a replacement detected during polling never displays the old PDF and reloads the new version', async ({ page }) => {
  let replacementNow = false, current = structure;
  const fixture = await installTemplate(page, {
    getStructure: () => current,
    state: () => !replacementNow ? { ...ready, state: 'PROCESSING' } : { ...ready, versionId: nextVersion, sourceSha256: 'source-two' }
  });
  await page.goto(previewUrl);
  await expect(page.getByText('Preparing template PDF…')).toBeVisible();
  replacementNow = true;
  await expect(page.getByText('Template changed', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(fixture.templateCalls.filter(call => call.path.endsWith('/pdf'))).toEqual([]);
  current = { ...structure, sha256: 'source-two' };
  await page.getByRole('button', { name: 'Reload template' }).click();
  await expect(page.locator('iframe')).toHaveAttribute('src', new RegExp(`versionId=${nextVersion}`));
  expect(fixture.templateCalls.filter(call => call.path.endsWith('/pdf')).every(call => call.versionId === nextVersion)).toBe(true);
  fixture.assertRequestsHandled();
});
