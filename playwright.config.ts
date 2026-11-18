import { defineConfig } from '@playwright/test';

const port = 4300;

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/results',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    launchOptions: {
      // Use a locally installed Chromium when PW_CHROMIUM_PATH is set (e.g. /usr/bin/chromium);
      // otherwise Playwright's own browser (`npx playwright install chromium`).
      executablePath: process.env['PW_CHROMIUM_PATH'] || undefined,
    },
  },
  webServer: {
    command: `npx ng serve demo --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
