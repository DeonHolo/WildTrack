import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

const field = 'field-document-pdf';
const sourceUrl = 'https://drive.google.com/file/d/browser-pdf/view';
const longInstruction = 'For each actual work activity, identify the responsible role, required resources, '
  + 'planned start and finish dates, dependencies and the evidence used to confirm completion. '
  + 'Explain how changes to the schedule are assessed against the available budget, staffing and quality objectives. '
  + 'If external services are used, retain the service owner, communication method and recovery arrangements. '
  + 'A supporting matrix may be used; the example names and number of activities do not prescribe the project structure.';
const criteria = Array.from({ length: 113 }, (_, index) => ({
  id: `T${index + 1}`, title: `Instruction ${index + 1}: Project responsibilities`,
  source: 'OFFICIAL_TEMPLATE', requirement: index === 99 ? longInstruction
    : 'Describe the roles and responsibilities of the project team.',
  assessment: index === 112 ? 'NOT_APPLICABLE' : 'APPEARS_ADDRESSED',
  explanation: index === 112 ? 'External procurement is optional; the team uses existing equipment.'
    : 'The plan assigns responsibilities to named team members.',
  documentEvidence: index === 112 ? '' : 'The project manager assigns and tracks team responsibilities.',
  location: index === 112 ? null : { page: index + 4 },
  findingIndexes: [], missingSectionIndexes: [], verifiedCheckIndexes: [], verificationNoteIndexes: []
}));
const report = {
  documentOverview: { text: 'This project plan describes responsibilities, schedules and control procedures.',
    actualDocumentType: 'a project management plan', wrongDocument: false },
  outcome: 'NO_ISSUES_IN_CHECKED_AREAS', findings: [], verificationNotes: [], verifiedChecks: [],
  missingRequiredSections: [], limitations: [], coverage: { criteria, omittedCriteria: 0 }
};

for (const width of [390, 1440]) test(`complete 113-item checklist remains compact and readable at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 950 });
  const fixture = await installApiFixtures(page, { role: 'admin', submitted: true, monitoring: payload => {
    const response = payload.responses[0];
    return { ...payload, reviewStates: { [response.id]: { feedback: [], acceptance: null } },
      fileChecksByField: { [response.id]: { [field]: { status: 'COMPLETED', sourceUrl,
        sourceResponseUpdatedAt: response.updatedAt, checkedAt: '2026-10-27T00:00:00Z', attentionRequired: false,
        flags: [], document: { readable: true, pageCount: 120 } } } },
      aiReviewsByField: { [response.id]: { [field]: { fieldId: field, sourceUrl, status: 'COMPLETED',
        sourceResponseUpdatedAt: response.updatedAt, generatedAt: '2026-10-27T00:01:00Z', report } } } };
  } });
  await page.goto('/review?response=response-1');
  await page.getByRole('button', { name: 'View AI Review', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'AI Review: Software Requirements Specification' });
  await expect(modal.getByText('113 template instructions assessed', { exact: true })).toBeVisible();
  await expect(modal.getByText('Appears addressed (112)', { exact: true })).toBeVisible();
  await expect(modal.getByText('Not applicable (1)', { exact: true })).toBeVisible();
  await expect(modal.locator('.wt-ai-review-assessment-row')).toHaveCount(113);
  await expect(modal.getByText(/outside the saved checklist/)).toHaveCount(0);
  const hundred = modal.locator('details.wt-ai-review-assessment-row').filter({ hasText: 'Instruction 100:' });
  await expect(hundred).toHaveCount(1);
  await expect(hundred.locator('summary')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath(`fixed-checklist-collapsed-${width}.png`) });
  await modal.getByText('Appears addressed (112)', { exact: true }).click();
  await hundred.locator('summary').click();
  await expect(hundred.getByText('Instruction:', { exact: true })).toBeVisible();
  await expect(hundred.getByText(longInstruction, { exact: false })).toBeVisible();
  await expect(hundred.getByRole('blockquote')).toContainText('project manager');
  expect(await hundred.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(await hundred.locator('summary').evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
  const pageBox = await hundred.locator('.wt-ai-review-assessment-page').boundingBox();
  const rowBox = await hundred.boundingBox();
  expect(pageBox.x + pageBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
  expect(await modal.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`fixed-checklist-expanded-${width}.png`) });
  await modal.getByText('Appears addressed (112)', { exact: true }).click();
  await modal.getByText('Not applicable (1)', { exact: true }).click();
  await expect(modal.locator('details.wt-ai-review-assessment-row').filter({ hasText: 'Instruction 113:' }).locator('summary')).toBeVisible();
  expect(fixture.calls.filter(call => call.method !== 'GET')).toEqual([]);
  fixture.assertRequestsHandled();
});
