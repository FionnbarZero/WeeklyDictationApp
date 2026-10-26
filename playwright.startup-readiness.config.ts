import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/startup-readiness',
  workers: 2,
  fullyParallel: true,
  timeout: 90_000,
  reporter: 'line',
  outputDir: process.env.STARTUP_RESULTS || 'test-results/startup-readiness',
  use: {
    baseURL: process.env.STARTUP_URL || 'http://127.0.0.1:5332/',
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } } },
    { name: 'webkit', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 }, hasTouch: true } },
  ],
})
