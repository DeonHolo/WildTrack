import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
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

    // Academic Data now lives in the Admin sidebar as its own page.
    await page.goto('/workspace');
    if (viewport.label === 'mobile') {
      await page.getByRole('button', { name: 'Toggle navigation' }).click();
    }
    await page.getByRole('navigation', { name: 'Staff navigation' })
      .getByRole('link', { name: 'Academic data' }).click();
    await expect(page).toHaveURL(/\/academic-data$/);
    await expect(page.getByRole('heading', { name: 'Academic data', level: 1 })).toBeVisible();
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
    await expect(page.getByRole('heading', { name: 'Academic data', level: 1 })).toBeVisible();
    const reloaded = page.getByRole('table', { name: 'Students academic data' });
    await expect(reloaded.getByRole('textbox', { name: 'Student name for 26-0001' })).toHaveValue('DOE, JANE BROWSER');
    await expect(reloaded.getByRole('textbox', { name: 'Student name for 26-0002' })).toHaveValue('NEW, STUDENT');
  });

  test(`academic data preserves per-tab edits, supports row deletion and exports full datasets on ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    page.apiFixture = await installApiFixtures(page, { role: 'admin', connected: true });
    let snapshot = academicSnapshot();
    snapshot.students.push({
      ...snapshot.students[0], id: 'student-2', studentNumber: '26-0002',
      studentName: 'SMITH, ALEX', sourceRowNumber: 13
    });
    snapshot.projects = [{
      id: 'project-1', groupCode: 'TEAM-01', projectTitle: 'WildTrack',
      softwareName: 'WildTrack', adviserName: 'Sir Ralph', projectStatus: 'Active',
      category: 'Capstone', description: '', proposalRemarks: '', demoComments: '',
      sourceRowNumber: 8, updatedAt: '2026-09-19T08:00:00'
    }];
    const deletes = [];
    const writes = [];
    await page.route('**/api/academic-data**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'GET' && url.pathname === '/api/academic-data') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot) });
      }
      const segments = url.pathname.split('/');
      const kind = segments[3];
      if (request.method() === 'PUT' && ['students', 'projects', 'deliverables'].includes(kind) && segments.length === 4) {
        const rows = request.postDataJSON().rows || [];
        writes.push({ kind, rows });
        if (kind === 'students') snapshot = { ...snapshot, students: applyStudentRows(snapshot.students, rows) };
        if (kind === 'projects') snapshot = { ...snapshot, projects: applyProjectRows(snapshot.projects, rows) };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
      }
      if (request.method() === 'DELETE' && ['students', 'projects', 'deliverables'].includes(kind) && segments.length === 5) {
        const rowId = decodeURIComponent(segments[4]);
        const current = snapshot[kind].find((row) => row.id === rowId);
        expect(current).toBeDefined();
        expect(request.postDataJSON()).toEqual({ expectedUpdatedAt: current.updatedAt });
        deletes.push({ kind, rowId });
        snapshot = { ...snapshot, [kind]: snapshot[kind].filter((row) => row.id !== rowId) };
        return route.fulfill({ status: 204 });
      }
      return route.fallback();
    });

    await page.goto('/academic-data');
    const students = page.getByRole('table', { name: 'Students academic data' });
    await expect(students.getByRole('textbox', { name: 'Student name for 26-0001' })).toHaveValue('DOE, JANE');
    await students.getByRole('textbox', { name: 'Student name for 26-0001' }).fill('UNSAVED STUDENT');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(students.getByRole('textbox', { name: 'Student name for 26-0001' })).toHaveValue('DOE, JANE');
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(students.getByRole('textbox', { name: 'Student name for 26-0001' })).toHaveValue('UNSAVED STUDENT');

    await page.getByRole('tab', { name: /Teams \/ Projects/ }).click();
    const projects = page.getByRole('table', { name: 'Teams / Projects academic data' });
    await projects.getByRole('textbox', { name: 'Project title for TEAM-01' }).fill('PENDING PROJECT');
    await page.getByRole('tab', { name: /Students/ }).click();
    await expect(students.getByRole('textbox', { name: 'Student name for 26-0001' })).toHaveValue('UNSAVED STUDENT');
    await page.getByRole('button', { name: 'Save changes (1)' }).click();
    await expect(page.getByText('1 row saved to WildTrack.')).toBeVisible();
    expect(writes.at(-1)).toMatchObject({ kind: 'students', rows: [{ id: 'student-1', studentName: 'UNSAVED STUDENT' }] });
    await page.getByRole('tab', { name: /Teams \/ Projects/ }).click();
    await expect(projects.getByRole('textbox', { name: 'Project title for TEAM-01' })).toHaveValue('PENDING PROJECT');
    await expect(page.getByRole('button', { name: 'Save changes (1)' })).toBeEnabled();

    await page.getByRole('tab', { name: /Students/ }).click();
    await page.getByRole('button', { name: 'Add row' }).click();
    await students.getByRole('textbox', { name: 'Student Number for new row' }).fill('26-0999');
    await students.getByRole('textbox', { name: 'Student name for 26-0999' }).fill('NEW, UNSAVED');
    await students.getByRole('textbox', { name: 'Team code for 26-0999' }).fill('TEAM-99');
    await students.getByRole('button', { name: 'Delete row 26-0999' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete academic data row?' });
    await expect(dialog).toContainText('This row has not been saved.');
    await dialog.getByRole('button', { name: 'Delete row' }).click();
    await expect(students.getByRole('textbox', { name: 'Student Number for 26-0999' })).toHaveCount(0);
    expect(deletes).toHaveLength(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(students.getByRole('textbox', { name: 'Student name for 26-0999' })).toHaveValue('NEW, UNSAVED');
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(students.getByRole('textbox', { name: 'Student Number for 26-0999' })).toHaveCount(0);

    await page.getByRole('textbox', { name: 'Search students' }).fill('26-0001');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(students.getByRole('textbox', { name: 'Student Number for 26-0002' })).toHaveCount(0);
    const csvDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Students CSV' }).click();
    const csv = await csvDownload;
    expect(csv.suggestedFilename()).toMatch(/^wildtrack-students-\d{4}-\d{2}-\d{2}\.csv$/);
    const csvBody = await readFile(await csv.path(), 'utf8');
    expect(csvBody).toContain('26-0001');
    expect(csvBody).toContain('26-0002');
    expect(csvBody).toContain('UNSAVED STUDENT');

    const workbookDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export all XLSX' }).click();
    const workbook = await workbookDownload;
    expect(workbook.suggestedFilename()).toMatch(/^wildtrack-academic-data-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const workbookBytes = await readFile(await workbook.path());
    expect(workbookBytes.readUInt32LE(0)).toBe(0x04034B50);
    const workbookParts = workbookBytes.toString('utf8');
    expect(workbookParts).toContain('name="Students"');
    expect(workbookParts).toContain('name="Teams and Projects"');
    expect(workbookParts).toContain('name="Deliverables"');
    expect(workbookParts).toContain('name="Tracker Columns"');
    expect(workbookParts).toContain('PENDING PROJECT');
    expect(workbookParts).toContain('Saved record with unsaved edits');

    await page.getByRole('button', { name: 'Clear search' }).click();
    await students.getByRole('button', { name: 'Delete row 26-0002' }).click();
    await expect(dialog).toContainText('A committed deletion cannot be undone.');
    await dialog.getByRole('button', { name: 'Delete row' }).click();
    await expect(students.getByRole('textbox', { name: 'Student Number for 26-0002' })).toHaveCount(0);
    expect(deletes).toEqual([{ kind: 'students', rowId: 'student-2' }]);
    await page.reload();
    await expect(page.getByRole('table', { name: 'Students academic data' })
      .getByRole('textbox', { name: 'Student Number for 26-0002' })).toHaveCount(0);
    await page.getByRole('tab', { name: /Teams \/ Projects/ }).click();
    await expect(page.getByRole('textbox', { name: 'Project title for TEAM-01' })).toHaveValue('WildTrack');
    expect(writes.filter((item) => item.kind === 'projects')).toHaveLength(0);
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

function applyProjectRows(current, rows) {
  return current.map((row) => {
    const changed = rows.find((item) => item.id === row.id);
    return changed ? { ...row, ...changed, updatedAt: '2026-09-19T08:05:00' } : row;
  });
}
