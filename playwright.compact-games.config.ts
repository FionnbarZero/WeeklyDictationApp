import { defineConfig } from '@playwright/test'

const baseURL = process.env.COMPACT_GAMES_URL || 'http://127.0.0.1:5288'
export default defineConfig({
  testDir: './tests/compact-games',
  outputDir: 'test-results/compact-games',
  workers: 2,
  fullyParallel: true,
  timeout: 120000,
  reporter: 'line',
  use: { baseURL, actionTimeout: 12000, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'laptop',
      testMatch: 'layout.spec.ts',
      use: { browserName: 'chromium', viewport: { width: 983, height: 638 } },
    },
    {
      name: 'landscape',
      testMatch: 'layout.spec.ts',
      use: { browserName: 'webkit', viewport: { width: 1024, height: 665 }, hasTouch: true },
    },
    {
      name: 'portrait',
      testMatch: 'layout.spec.ts',
      use: { browserName: 'webkit', viewport: { width: 768, height: 1024 }, hasTouch: true },
    },
    {
      name: 'phone',
      testMatch: 'small-screen.spec.ts',
      use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, hasTouch: true },
    },
  ],
  webServer: process.env.COMPACT_GAMES_URL
    ? undefined
    : {
        command:
          'node node_modules/vite/bin/vite.js preview --outDir w2-recovery-preview-dist --host 127.0.0.1 --port 5288 --strictPort',
        url: `${baseURL}/family-beta-preview.html`,
        reuseExistingServer: false,
      },
})
