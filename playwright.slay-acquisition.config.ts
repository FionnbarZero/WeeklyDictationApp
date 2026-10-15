import { defineConfig } from '@playwright/test'

const hostedURL = process.env.SLAY_ACQUISITION_URL
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'slayAcquisition.spec.ts',
  workers: 1,
  reporter: 'line',
  timeout: 60_000,
  outputDir: hostedURL ? 'slay-acquisition-hosted-test-results' : 'slay-acquisition-test-results',
  use: {
    baseURL: hostedURL || 'http://127.0.0.1:5217',
    browserName: process.env.SLAY_ACQUISITION_BROWSER === 'webkit' ? 'webkit' : 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: hostedURL
    ? undefined
    : {
        command:
          'npm run preview -- --config vite.slay-acquisition.config.ts --host 127.0.0.1 --port 5217 --strictPort',
        url: 'http://127.0.0.1:5217/slay-acquisition.html',
        reuseExistingServer: false,
      },
})
