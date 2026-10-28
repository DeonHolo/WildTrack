import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

const workspaceId = '11111111-1111-1111-1111-111111111111';
const item = (id, state, title) => ({ templateId: id, versionId: `version-${id}`, revision: state === 'UNPREPARED' ? 0 : 2, title, state, pdfState: 'READY' });
for (const width of [390, 1024, 1440]) {
  test(`template preparation uses the shared batch confirmation and progress at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1024 ? 760 : 950 });
    const fixture = await installApiFixtures(page, { role: 'admin' });
    let entries = [item('spmp', 'UNPREPARED', 'Software Project Management Plan template'), item('srs', 'APPROVED', 'Software Requirements Specification template'),
      item('sdd', 'DRAFT', 'Software Design Description template'), item('std', 'FAILED', 'Software Test Documentation template')];
    const writes = [];
    await page.route('**/api/templates/checklists**', async route => {
      const request = route.request();
      expect(new URL(request.url()).searchParams.get('workspaceId')).toBe(workspaceId);
      if (request.method() === 'POST') {
        writes.push(request.postDataJSON());
        entries = entries.map(entry => entry.templateId === 'spmp' ? { ...entry, state: 'QUEUED', revision: 1 } : entry);
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(entries) });
    });
    await page.goto('/workspace');
    await page.getByRole('button',{name:'How deadline PDF monitoring works'}).focus();
    const help=page.getByRole('tooltip');
    await expect(help).toHaveCSS('opacity','1');
    await expect(help).toHaveText(/file changes or lost access/);
    await expect(help).toHaveText(/This does not run AI Review/);
    await page.screenshot({path:testInfo.outputPath(`deadline-monitoring-help-${width}.png`)});
    await page.getByRole('button', { name: 'Prepare AI drafts' }).click();
    const dialog = page.getByRole('dialog', { name: 'Prepare template AI drafts' });
    await expect(dialog.getByText('1 template draft to prepare')).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: entries[1].title })).toBeDisabled();
    await expect(dialog.getByRole('checkbox', { name: entries[2].title })).toBeDisabled();
    await expect(dialog.getByRole('checkbox', { name: entries[3].title })).not.toBeChecked();
    await expect(dialog.getByRole('button', { name: 'Prepare drafts' })).toBeEnabled();
    expect(writes).toEqual([]);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => [...document.fonts].some(font => font.family.includes('Manrope') && font.status === 'loaded'))).toBe(true);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await dialog.getByText(/This prepares Review checklist drafts/).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
    await page.screenshot({ path: testInfo.outputPath(`template-batch-confirm-${width}.png`) });
    await dialog.getByRole('button', { name: 'Prepare drafts' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Preparing template AI drafts')).toBeVisible();
    expect(writes).toEqual([[{ templateId: 'spmp', versionId: 'version-spmp', expectedRevision: 0 }]]);
    await page.getByText('Preparing template AI drafts').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`template-batch-progress-${width}.png`) });
    await page.goto('/tracker');
    entries = entries.map(entry => entry.templateId === 'spmp' ? { ...entry, state: 'DRAFT', revision: 2 } : entry);
    await page.goto('/workspace');
    await expect(page.getByText('2 drafts ready · 1 approved · 0 preparing · 1 needs retry')).toBeVisible();
    await page.getByRole('button', { name: 'Check saved drafts' }).click();
    const saved=page.getByRole('dialog', { name: 'Saved template AI drafts' });
    await expect(saved).toHaveCSS('opacity','1');
    await expect(saved.getByRole('link', { name: 'Open checklist' })).toHaveCount(4);
    await expect(saved.getByRole('checkbox')).toHaveCount(0);
    await expect(saved.getByText('Software Design Description template', { exact:true })).toBeVisible();
    await page.screenshot({path:testInfo.outputPath(`template-saved-drafts-${width}.png`)});
    await saved.getByRole('button',{name:'Rerun saved AI drafts',exact:true}).click();
    const reruns=page.getByRole('dialog',{name:'Rerun template AI drafts'});
    await expect(reruns).toHaveCSS('opacity','1');
    await expect(reruns.getByText('3 template drafts to rerun',{exact:true})).toBeVisible();
    await expect(reruns.getByRole('button',{name:'Rerun AI drafts',exact:true})).toBeDisabled();
    await expect(reruns.getByRole('checkbox',{name:'Replace the selected saved Review checklists'})).not.toBeChecked();
    await page.screenshot({path:testInfo.outputPath(`template-batch-rerun-warning-${width}.png`)});
    expect(writes).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    fixture.assertRequestsHandled();
  });
}
