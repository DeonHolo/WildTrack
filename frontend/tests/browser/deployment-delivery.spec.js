import { expect, test } from '@playwright/test';

const supportedRoutes = [
  '/',
  '/forms',
  '/tracker',
  '/review',
  '/adviser',
  '/archive',
  '/workspace',
  '/student',
  '/register',
  '/login',
  '/submit/sample-form',
  '/w/sample-workspace/submit/sample-form'
];

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'narrow', width: 390, height: 844 }
]) {
  test(`production preview serves every direct SPA route at ${viewport.name} size`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const route of supportedRoutes) {
      const response = await page.request.get(route);
      expect(response.status(), route).toBe(200);
      expect(await response.text(), route).toContain('<div id="root"></div>');
    }
  });
}

test('local production proxy preserves authenticated request and response semantics', async ({ page, baseURL }) => {
  await page.goto('/');

  await page.context().addCookies([
    { name: 'XSRF-TOKEN', value: 'browser-csrf', url: baseURL }
  ]);

  const result = await page.evaluate(async () => {
    const response = await fetch('/api/proxy-echo?source=browser', {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'text/plain',
        'X-XSRF-TOKEN': 'browser-csrf',
        'X-WildTrack-Request': 'preserve-me'
      },
      body: 'proxy-body'
    });
    return {
      status: response.status,
      marker: response.headers.get('x-wildtrack-proxy'),
      payload: await response.json()
    };
  });

  expect(result).toEqual({
    status: 207,
    marker: 'preserved',
    payload: {
      method: 'PATCH',
      url: '/api/proxy-echo?source=browser',
      cookie: expect.stringContaining('XSRF-TOKEN=browser-csrf'),
      csrf: 'browser-csrf',
      requestMarker: 'preserve-me',
      body: 'proxy-body'
    }
  });

  const cookies = await page.context().cookies(baseURL);
  expect(cookies).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'proxy-session', value: 'accepted', httpOnly: true })
  ]));
});
