import { defineConfig } from '@playwright/test'

const hostedPreview = process.env.RECONCILIATION_BASE_URL

export default defineConfig({
  testDir: './tests/reconciliation',
  outputDir: 'reconciliation-test-results',
  workers: 1,
  timeout: 90_000,
  reporter: 'line',
  use: { baseURL: hostedPreview || 'http://127.0.0.1:5192', trace: 'retain-on-failure' },
  webServer: hostedPreview
    ? undefined
    : {
        command: 'npm run preview:reconciliation',
        url: 'http://127.0.0.1:5192/family-beta-preview.html',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
})
