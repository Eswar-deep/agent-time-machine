import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8000',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL === 'bundled' ? undefined :
      process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    viewport: { width: 1440, height: 1080 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: process.platform === 'win32' ? '.\\.venv\\Scripts\\python.exe -m backend' : '.venv/bin/python -m backend',
    url: 'http://127.0.0.1:8000/api/health',
    reuseExistingServer: true,
    timeout: 30_000,
    env: { ATM_DATABASE: 'data/browser-tests.sqlite3' },
  },
});

