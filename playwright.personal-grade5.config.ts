import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/personal-grade5',
  outputDir: process.env.PERSONAL_RESULTS || 'test-results/personal-grade5',
  workers: 2,
  timeout: 120000,
  reporter: 'line',
  use: { actionTimeout: 20000, trace: 'retain-on-failure', serviceWorkers: 'block' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
    { name: 'ipad-landscape', use: { browserName: 'webkit', viewport: { width: 1024, height: 768 }, hasTouch: true } },
    { name: 'ipad-portrait', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 }, hasTouch: true } },
  ],
})
