import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/integrated-regression',
  outputDir: process.env.INTEGRATED_RESULTS || 'test-results/integrated-regression',
  workers: 3,
  fullyParallel: true,
  timeout: 240_000,
  reporter: 'line',
  grep: /native words|finish native Warmup|failed checkpoint|Grade 2 Spirit Realm|plays actual Kore|ordinary Lanterns|opening writing lesson|completes its actual|approved direct mastered arcade/,
  grepInvert:
    /Kindergarten: (native words|finish native Warmup|a failed checkpoint)|Grade 2 Spirit Realm uses the same approved correction/,
  use: {
    baseURL: process.env.INTEGRATED_URL || 'http://127.0.0.1:5193',
    serviceWorkers: 'block',
    actionTimeout: 20000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } },
    { name: 'ipad-portrait', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 }, hasTouch: true } },
  ],
})
