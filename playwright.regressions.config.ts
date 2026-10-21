import { defineConfig } from '@playwright/test'
const hosted = process.env.REGRESSION_PREVIEW_URL
export default defineConfig({
  testDir: './tests/oct20-regressions',
  outputDir: 'test-results/oct20-regressions',
  workers: 1,
  timeout: 90_000,
  reporter: 'line',
  use: { baseURL: hosted || 'http://127.0.0.1:5255', actionTimeout: 15_000, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'landscape-webkit',
      use: { browserName: 'webkit', viewport: { width: 1024, height: 665 }, hasTouch: true },
    },
    { name: 'short-webkit', use: { browserName: 'webkit', viewport: { width: 983, height: 638 }, hasTouch: true } },
    { name: 'portrait-webkit', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } },
  ],
  webServer: hosted
    ? undefined
    : {
        command:
          'node node_modules/vite/bin/vite.js preview --outDir regression-preview-dist --host 127.0.0.1 --port 5255 --strictPort',
        url: 'http://127.0.0.1:5255/family-beta-preview.html',
        reuseExistingServer: true,
      },
})
