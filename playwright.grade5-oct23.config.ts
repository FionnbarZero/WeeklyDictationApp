import { defineConfig } from '@playwright/test'

const hosted = process.env.OCT23_URL
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'grade5October23Prototype.spec.ts',
  workers: 1,
  timeout: 180000,
  reporter: 'line',
  outputDir: 'grade5-oct23-test-results',
  use: { baseURL: hosted || 'http://127.0.0.1:5243', actionTimeout: 15000, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } },
    { name: 'tablet', use: { browserName: 'webkit', viewport: { width: 820, height: 1180 }, hasTouch: true } },
  ],
  webServer: hosted
    ? undefined
    : {
        command: 'npm run preview -- --config vite.grade5-oct23.config.ts --host 127.0.0.1 --port 5243 --strictPort',
        url: 'http://127.0.0.1:5243/grade5-oct23-preview.html',
        reuseExistingServer: false,
      },
})
