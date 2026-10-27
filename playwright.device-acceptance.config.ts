import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/device-acceptance',
  outputDir: process.env.DEVICE_RESULTS || 'test-results/device-acceptance',
  workers: 1,
  timeout: 180000,
  reporter: 'line',
  use: {
    baseURL: process.env.DEVICE_URL || 'http://127.0.0.1:5193',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } },
    { name: 'ipad-webkit', use: { browserName: 'webkit', viewport: { width: 1024, height: 768 }, hasTouch: true } },
  ],
})
