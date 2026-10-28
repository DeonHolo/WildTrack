import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

const workspaceId = '11111111-1111-1111-1111-111111111111';
const shareToken = 'a'.repeat(64);
const formPath = '/s/' + shareToken;
const studentNumber = '22-1001-001';
const studentName = 'DELA CRUZ, JUAN CARLOS M.';

for (const viewport of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`direct entry connects only a complete matching identity on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const fixture = await installApiFixtures(page, { role: 'student', connected: false });
    await page.goto('/student?studentNumber=' + studentNumber);
    await expect(page.getByRole('heading', { name: 'Connect your student account' })).toBeVisible();
    await expect(page.getByText('Keep your capstone on track')).toBeVisible();
    const mascot = page.getByRole('img', { name: 'WildTrack mascot welcoming students' });
    await expect(mascot).toBeVisible();
    await expect(page.getByRole('combobox')).toHaveCount(0);
    const number = page.getByRole('textbox', { name: 'Student Number' });
    const name = page.getByRole('textbox', { name: 'Student Name' });
    const team = page.getByRole('textbox', { name: 'Team Code' });
    for (const field of [number, name, team]) {
      await expect(field).toHaveValue(''); await expect(field).toHaveAttribute('autocomplete', 'off');
    }
    await page.screenshot({ path: `test-results/direct-student-entry-${viewport.name}.png`, fullPage: true });
    const bounds = await mascot.boundingBox();
    const banner = await page.getByRole('region', { name: 'Student entry banner' }).boundingBox();
    expect(bounds.y).toBeGreaterThanOrEqual(banner.y);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(banner.y + banner.height);
    await number.fill(studentNumber); await name.fill(studentName); await team.fill('Wrong Team');
    await page.getByRole('button', { name: 'Connect account' }).click();
    await expect(page.getByRole('alert')).toContainText('Student details do not match an active class record.');
    expect(fixture.association()).toBeNull();
    await expect(team).toHaveValue('Wrong Team');
    await team.fill('2526-sem2-it332-11');
    await page.getByRole('button', { name: 'Connect account' }).click();
    await expect(page.getByRole('img', { name: 'WildTrack mascot waving' })).toBeVisible();
    expect(fixture.association()).toMatchObject({ studentNumber, studentName });
    expect(fixture.calls.filter(call => call.path === '/workspace/responses/submit')).toHaveLength(0);
    expect(fixture.calls.filter(call => call.path === '/workspace/students/options')).toHaveLength(0);
    expect(fixture.calls.filter(call => call.path === '/auth/google/session')).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    fixture.assertRequestsHandled();
  });
  test(`unlinked account enters through a published form on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const fixture = await installApiFixtures(page, { role: 'student', connected: false });
    const catalog = page.waitForResponse(response => new URL(response.url()).pathname === '/api/workspaces');
    await page.goto('/student');
    expect(await (await catalog).json()).toEqual([]);
    await expect(page.getByRole('heading', { name: 'Connect your student account' })).toBeVisible();
    await expect(page.getByText('Enter your details as they appear in your class record.')).toBeVisible();
    await expect(page.getByText('IT Capstone', { exact: true })).toHaveCount(0);

    await page.screenshot({ path: `test-results/unlinked-dashboard-${viewport.name}.png`, fullPage: true });
    await page.goto(`${formPath}?student=${studentNumber}`);
    await expect(page.getByRole('textbox', { name: 'Student Number' })).toBeVisible();
    await page.getByRole('link', { name: 'Student dashboard', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Connect your student account' })).toBeVisible();
    await page.getByRole('link', { name: 'Return to deliverable' }).click();
    const number = page.getByRole('textbox', { name: 'Student Number' });
    const name = page.getByRole('textbox', { name: 'Student Name' });
    await expect(number).toHaveValue('');
    await expect(name).toHaveValue('');
    await number.fill(studentNumber);
    await expect(name).toHaveValue('');
    await name.fill('Wrong Name');
    await page.getByRole('button', { name: 'Verify student details' }).click();
    await expect(page.getByRole('alert')).toContainText('Student Number and name do not match');
    expect(fixture.association()).toBeNull();
    await expect(page.getByRole('button', { name: 'Submit response' })).toBeDisabled();

    await name.fill(studentName);
    await page.screenshot({ path: `test-results/contextual-student-entry-${viewport.name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Verify student details' }).click();
    await expect(page.getByRole('combobox', { name: 'Student Number' })).toHaveValue(studentNumber);
    await expect(page.getByRole('combobox', { name: 'Team Code' })).toHaveValue('2526-sem2-it332-11');
    expect(fixture.association()).toBeNull();
    expect(fixture.calls.filter(call => call.path === '/workspace/responses/submit')).toHaveLength(0);
    expect(fixture.calls.filter(call => call.path === '/workspace/students/options')).toHaveLength(0);
    const previews = fixture.calls.filter(call => call.path === '/workspace/students/associate');
    expect(previews).toHaveLength(2);
    expect(previews[1]).toMatchObject({ method: 'POST', workspaceId, body: {
      studentNumber, studentName, deliverableId: 'deliverable-srs', shareToken
    } });

    await page.getByLabel('PDF Drive Link').fill('https://drive.google.com/file/d/contextual-browser-pdf/view');
    await page.getByRole('button', { name: 'Submit response' }).click();
    await expect(page.getByRole('heading', { name: 'Response received' })).toBeVisible();
    expect(fixture.calls.filter(call => call.path === '/auth/google/session')).toHaveLength(0);
    expect(fixture.association()).toMatchObject({ studentNumber, studentName });
    expect(fixture.calls.filter(call => call.path === '/workspace/responses/submit')).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

    await page.goto('/student');
    await expect(page.getByRole('img', { name: 'WildTrack mascot waving' })).toBeVisible();
    fixture.assertRequestsHandled();
  });
}

test('a linked student can open the published form without another claim', async ({ page }) => {
  const fixture = await installApiFixtures(page, { role: 'student', connected: true, submitted: true });
  await page.goto('/w/it-it332-2025-26-semester-2/submit/week-9-srs');
  await expect(page.getByRole('combobox', { name: 'Student Number' })).toHaveValue(studentNumber);
  await expect(page.getByRole('button', { name: 'Save response changes' })).toBeVisible();
  expect(fixture.calls.filter(call => call.path === '/workspace/students/associate')).toHaveLength(0);
  expect(fixture.calls.filter(call => call.path === '/workspace/students/options')).toHaveLength(0);
  fixture.assertRequestsHandled();
});

test('an unlinked account cannot open a readable guessed form address', async ({ page }) => {
  const fixture = await installApiFixtures(page, { role: 'student', connected: false });
  await page.goto('/w/it-it332-2025-26-semester-2/submit/week-9-srs');
  await expect(page.getByRole('heading', { name: 'Submission form not found' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Student Number' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'PDF Drive Link' })).toHaveCount(0);
  expect(fixture.calls.filter(call => call.path === '/workspace/students/options')).toHaveLength(0);
  fixture.assertRequestsHandled();
});

test('invalid shared links show a useful state without exposing form details', async ({ page }) => {
  const fixture = await installApiFixtures(page, { role: 'student', connected: false });
  await page.goto('/s/' + '0'.repeat(64));
  await expect(page.getByRole('heading', { name: 'Submission form not found' })).toBeVisible();
  await expect(page.getByText(/Ask your instructor for the current deliverable link/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Student Number' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Student dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connect your student account' })).toBeVisible();
  fixture.assertRequestsHandled();
});

test('sign-in from a shared form preserves that link', async ({ page }) => {
  const fixture = await installApiFixtures(page, { role: 'anonymous' });
  await page.goto(formPath);
  await expect(page.getByRole('heading', { name: 'Software Requirements Specification' })).toBeVisible();
  const signIn = page.getByRole('link', { name: 'Continue with Google' });
  expect(new URL(await signIn.getAttribute('href'), 'https://wildtrack.invalid').searchParams.get('returnTo')).toBe(formPath);
  await expect(page.getByRole('textbox', { name: 'Student Number' })).toHaveCount(0);
  fixture.assertRequestsHandled();
});

test('an already claimed record stays blocked for a different Google account', async ({ page }) => {
  const fixture = await installApiFixtures(page, { role: 'student', connected: false });
  let attempts = 0;
  await page.route('**/api/workspace/responses/submit**', route => {
    attempts++;
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'This Student Number is already associated with another Google account. Ask an administrator to review the account binding.' }) });
  });
  await page.goto(formPath);
  await page.getByRole('textbox', { name: 'Student Number' }).fill(studentNumber);
  await page.getByRole('textbox', { name: 'Student Name' }).fill(studentName);
  await page.getByRole('button', { name: 'Verify student details' }).click();
  await expect(page.getByRole('combobox', { name: 'Student Number' })).toHaveValue(studentNumber);
  await page.getByLabel('PDF Drive Link').fill('https://drive.google.com/file/d/contextual-browser-pdf/view');
  await page.getByRole('button', { name: 'Submit response' }).click();
  await expect(page.getByRole('alert')).toContainText('already associated with another Google account');
  await expect(page.getByLabel('PDF Drive Link')).toHaveValue('https://drive.google.com/file/d/contextual-browser-pdf/view');
  await expect(page.getByRole('heading', { name: 'Response received' })).toHaveCount(0);
  expect(fixture.association()).toBeNull();
  expect(attempts).toBe(1);
  fixture.assertRequestsHandled();
});
