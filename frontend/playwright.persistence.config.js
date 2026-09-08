import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/persistence',
  workers: 1,
  timeout: 90000,
  reporter: [['list'], ['json', { outputFile: 'test-results/persistence-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4181', actionTimeout: 15000, screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm run dev -- --port 4181 --strictPort',
    url: 'http://127.0.0.1:4181',
    reuseExistingServer: false,
    stdout: 'ignore', stderr: 'pipe'
  }
});
