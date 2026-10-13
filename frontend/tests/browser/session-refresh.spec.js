import { expect, test } from '@playwright/test';
import { installApiFixtures } from './api-fixtures.js';

const SESSION_KEY = 'wildtrack.session-identity';
const SESSION_DELAY_MS = 80;
const OBSERVATION_MS = 1600;

// A real same-origin second tab emulates both historical identity formats.
// It refreshes on remote storage events, then republishes its legacy identity.
async function openLegacyPublisher(context, session, wrapped) {
  const legacy = await context.newPage();
  let requests = 0;
  await legacy.route('**/api/**', async route => {
    expect(new URL(route.request().url()).pathname).toBe('/api/auth/session');
    expect(route.request().method()).toBe('GET');
    requests += 1;
    await new Promise(resolve => setTimeout(resolve, SESSION_DELAY_MS));
    return route.fulfill({ json: session });
  });
  await legacy.route('**/__tests__/legacy-session-publisher', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><title>Legacy session fixture</title></head><body>Legacy session fixture</body></html>'
  }));
  await legacy.goto('/__tests__/legacy-session-publisher');
  await legacy.evaluate(([key, wrapped]) => {
    let active = false;
    window.legacySessionWrites = 0;
    window.legacySessionEvents = 0;
    async function refreshAndPublish() {
      const response = await fetch('/api/auth/session', { credentials: 'include' });
      const current = await response.json();
      if (!active) return;
      const rawIdentity = current.authenticated
        ? JSON.stringify([current.email, current.googleSubject, current.roles]) : '';
      const identity = wrapped ? JSON.stringify([rawIdentity, true, current.authenticated]) : rawIdentity;
      if (localStorage.getItem(key) !== identity) {
        window.legacySessionWrites += 1;
        localStorage.setItem(key, identity);
      }
    }
    function onStorage(event) {
      if (!active || event.key !== key) return;
      window.legacySessionEvents += 1;
      void refreshAndPublish();
    }
    window.addEventListener('storage', onStorage);
    window.startLegacySessionPublisher = () => { active = true; return refreshAndPublish(); };
    window.stopLegacySessionPublisher = () => {
      active = false;
      window.removeEventListener('storage', onStorage);
    };
  }, [SESSION_KEY, wrapped]);
  return { page: legacy, requests: () => requests };
}

async function watchSessionGate(page) {
  await page.evaluate(() => {
    let previouslyLoading = false;
    window.sessionGateLoadingEntries = 0;
    const observe = () => {
      const loading = Array.from(document.querySelectorAll('[role="status"]'))
        .some(element => element.textContent.trim() === 'Loading…');
      if (loading && !previouslyLoading) window.sessionGateLoadingEntries += 1;
      previouslyLoading = loading;
    };
    const observer = new MutationObserver(observe);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.stopSessionGateObserver = () => observer.disconnect();
  });
}

for (const scenario of [
  { name: 'anonymous login with raw legacy identity', role: 'anonymous', path: '/login', authenticated: false, wrapped: false },
  { name: 'anonymous login with wrapped legacy identity', role: 'anonymous', path: '/login', authenticated: false, wrapped: true },
  { name: 'authenticated Forms page with wrapped legacy identity', role: 'admin', path: '/forms', authenticated: true, wrapped: true }
]) {
  test('legacy tab notifications settle without repeated gate flicker on ' + scenario.name, async ({ page, context }, testInfo) => {
    const fixture = await installApiFixtures(page, {
      role: scenario.role, connected: true, submitted: true
    });
    const session = {
      authenticated: scenario.authenticated,
      email: scenario.authenticated ? 'student.browser-test@gmail.com' : null,
      name: scenario.authenticated ? 'Browser Test Student' : null,
      googleSubject: scenario.authenticated ? 'browser-test-google-subject' : null,
      roles: scenario.authenticated ? ['ADMIN'] : []
    };
    let sessionRequests = 0;
    await page.route('**/api/auth/session', async route => {
      expect(route.request().method()).toBe('GET');
      sessionRequests += 1;
      await new Promise(resolve => setTimeout(resolve, SESSION_DELAY_MS));
      return route.fulfill({ json: session });
    });
    // All session/account behavior is synthetic. No Google authorization or
    // identity SDK endpoint is contacted, and no sign-in button is clicked.
    await context.route('https://accounts.google.com/**', route => route.abort());

    await page.goto(scenario.path);
    const content = scenario.authenticated
      ? page.getByRole('button', { name: 'Edit SRS form' })
      : page.getByRole('heading', { level: 1, name: 'Welcome to WildTrack' });
    await expect(content).toBeVisible();
    await page.waitForLoadState('networkidle');
    const beforeLegacyPublish = sessionRequests;
    await watchSessionGate(page);
    const legacy = await openLegacyPublisher(context, session, scenario.wrapped);

    await legacy.page.evaluate(() => window.startLegacySessionPublisher());
    // A bounded observation interval detects a self-sustaining cross-tab echo,
    // while allowing one legitimate refresh after the remote identity message.
    await page.waitForTimeout(OBSERVATION_MS);
    const legacyStats = await legacy.page.evaluate(() => ({
      writes: window.legacySessionWrites, storageEvents: window.legacySessionEvents
    }));
    const observation = {
      scenario: scenario.name,
      observationMs: OBSERVATION_MS,
      appSessionRequestsBeforeLegacyPublish: beforeLegacyPublish,
      appSessionRequestsAfterLegacyPublish: sessionRequests - beforeLegacyPublish,
      appSessionRequestsTotal: sessionRequests,
      legacySessionRequests: legacy.requests(),
      legacyIdentityWrites: legacyStats.writes,
      legacyStorageEvents: legacyStats.storageEvents,
      checkingSignInEntries: await page.evaluate(() => window.sessionGateLoadingEntries)
    };
    await legacy.page.evaluate(() => window.stopLegacySessionPublisher());
    await page.evaluate(() => window.stopSessionGateObserver());
    await page.waitForLoadState('networkidle');
    await testInfo.attach('session-refresh-observation.json', {
      body: JSON.stringify(observation, null, 2), contentType: 'application/json'
    });
    console.log('Cross-tab session observation: ' + JSON.stringify(observation));
    fixture.assertRequestsHandled();
    expect(fixture.calls.filter(call => call.method !== 'GET')).toEqual([]);

    expect(observation.appSessionRequestsAfterLegacyPublish,
      'A single legacy identity publication must not echo into repeated session requests')
      .toBeLessThanOrEqual(1);
    expect(observation.legacySessionRequests,
      'Passive storage synchronization must not bounce notifications back to the old tab')
      .toBe(1);
    expect(observation.checkingSignInEntries,
      'One external notification may recheck access once, but must not repeatedly replace the page')
      .toBeLessThanOrEqual(1);
    await expect(content).toBeVisible();
    await expect(page.getByText('Loading…', { exact: true })).toBeHidden();
    await expect(page).toHaveURL(new RegExp(scenario.path + '$'));
  });
}
