import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/game-content-audit',
  outputDir: 'test-results/game-content-audit',
  workers: 1,
  timeout: 180000,
  reporter: 'line',
  use: {
    baseURL: process.env.CONTENT_AUDIT_URL || 'https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app',
    actionTimeout: 12000,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } },
    { name: 'ipad-landscape', use: { browserName: 'webkit', viewport: { width: 1024, height: 665 }, hasTouch: true } },
  ],
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js preview --outDir family-beta-artifacts/prototypes/w-combined-0189a98/package --host 127.0.0.1 --port 5286 --strictPort',
    url: 'http://127.0.0.1:5286/family-beta-preview.html',
    reuseExistingServer: false,
  },
})
