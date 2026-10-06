import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/family-sync',
  outputDir: 'test-results/family-sync',
  workers: 1,
  timeout: 60_000,
  reporter: 'line',
  use: { baseURL: 'http://127.0.0.1:5193', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium' } },
    {
      name: 'tablet-touch',
      use: { browserName: 'chromium', viewport: { width: 1024, height: 1366 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: 'node --experimental-strip-types scripts/serve-family-sync-test.ts',
    url: 'http://127.0.0.1:5193/family-beta-preview',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
