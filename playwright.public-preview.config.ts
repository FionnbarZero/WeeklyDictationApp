import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'grade5PublicPreview.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:5196/WeeklyDictationApp/',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --mode public-preview --host 127.0.0.1 --port 5196',
    url: 'http://127.0.0.1:5196/WeeklyDictationApp/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
