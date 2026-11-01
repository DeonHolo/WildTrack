import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

for (const width of [1440, 1280, 390]) {
  test(`academic toolbar and source sorting at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 });
    await installApiFixtures(page, { role: 'admin', connected: true });
    const students = [10, 2].map((n) => ({ id: `s${n}`, studentNumber: `26-${n}`, studentName: `Student ${n}`, teamCode: 'TEAM-1', memberNumber: `${n}`, sourceRowNumber: n, updatedAt: '2026-10-01T00:00:00' }));
    const snapshot = { students, projects: [], trackerColumns: [], deliverables: [] };
    let writes = [];
    await page.route('**/api/academic-data**', async (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: snapshot });
      if (route.request().method() === 'PUT') { writes = route.request().postDataJSON().rows; return route.fulfill({ json: writes }); }
      return route.fallback();
    });
    await page.goto('/academic-data');
    const toolbar = page.locator('.wt-academic-actions');
    const table = page.getByRole('table', { name: 'Students academic data' });
    await expect(table).toBeVisible();
    if (width > 390) {
      const boxes = await toolbar.locator('input, button').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
      expect(Math.max(...boxes) - Math.min(...boxes)).toBeLessThan(3);
    }
    await expect(toolbar.getByRole('button', { name: 'Search', exact: true })).toHaveCount(0);
    const search = toolbar.getByRole('textbox', { name: 'Search students' });
    await search.fill('Student 10');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table.getByRole('textbox', { name: 'Student name for 26-10' })).toBeVisible();
    await toolbar.getByRole('button', { name: 'Clear search' }).click();
    await expect(table.locator('tbody tr')).toHaveCount(2);
    for (const name of ['Reload', 'Undo', 'Redo']) await expect(toolbar.getByRole('button', { name })).toBeVisible();
    await toolbar.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Export Students CSV' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Export all XLSX' })).toBeVisible();
    await page.keyboard.press('Escape');
    await toolbar.getByRole('button', { name: 'Add row' }).click();
    await expect(table.locator('tbody tr')).toHaveCount(3);
    const source = table.getByRole('button', { name: 'Sort by Source' });
    await source.click();
    await expect(table.locator('tbody tr').nth(0)).toContainText('Imported row 2');
    await expect(table.locator('tbody tr').nth(1)).toContainText('Imported row 10');
    await expect(table.locator('tbody tr').nth(2)).toContainText('Manual new');
    await source.click();
    await expect(table.locator('tbody tr').nth(0)).toContainText('Imported row 10');
    await expect(table.locator('tbody tr').nth(1)).toContainText('Imported row 2');
    await expect(table.locator('tbody tr').nth(2)).toContainText('Manual new');
    await table.getByRole('textbox', { name: 'Student name for 26-2' }).fill('Edited student 2');
    await expect(table.getByRole('textbox', { name: 'Student name for 26-2' })).toHaveValue('Edited student 2');
    await expect(table.getByRole('textbox', { name: 'Student name for 26-10' })).toHaveValue('Student 10');
    await page.screenshot({ path: testInfo.outputPath(`academic-toolbar-${width}.png`) });
    await table.getByRole('textbox', { name: 'Student Number for new row' }).fill('26-3');
    await table.getByRole('textbox', { name: 'Student name for 26-3' }).fill('Student 3');
    await table.getByRole('textbox', { name: 'Team code for 26-3' }).fill('TEAM-1');
    await toolbar.getByRole('button', { name: 'Save changes (2)' }).click();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes.find((row) => row.id === 's2')).toMatchObject({ studentNumber: '26-2', studentName: 'Edited student 2' });
  });
}
