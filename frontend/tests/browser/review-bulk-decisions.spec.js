import { test, expect } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

for (const width of [390, 1440]) {
  test(`bulk decisions show scope and skip archived responses at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const accepted = new Set(['response-2', 'response-3']);
    const actions = [];
    await installApiFixtures(page, { role: 'admin', submitted: true, monitoring: payload => {
      const original = payload.responses[0];
      const students = Array.from({ length: 3 }, (_, index) => ({ ...payload.students[0], id: `student-${index + 1}`,
        studentNumber: `26-100${index + 1}`, studentName: `Student ${index + 1}` }));
      const responses = students.map((student, index) => ({ ...original, id: `response-${index + 1}`,
        studentNumber: student.studentNumber, studentName: student.studentName, studentRecordId: student.id }));
      return { ...payload, students, responses, archivedResponseIds: ['response-3'],
        reviewStates: Object.fromEntries(responses.map(response => [response.id, { feedback: [],
          acceptance: accepted.has(response.id) ? { acceptedAt: response.updatedAt, sourceResponseUpdatedAt: response.updatedAt } : null }])) };
    } });
    await page.route('**/api/workspace/responses/**', async route => {
      const match = new URL(route.request().url()).pathname.match(/responses\/(response-\d)\/(accept|revoke|review-state)$/);
      if (!match) return route.fallback();
      const [, id, action] = match;
      if (action === 'review-state') return route.fulfill({ json: { feedback: [], acceptance: accepted.has(id)
        ? { acceptedAt: '2026-04-17T09:00:00Z', sourceResponseUpdatedAt: '2026-04-17T09:00:00Z' } : null } });
      actions.push({ id, action });
      if (action === 'accept') accepted.add(id); else accepted.delete(id);
      return route.fulfill({ status: 204 });
    });
    await page.goto('/review');
    await page.getByRole('button', { name: 'Select all matching responses (1)' }).click();
    await page.getByRole('button', { name: 'Accept selected (1)' }).click();
    const accept = page.getByRole('dialog', { name: 'Accept selected responses?' });
    await expect(accept.getByText(/1 selected response: 1 eligible for acceptance/)).toBeVisible();
    await expect(accept.getByText(/This does not archive responses/)).toBeVisible();
    await page.screenshot({ path: `test-results/review-bulk-accept-${width}.png`, animations: 'disabled' });
    await accept.getByRole('button', { name: 'Accept 1 eligible response' }).click();
    await expect(page.getByText('Selected responses accepted', { exact: true })).toBeVisible();
    expect(actions).toEqual([{ id: 'response-1', action: 'accept' }]);
    await page.getByRole('group', { name: 'Review filter' }).getByRole('button', { name: 'Accepted', exact: true }).click();
    await page.getByRole('button', { name: 'Select all matching responses (3)' }).click();
    await page.getByRole('button', { name: 'Revoke acceptance for selected (3)' }).click();
    const revoke = page.getByRole('dialog', { name: 'Revoke selected acceptances?' });
    await expect(revoke.getByText(/2 eligible for revocation, 1 skipped/)).toBeVisible();
    await expect(revoke.getByText(/Archived responses are skipped/)).toBeVisible();
    await revoke.getByText('Selected responses (3)', { exact: true }).click();
    await expect(revoke.getByText(/Skipped: Archived/)).toBeVisible();
    await page.screenshot({ path: `test-results/review-bulk-revoke-${width}.png`, animations: 'disabled' });
    await revoke.getByRole('button', { name: 'Revoke 2 acceptances' }).click();
    await expect(page.getByText('Selected acceptance revocation complete', { exact: true })).toBeVisible();
    expect(actions.filter(item => item.action === 'revoke').map(item => item.id).sort()).toEqual(['response-1', 'response-2']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/review-bulk-result-${width}.png`, animations: 'disabled' });
  });
}

test('an archived response opens the exact archive record and combined unarchive confirmation', async ({ page }) => {
  await installApiFixtures(page, { role: 'admin', submitted: true, monitoring: payload => ({ ...payload,
    archivedResponseIds: ['response-1'], reviewStates: { 'response-1': { feedback: [], acceptance: {
      acceptedAt: payload.responses[0].updatedAt, sourceResponseUpdatedAt: payload.responses[0].updatedAt } } } }) });
  const record = { id: 'archive-1', responseId: 'response-1', attemptId: 'response-1', softwareName: 'Archive sample',
    deliverableTitle: 'SRS', lifecycleState: 'Archived', captureState: 'COMPLETE', stateVersion: 1, files: [], history: [] };
  await page.route('**/api/archive**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/storage')
    ? { ready: true, configured: true } : [record] }));
  await page.goto('/review');
  await page.getByRole('group', { name: 'Review filter' }).getByRole('button', { name: 'Archived', exact: true }).click();
  await page.getByRole('button', { name: /Review .* response/ }).click();
  await expect(page.getByRole('button', { name: 'Revoke acceptance', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open in Archive' }).click();
  await expect(page).toHaveURL(/\/archive\?response=response-1$/);
  const drawer = page.getByRole('dialog', { name: 'Archive record details' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'Unarchive', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Unarchive this submission?' })
    .getByRole('checkbox', { name: 'Also revoke acceptance' })).toBeVisible();
});
