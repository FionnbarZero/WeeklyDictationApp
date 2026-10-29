import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/device-reports',
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  reporter: 'line',
  outputDir: process.env.DEVICE_REPORT_RESULTS || 'test-results/device-reports',
  use: {
    baseURL: process.env.DEVICE_REPORT_URL || 'http://127.0.0.1:5336/',
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'reported-chrome', use: { browserName: 'chromium', viewport: { width: 1024, height: 665 } } },
    { name: 'reported-webkit', use: { browserName: 'webkit', viewport: { width: 1024, height: 665 }, hasTouch: true } },
  ],
})
