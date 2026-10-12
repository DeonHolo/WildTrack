import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

function trackGoogleHistoryRequests(page) {
  const requests = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/drive-history')) requests.push(request.url());
  });
  return requests;
}

test('checked PDF keeps both Document Check tabs without delegated history or consent UI', async ({ page }) => {
  const fixture = await installApiFixtures(page, { role: 'student', connected: true, submitted: true, checkedPdf: true });
  const googleHistoryRequests = trackGoogleHistoryRequests(page);
  await page.goto('/student');
  await expect(page.getByRole('button', { name: 'Allow Drive history' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'File history' })).toHaveCount(0);
  await page.getByRole('button', { name: 'View Document Check' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('tab', { name: 'Check result' })).toBeVisible();
  await expect(dialog.getByText(/Your PDF is accessible and readable\./)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Google Drive history access' })).toHaveCount(0);
  await dialog.getByRole('tab', { name: 'File history' }).click();
  await expect(dialog.getByText('No recorded checks yet. A completed Document Check records the file state here.')).toBeVisible();
  await expect(dialog.getByText('Google Drive edits', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/Drive history connection needs setup|Drive edit history unavailable/)).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /Connect Drive|Refresh history/ })).toHaveCount(0);
  await expect(dialog.getByText('Technical record details')).toHaveCount(0);
  await dialog.getByRole('tab', { name: 'Check result' }).click();
  await expect(dialog.getByText(/Your PDF is accessible and readable\./)).toBeVisible();
  await expect(dialog.getByText('Drive owner', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Last modified by', { exact: true })).toHaveCount(0);
  expect(googleHistoryRequests).toEqual([]);
  fixture.assertRequestsHandled();
});

test('PDF with Document Check disabled opens recorded history without requiring Google permission', async ({ page }) => {
  const fixture = await installApiFixtures(page, { role: 'student', connected: true, submitted: true, documentCheckPolicy: 'OFF' });
  const googleHistoryRequests = trackGoogleHistoryRequests(page);
  await page.goto('/student');
  await expect(page.getByRole('button', { name: 'View Document Check' })).toHaveCount(0);
  await page.getByRole('button', { name: 'File history' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('File history', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Check result' })).toHaveCount(0);
  await expect(dialog.getByText('No recorded checks yet. A completed Document Check records the file state here.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Connect Drive|Refresh history/ })).toHaveCount(0);
  await expect(dialog.getByText(/Google Drive edits|connection needs setup|authorize|permission/i)).toHaveCount(0);
  expect(googleHistoryRequests).toEqual([]);
  fixture.assertRequestsHandled();
});
