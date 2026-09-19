import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

const viewports = [
  { label: 'desktop', width: 1280, height: 800 },
  { label: 'mobile', width: 390, height: 844 }
];

for (const viewport of viewports) {
  test(`academic data grid edits and pastes on ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    page.apiFixture = await installApiFixtures(page, { role: 'admin', connected: true });

    let snapshot = academicSnapshot();
    const writes = [];
    await page.route('**/api/academic-data**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'GET' && url.pathname === '/api/academic-data') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot) });
      }
      const kind = url.pathname.split('/').at(-1);
      if (request.method() === 'PUT' && ['students', 'projects', 'deliverables'].includes(kind)) {
        const rows = request.postDataJSON().rows || [];
        writes.push({ kind, rows });
        if (kind === 'students') {
          snapshot = {
            ...snapshot,
            students: applyStudentRows(snapshot.students, rows)
          };
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
      }
      return route.fallback();
    });

    await page.goto('/workspace');
    await page.getByRole('button', { name: 'Open grids' }).click();
    const table = page.getByRole('table', { name: 'Students academic data' });
    await expect(table).toBeVisible();

    const gridMetrics = await page.locator('.wt-academic-grid-scroll').evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    }));
    expect(gridMetrics.scrollWidth).toBeGreaterThan(gridMetrics.clientWidth);
    expect(gridMetrics.pageOverflow).toBe(false);

    const name = table.getByRole('textbox', { name: 'Student name for 26-0001' });
    await name.fill('DOE, JANE BROWSER');
    await page.getByRole('button', { name: 'Save changes (1)' }).click();
    await expect(page.getByText('1 row saved to WildTrack.')).toBeVisible();
    expect(writes.at(-1)).toMatchObject({ kind: 'students' });
    expect(writes.at(-1).rows[0]).toMatchObject({
      id: 'student-1',
      studentName: 'DOE, JANE BROWSER',
      expectedUpdatedAt: '2026-09-19T08:00:00'
    });

    await page.getByRole('button', { name: 'Paste rows' }).click();
    const paste = page.getByRole('dialog', { name: 'Paste students rows' });
    await paste.getByRole('textbox', { name: 'Pasted spreadsheet rows' }).fill(
      'Team code\tStudent Number\tStudent name\nTEAM-02\t26-0002\tNEW, STUDENT'
    );
    await expect(paste.locator('.wt-paste-preview').getByText('26-0002', { exact: true })).toBeVisible();
    await paste.getByRole('button', { name: 'Apply to grid' }).click();
    await expect(table.getByRole('textbox', { name: 'Student name for 26-0002' })).toHaveValue('NEW, STUDENT');
    await page.getByRole('button', { name: 'Save changes (1)' }).click();
    await expect.poll(() => writes.filter((item) => item.kind === 'students').length).toBe(2);

    await page.reload();
    await page.getByRole('button', { name: 'Open grids' }).click();
    const reloaded = page.getByRole('table', { name: 'Students academic data' });
    await expect(reloaded.getByRole('textbox', { name: 'Student name for 26-0001' })).toHaveValue('DOE, JANE BROWSER');
    await expect(reloaded.getByRole('textbox', { name: 'Student name for 26-0002' })).toHaveValue('NEW, STUDENT');
  });
}

test.afterEach(async ({ page }) => {
  page.apiFixture?.assertRequestsHandled();
});

function academicSnapshot() {
  return {
    students: [{
      id: 'student-1',
      studentNumber: '26-0001',
      studentName: 'DOE, JANE',
      teamCode: 'TEAM-01',
      teamFormationCode: 'SOURCE-01',
      memberNumber: '1',
      sectionName: 'G7',
      adviserName: 'Sir Ralph',
      institutionalEmail: 'jane@cit.edu',
      sourceRowNumber: 12,
      updatedAt: '2026-09-19T08:00:00'
    }],
    projects: [],
    trackerColumns: [
      { id: 'column-srs', columnKey: 'Refactored SRS', label: 'Refactored SRS', active: true, pdfRequired: true },
      { id: 'column-sdd', columnKey: 'Refactored SDD', label: 'Refactored SDD', active: true, pdfRequired: true }
    ],
    deliverables: [{
      id: 'deliverable-srs',
      trackerColumnKey: 'Refactored SRS',
      title: 'Refactored SRS Submission',
      slug: 'refactored-srs',
      dueAt: '2026-09-19T23:59:00',
      status: 'UNPUBLISHED',
      updatedAt: '2026-09-19T08:00:00'
    }]
  };
}

function applyStudentRows(current, rows) {
  const next = current.map((row) => ({ ...row }));
  for (const row of rows) {
    const index = row.id
      ? next.findIndex((item) => item.id === row.id)
      : next.findIndex((item) => item.studentNumber === row.studentNumber);
    const saved = {
      ...row,
      id: row.id || `student-${row.studentNumber}`,
      teamFormationCode: index >= 0 ? next[index].teamFormationCode : null,
      sourceRowNumber: index >= 0 ? next[index].sourceRowNumber : null,
      updatedAt: '2026-09-19T08:05:00'
    };
    if (index >= 0) next[index] = { ...next[index], ...saved };
    else next.push(saved);
  }
  return next;
}
