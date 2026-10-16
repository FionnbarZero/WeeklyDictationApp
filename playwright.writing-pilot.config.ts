import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/writing-pilot',
  outputDir: 'writing-pilot-test-results',
  workers: 1,
  timeout: 180_000,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:5210',
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    viewport: { width: 1366, height: 900 },
  },
  webServer: {
    command: 'npm run preview:writing-pilot',
    url: 'http://127.0.0.1:5210/family-beta-preview.html',
    reuseExistingServer: !process.env.CI,
  },
})
