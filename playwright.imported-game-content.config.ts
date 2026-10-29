import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/imported-game-content',
  outputDir: 'test-results/imported-game-content',
  workers: 2,
  fullyParallel: true,
  timeout: 150000,
  reporter: 'line',
  use: {
    baseURL: process.env.IMPORTED_CONTENT_URL || 'http://127.0.0.1:5307/',
    actionTimeout: 12000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } },
    { name: 'ipad-landscape', use: { browserName: 'webkit', viewport: { width: 1024, height: 665 }, hasTouch: true } },
  ],
})
