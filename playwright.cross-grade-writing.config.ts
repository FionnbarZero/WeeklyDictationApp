import { defineConfig } from '@playwright/test'

const port = Number(process.env.CROSS_GRADE_PORT || 5234)
const hostedURL = process.env.CROSS_GRADE_URL
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'crossGradeWriting.spec.ts',
  workers: 1,
  timeout: 180_000,
  reporter: 'line',
  outputDir: 'cross-grade-writing-test-results',
  use: {
    actionTimeout: 15000,
    baseURL: hostedURL || `http://127.0.0.1:${port}`,
    browserName: process.env.CROSS_GRADE_BROWSER === 'webkit' ? 'webkit' : 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: hostedURL
    ? undefined
    : {
        command: `npm run preview -- --config vite.cross-grade-writing.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
        url: `http://127.0.0.1:${port}/cross-grade-writing-preview.html`,
        reuseExistingServer: false,
      },
})
