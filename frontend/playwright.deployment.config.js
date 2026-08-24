import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'deployment-delivery.spec.js',
  fullyParallel: true,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: [
    {
      command: 'node tests/browser/proxy-backend.mjs',
      url: 'http://127.0.0.1:4180/api/auth/session',
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe'
    },
    {
      command: 'npm run build && npm run preview -- --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      env: {
        WILDTRACK_LOCAL_BACKEND_ORIGIN: 'http://127.0.0.1:4180'
      },
      stdout: 'ignore',
      stderr: 'pipe'
    }
  ]
});
