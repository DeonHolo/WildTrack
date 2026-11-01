import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

for (const viewport of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`sort tracker and academic grids on ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await installApiFixtures(page, { role: 'admin', connected: true, monitoring: (payload) => ({ ...payload,
      students: [1, 2, 10].map((n) => ({ id: `s${n}`, studentNumber: `26-${n}`, studentName: `Student ${n}`, teamCode: `TEAM-${n}`, memberNumber: `${n}` })),
      trackerRows: [1, 2, 10].map((n) => ({ id: `r${n}`, studentNumber: `26-${n}`, studentName: `Student ${n}`, teamCode: `TEAM-${n}`, memberNumber: `${n}`, cells: [{ columnKey: 'SRS', rawValue: `${n}` }] }))
    }) });
    const snapshot = {
      students: [10, 2, 1].map((n) => ({ id: `s${n}`, studentNumber: `26-${n}`, studentName: `Student ${n}`, teamCode: `TEAM-${n}`, memberNumber: `${n}` })),
      projects: [10, 2, 1].map((n) => ({ id: `p${n}`, groupCode: `TEAM-${n}`, projectTitle: `Project ${n}` })),
      trackerColumns: [1, 2, 10].map((n) => ({ id: `c${n}`, columnKey: `C${n}`, label: `C${n}`, active: true })),
      deliverables: [10, 2, 1].map((n) => ({ id: `d${n}`, trackerColumnKey: `C${n}`, title: `Title ${n}`, dueAt: `2026-10-${String(n).padStart(2, '0')}T12:00:00`, status: 'PUBLISHED' }))
    };
    let writes = [];
    await page.route('**/api/academic-data**', async (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: snapshot });
      if (route.request().method() === 'PUT') { writes = route.request().postDataJSON().rows; return route.fulfill({ json: writes }); }
      return route.fallback();
    });
    await page.goto('/tracker');
    const tracker = page.getByRole('table', { name: 'Student tracker values' });
    await tracker.getByRole('button', { name: 'Sort by Team Code' }).click();
    await expect(tracker.locator('tbody tr').first()).toContainText('TEAM-1');
    await tracker.getByRole('button', { name: 'Sort by Team Code' }).click();
    await expect(tracker.locator('tbody tr').first()).toContainText('TEAM-10');
    await page.screenshot({ path: testInfo.outputPath(`tracker-${viewport.name}.png`) });
    await page.goto('/academic-data');
    const students = page.getByRole('table', { name: 'Students academic data' });
    await students.getByRole('button', { name: 'Sort by Member #' }).click();
    await expect(students.locator('tbody tr').first().getByRole('textbox', { name: 'Student Number for 26-1' })).toBeVisible();
    await students.getByRole('textbox', { name: 'Student name for 26-2' }).fill('Edited student');
    await page.getByRole('button', { name: 'Save changes (1)' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toMatchObject({ id: 's2', studentName: 'Edited student' });
    await page.screenshot({ path: testInfo.outputPath(`academic-${viewport.name}.png`) });
    await page.getByRole('tab', { name: /Teams \/ Projects/ }).click();
    const projects = page.getByRole('table', { name: 'Teams / Projects academic data' });
    await projects.getByRole('button', { name: 'Sort by Team code' }).click();
    await expect(projects.locator('tbody tr').first().getByRole('textbox', { name: 'Team code for TEAM-1' })).toBeVisible();
    await page.getByRole('tab', { name: /Deliverables/ }).click();
    const deliverables = page.getByRole('table', { name: 'Deliverables academic data' });
    await deliverables.getByRole('button', { name: 'Sort by Due date' }).click();
    await expect(deliverables.locator('tbody tr').first().getByLabel('Due date for C1')).toBeVisible();
  });
}
