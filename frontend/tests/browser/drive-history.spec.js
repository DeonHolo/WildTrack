import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

test('checked PDF has one Document Check entry with both tabs and refreshes shared history without exposing identity', async ({ page }) => {
  const fixture = await installApiFixtures(page, { role: 'student', connected: true, submitted: true, checkedPdf: true });
  let ownerAuthorized = false;
  const historyCalls = [];

  await page.route('**/api/drive-history/auth/status', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ configured: true, connected: false })
  }));
  await page.route(url => url.pathname === '/api/drive-history', route => {
    const url = new URL(route.request().url());
    historyCalls.push({
      workspaceId: url.searchParams.get('workspaceId'),
      responseId: url.searchParams.get('responseId'),
      fieldId: url.searchParams.get('fieldId')
    });
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(ownerAuthorized ? {
        status: 'AVAILABLE', sourceLabel: 'Google Drive revision metadata',
        historyMayBeIncomplete: true, nextPageToken: null,
        revisions: [{ id: 'rev-owner-1', modifiedTime: '2026-09-19T06:00:00Z',
          mimeType: 'application/pdf', size: '128', modifiedBy: 'Private Owner',
          modifiedByEmail: 'private-owner@example.test' }],
        fileMetadata: { createdTime: '2026-09-01T06:00:00Z',
          lastModifiedTime: '2026-09-19T06:00:00Z', driveOwner: 'Private Owner',
          lastModifiedBy: 'Private Editor' }
      } : {
        status: 'NOT_CONNECTED', sourceLabel: 'Google Drive revision metadata',
        revisions: [], nextPageToken: null, historyMayBeIncomplete: true,
        coverageMessage: 'No eligible submitter has yet authorized this file.'
      })
    });
  });

  await page.goto('/student');
  await expect(page.getByRole('button', { name: 'Allow Drive history' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('button', { name: 'File history' })).toHaveCount(0);
  await page.getByRole('button', { name: 'View Document Check' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('tab', { name: 'Check result' })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'File history' })).toBeVisible();
  await dialog.getByRole('tab', { name: 'File history' }).click();
  await expect(dialog.getByText('No eligible submitter has yet authorized this file.')).toBeVisible();

  // The owner of the same file connects after this viewer's response was saved.
  ownerAuthorized = true;
  await dialog.getByRole('button', { name: 'Refresh history' }).click();
  await expect(dialog.getByRole('group', { name: 'Drive revision 1 on page 1' })).toBeVisible();
  await expect(dialog).not.toContainText(/Private Owner|Private Editor|private-owner@example\.test/);
  await dialog.getByRole('tab', { name: 'Check result' }).click();
  await expect(dialog.getByText('Created time').locator('..')).not.toContainText('Unavailable');
  expect(historyCalls).toHaveLength(2);
  for (const call of historyCalls) {
    expect(call).toEqual({
      workspaceId: '11111111-1111-1111-1111-111111111111',
      responseId: 'response-1', fieldId: 'field-document-pdf'
    });
  }
  fixture.assertRequestsHandled();
});

test('PDF with Document Check disabled still opens its own history without a misleading check result', async ({ page }) => {
  const fixture = await installApiFixtures(page, { role: 'student', connected: true, submitted: true, documentCheckPolicy: 'OFF' });
  await page.goto('/student');
  await expect(page.getByRole('button', { name: 'View Document Check' })).toHaveCount(0);
  await page.getByRole('button', { name: 'File history' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('File history', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Check result' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Refresh history' })).toBeVisible();
  fixture.assertRequestsHandled();
});
