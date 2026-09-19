import { expect, test } from '@playwright/test';

const workspace = process.env.JOURNEY_WORKSPACE;
const form = process.env.JOURNEY_FORM;
const workspaceName = process.env.JOURNEY_WORKSPACE_NAME || 'Form editor persistence';
const formPath = `/w/${workspace}/submit/editor-journey-form`;

async function signIn(context, token) {
  await context.addCookies([{
    name: 'WILDTRACK_SESSION',
    value: token,
    url: 'http://127.0.0.1:4181',
    httpOnly: true,
    sameSite: 'Lax'
  }]);
}

async function clearStorageAndReload(page) {
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
}

async function selectWorkspace(page) {
  const selector = page.getByRole('textbox', { name: 'Academic workspace' });
  await expect(selector).toBeVisible();
  if ((await selector.inputValue()) === workspaceName) return;
  await selector.click();
  await page.getByRole('listbox').getByRole('option', { name: workspaceName }).click();
}

test('full-page form editor persists through the real backend and public response path', async ({ browser }) => {
  expect(workspace, 'Run through FormEditorPersistenceJourneyIT, which starts the real backend').toBeTruthy();
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await signIn(adminContext, process.env.JOURNEY_ADMIN_SESSION);
    const admin = await adminContext.newPage();
    await admin.goto(`http://127.0.0.1:4181/forms/${form}/edit`);
    await selectWorkspace(admin);

    await expect(admin.getByRole('heading', { name: 'Edit form' })).toBeVisible();
    await expect(admin.getByRole('textbox', { name: 'Form title' })).toHaveValue('Editor Journey Form');
    await expect(admin.getByText('Unpublished', { exact: true })).toBeVisible();

    await admin.getByRole('button', { name: 'Add question' }).click();
    await admin.locator('.wt-question-card.is-selected').getByRole('textbox', { name: 'Field label' }).fill('Round-trip note');
    await admin.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(admin.getByRole('status')).toContainText('Saved');

    await clearStorageAndReload(admin);
    await selectWorkspace(admin);
    await expect.poll(() => admin.getByRole('textbox', { name: 'Field label' })
      .evaluateAll((inputs) => inputs.map((input) => input.value))).toContain('Round-trip note');
    await expect(admin.getByText('Unpublished', { exact: true })).toBeVisible();

    await admin.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(admin.getByText('Published', { exact: true })).toBeVisible();
    await clearStorageAndReload(admin);
    await selectWorkspace(admin);
    await expect(admin.getByText('Published', { exact: true })).toBeVisible();
    await expect.poll(() => admin.getByRole('textbox', { name: 'Field label' })
      .evaluateAll((inputs) => inputs.map((input) => input.value))).toContain('Round-trip note');

    await signIn(studentContext, process.env.JOURNEY_STUDENT_SESSION);
    const student = await studentContext.newPage();
    await student.goto(`http://127.0.0.1:4181${formPath}`);
    await expect(student.getByRole('heading', { level: 1, name: 'Editor Journey Form' })).toBeVisible();
    await student.getByRole('textbox', { name: 'Student Number', exact: true }).click();
    await student.getByRole('option').filter({ hasText: '25-9999-010' }).click();
    await student.getByRole('textbox', { name: 'Submission Link', exact: true }).fill('https://example.test/editor-journey');
    await student.getByRole('textbox', { name: 'Round-trip note' }).fill('Persisted through the real backend');
    await student.getByRole('button', { name: 'Submit response' }).click();
    await expect(student.getByRole('heading', { name: 'Response received' })).toBeVisible();

    const mine = await studentContext.request.get(
      `http://127.0.0.1:4181/api/workspace/responses/mine?workspaceId=${workspace}&deliverableId=${form}`
    );
    expect(mine.ok()).toBe(true);
    const response = await mine.json();
    const values = JSON.parse(response.valuesJson);
    expect(values.primaryLink).toBe('https://example.test/editor-journey');
    expect(Object.values(values)).toContain('Persisted through the real backend');
  } finally {
    await adminContext.close();
    await studentContext.close();
  }
});
