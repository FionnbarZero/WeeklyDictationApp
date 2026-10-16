import { defineConfig } from '@playwright/test'

const hosted = process.env.DOJO_LAUNCH_PREVIEW_URL
export default defineConfig({
  testDir: './tests/dojo-launch',
  outputDir: 'test-results/dojo-launch',
  workers: 1,
  timeout: 90_000,
  reporter: 'line',
  use: { baseURL: hosted || 'http://127.0.0.1:5241', actionTimeout: 15_000, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } },
    { name: 'tablet-webkit', use: { browserName: 'webkit', viewport: { width: 1024, height: 1366 }, hasTouch: true } },
  ],
  webServer: hosted
    ? undefined
    : {
        command:
          'node node_modules/vite/bin/vite.js preview --outDir dojo-launch-preview-dist --host 127.0.0.1 --port 5241 --strictPort',
        url: 'http://127.0.0.1:5241/family-beta-preview.html',
        reuseExistingServer: false,
      },
})
