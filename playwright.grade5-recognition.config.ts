import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/grade5-recognition',
  workers: 3,
  fullyParallel: true,
  timeout: 180000,
  reporter: 'line',
  outputDir: process.env.RECOGNITION_RESULTS || 'test-results/grade5-recognition',
  use: {
    baseURL: process.env.RECOGNITION_URL || 'http://127.0.0.1:5348',
    actionTimeout: 15000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'laptop', use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } } },
    { name: 'landscape', use: { browserName: 'webkit', viewport: { width: 1080, height: 670 }, hasTouch: true } },
    { name: 'portrait', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 }, hasTouch: true } },
  ],
})
