import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the PRODUCTION build served from a GitHub-Pages-style
 * sub-path (/secret-santa/), so they also verify base-path compatibility.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/secret-santa/',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && node scripts/serve-subpath.mjs 4173 /secret-santa/',
    url: 'http://localhost:4173/secret-santa/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /reveal\.spec\.ts/ },
  ],
});
