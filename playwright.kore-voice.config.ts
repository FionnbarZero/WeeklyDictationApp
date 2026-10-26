import { defineConfig } from '@playwright/test'
const baseURL = process.env.KORE_URL || 'http://127.0.0.1:5306/'
export default defineConfig({
  testDir: './tests/kore-voice',
  workers: 3,
  fullyParallel: true,
  timeout: 120_000,
  reporter: 'line',
  outputDir: 'kore-voice-test-results',
  use: { baseURL, actionTimeout: 12_000, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'laptop', use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } } },
    { name: 'landscape', use: { browserName: 'webkit', viewport: { width: 1024, height: 665 }, hasTouch: true } },
    { name: 'portrait', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 }, hasTouch: true } },
  ],
})
