import { defineConfig } from '@playwright/test'

process.env.WRITING_IPAD_PREVIEW = '1'
const hostedURL = process.env.WRITING_IPAD_TEST_URL
export default defineConfig({
  testDir: './tests/browser',
  testMatch: ['writingRefinement.spec.ts', 'writingIpad.spec.ts'],
  outputDir: hostedURL ? 'writing-ipad-hosted-test-results' : 'writing-ipad-test-results',
  workers: 1,
  reporter: 'line',
  timeout: 180_000,
  use: {
    browserName: process.env.WRITING_IPAD_BROWSER === 'webkit' ? 'webkit' : 'chromium',
    baseURL: hostedURL || 'http://127.0.0.1:5215',
    viewport: { width: 1663, height: 916 },
    trace: 'retain-on-failure',
  },
  webServer: hostedURL
    ? undefined
    : {
        command: 'npm run preview -- --outDir writing-ipad-preview-dist --host 127.0.0.1 --port 5215 --strictPort',
        url: 'http://127.0.0.1:5215/grade2-writing-preview.html',
        reuseExistingServer: false,
      },
})
