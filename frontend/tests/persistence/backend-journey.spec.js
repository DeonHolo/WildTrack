import { expect, test } from '@playwright/test';

const workspace = process.env.JOURNEY_WORKSPACE;
const form = process.env.JOURNEY_FORM;
const formPath = `/w/${workspace}/submit/journey-form`;

async function signIn(context, token) {
  await context.addCookies([{ name: 'WILDTRACK_SESSION', value: token, url: 'http://127.0.0.1:4181', httpOnly: true, sameSite: 'Lax' }]);
}

async function clearStorageAndReload(page) {
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
}

async function selectStaffWorkspace(page) {
  await page.getByRole('textbox', { name: 'Academic workspace' }).click();
  await page.getByRole('listbox').getByRole('option', { name: /Browser persistence/ }).click();
}

test('student draft/submission and staff acceptance/archive survive clean-storage reload against the real backend', async ({ browser }) => {
  expect(workspace, 'Run through BrowserPersistenceJourneyIT, which starts the real backend').toBeTruthy();
  const studentContext = await browser.newContext();
  const staffContext = await browser.newContext();
  try {
    await signIn(studentContext, process.env.JOURNEY_STUDENT_SESSION);
    const student = await studentContext.newPage();
    await student.goto(`http://127.0.0.1:4181${formPath}`);
    await expect(student.getByRole('heading', { level: 1 })).toHaveText('Journey Deliverable');
    await student.getByLabel('Student Number').click();
    await student.getByRole('option').filter({ hasText: '25-9999-009' }).click();
    await student.getByRole('textbox', { name: 'Submission Link', exact: true }).fill('https://example.test/first-version');
    await expect(student.getByText('Draft saved', { exact: true })).toBeVisible();
    const draft = await studentContext.request.get(`http://127.0.0.1:4181/api/workspace/drafts?workspaceId=${workspace}&deliverableId=${form}`);
    expect(await draft.json(), 'Saved draft is readable from the real server').toMatchObject({ present: true, values: { primaryLink: 'https://example.test/first-version' } });
    await clearStorageAndReload(student);
    await expect(student.getByRole('textbox', { name: 'Submission Link', exact: true }), 'Draft restored after reload').toHaveValue('https://example.test/first-version');
    await student.getByLabel('Student Number').click();
    await student.getByRole('option').filter({ hasText: '25-9999-009' }).click();
    await student.getByRole('button', { name: 'Submit response' }).click();
    await expect(student.getByRole('heading', { name: 'Response received' })).toBeVisible();
    await clearStorageAndReload(student);
    await expect(student.getByRole('textbox', { name: 'Submission Link', exact: true })).toHaveValue('https://example.test/first-version');
    const mine = await studentContext.request.get(`http://127.0.0.1:4181/api/workspace/responses/mine?workspaceId=${workspace}&deliverableId=${form}`);
    expect(mine.ok()).toBe(true);
    const response = await mine.json();
    expect(response.responseId).toBeTruthy();

    await signIn(staffContext, process.env.JOURNEY_ADMIN_SESSION);
    const staff = await staffContext.newPage();
    const reviewPath = `http://127.0.0.1:4181/review?response=${response.responseId}`;
    await staff.goto('http://127.0.0.1:4181/adviser');
    await selectStaffWorkspace(staff);
    await staff.getByRole('textbox', { name: 'Feedback for student' }).fill('Please explain your design choices.');
    await staff.getByRole('button', { name: 'Save feedback', exact: true }).click();
    await expect(staff.getByRole('button', { name: 'Update feedback', exact: true })).toBeDisabled();
    await clearStorageAndReload(staff);
    await selectStaffWorkspace(staff);
    await expect(staff.getByRole('textbox', { name: 'Feedback for student' })).toHaveValue('Please explain your design choices.');
    await staff.goto(reviewPath);
    await expect(staff.getByRole('button', { name: 'Accept response', exact: true })).toBeVisible();
    await staff.getByRole('button', { name: 'Accept response', exact: true }).click();
    await expect(staff.getByRole('button', { name: 'Revoke acceptance', exact: true })).toBeEnabled();
    await clearStorageAndReload(staff);
    await selectStaffWorkspace(staff);
    await expect(staff.getByRole('button', { name: 'Revoke acceptance', exact: true })).toBeEnabled();
    await staff.getByRole('button', { name: 'Archive response', exact: true }).click();
    await staff.getByRole('dialog', { name: 'Archive this accepted response?' }).getByRole('button', { name: 'Archive response', exact: true }).click();
    await expect(staff.getByRole('dialog', { name: 'Review Journey Student' }).getByRole('button', { name: 'Archived', exact: true })).toBeDisabled();
    await clearStorageAndReload(staff);
    await selectStaffWorkspace(staff);
    await expect(staff.getByRole('dialog', { name: 'Review Journey Student' }).getByRole('button', { name: 'Archived', exact: true })).toBeDisabled();
    await expect(staff.getByRole('button', { name: 'Revoke acceptance', exact: true })).toBeDisabled();
  } finally {
    await studentContext.close();
    await staffContext.close();
  }
});

test('tracker configuration and staff records survive clean-storage reload', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    await signIn(context, process.env.JOURNEY_ADMIN_SESSION);
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4181/workspace');
    await selectStaffWorkspace(page);
    await page.getByRole('button', { name: /Deliverable columns/ }).click();
    await page.getByRole('textbox', { name: 'New Tracker column' }).fill('Journey milestone');
    await page.getByRole('button', { name: 'Add column', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Journey milestone display name' })).toHaveValue('Journey milestone');
    await page.getByRole('button', { name: /Add staff/ }).click();
    await page.getByRole('textbox', { name: 'Google Email', exact: true }).fill('journey-adviser@example.test');
    await page.getByRole('button', { name: 'Save staff member', exact: true }).click();
    await expect(page.getByText('journey-adviser@example.test', { exact: true })).toBeVisible();
    await clearStorageAndReload(page);
    await selectStaffWorkspace(page);
    await expect(page.getByText('journey-adviser@example.test', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Deliverable columns/ }).click();
    await expect(page.getByRole('textbox', { name: 'Journey milestone display name' })).toHaveValue('Journey milestone');
    await page.goto('http://127.0.0.1:4181/tracker');
    await expect(page.getByRole('columnheader', { name: /Journey milestone/ })).toBeVisible();
    await clearStorageAndReload(page);
    await selectStaffWorkspace(page);
    await expect(page.getByRole('columnheader', { name: /Journey milestone/ })).toBeVisible();
  } finally { await context.close(); }
});
