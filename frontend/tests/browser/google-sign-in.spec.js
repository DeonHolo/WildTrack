import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

for (const { role, path } of [
  { role: 'student', path: '/student' },
  { role: 'admin', path: '/forms' },
  { role: 'adviser', path: '/adviser' }
]) {
  test(`${role} header keeps account and logout without Drive-history controls or requests`, async ({ page }) => {
    const fixture = await installApiFixtures(page, { role, connected: true, submitted: true });
    await page.goto(path);
    await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /Drive history|Disconnect Drive|Connect Drive|Manage Google Drive/i })).toHaveCount(0);
    await expect(page.getByText(/Read-only Google Drive metadata is connected|Drive history connection needs setup/i)).toHaveCount(0);
    expect(fixture.calls.filter(call => call.path.startsWith('/drive-history'))).toEqual([]);
    fixture.assertRequestsHandled();
  });
}

test('ordinary Google credential creates the session and opens the student workspace without Drive permission', async ({ page, context }) => {
  const fixture = await installApiFixtures(page, { role: 'anonymous', connected: true });
  let authenticated = false;
  const credentialPosts = [];
  await context.route('https://accounts.google.com/**', route => route.abort());
  await page.addInitScript(() => {
    let callback;
    window.google = { accounts: { id: {
      initialize: options => { callback = options.callback; },
      renderButton: element => {
        const button = document.createElement('button');
        button.textContent = 'Continue with Google';
        button.onclick = () => callback({ credential: 'browser-test-google-credential' });
        element.appendChild(button);
      },
      prompt: () => {}, disableAutoSelect: () => {}
    } } };
    document.cookie = 'XSRF-TOKEN=browser-test-csrf; path=/';
  });
  await page.route('**/api/auth/session', route => route.fulfill({ json: authenticated ? {
    authenticated: true, email: 'student.browser-test@gmail.com', name: 'Browser Test Student',
    googleSubject: 'browser-test-google-subject', roles: []
  } : { authenticated: false, roles: [] } }));
  await page.route('**/api/auth/google/session', async route => {
    const request = route.request();
    credentialPosts.push({ method: request.method(), body: request.postDataJSON() });
    authenticated = true;
    return route.fulfill({ json: { subject: 'browser-test-google-subject', email: 'student.browser-test@gmail.com' } });
  });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(credentialPosts).toEqual([{ method: 'POST', body: { credential: 'browser-test-google-credential' } }]);
  expect(fixture.calls.filter(call => call.path.startsWith('/drive-history'))).toEqual([]);
  await expect(page.getByText(/Allow file history from Google Drive|Allow Drive history|Disconnect Drive history/)).toHaveCount(0);
  fixture.assertRequestsHandled();
});
