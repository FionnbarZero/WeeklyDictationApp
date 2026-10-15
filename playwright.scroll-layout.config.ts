import { defineConfig } from '@playwright/test'

const hostedURL = process.env.SCROLL_LAYOUT_URL
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'scrollLayout.spec.ts',
  workers: 1,
  reporter: 'line',
  timeout: 60_000,
  outputDir: hostedURL ? 'scroll-layout-hosted-test-results' : 'scroll-layout-test-results',
  use: {
    baseURL: hostedURL || 'http://127.0.0.1:5216',
    browserName: process.env.SCROLL_LAYOUT_BROWSER === 'webkit' ? 'webkit' : 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: hostedURL
    ? undefined
    : {
        command: 'npm run preview -- --config vite.scroll-layout.config.ts --host 127.0.0.1 --port 5216 --strictPort',
        url: 'http://127.0.0.1:5216/scroll-layout.html',
        reuseExistingServer: false,
      },
})
