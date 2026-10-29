import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/wetland-review',
  workers: 3,
  fullyParallel: true,
  timeout: 180000,
  reporter: 'line',
  outputDir: process.env.WETLAND_RESULTS || 'test-results/wetland-review',
  use: {
    baseURL: process.env.WETLAND_URL || 'http://127.0.0.1:5342/',
    actionTimeout: 15000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'laptop', use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } } },
    { name: 'landscape', use: { browserName: 'webkit', viewport: { width: 1024, height: 665 }, hasTouch: true } },
    { name: 'portrait', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 }, hasTouch: true } },
  ],
})
