import { defineConfig } from '@playwright/test'

// Local synthetic-service rehearsal, not a deployable or authenticated acceptance artifact.
export default defineConfig({
  testDir: './tests/dojo-sync',
  outputDir: 'test-results/dojo-sync',
  workers: 1,
  timeout: 180_000,
  reporter: 'line',
  use: { baseURL: 'http://127.0.0.1:5193', actionTimeout: 15_000, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } },
    { name: 'tablet-webkit', use: { browserName: 'webkit', viewport: { width: 1024, height: 1366 }, hasTouch: true } },
  ],
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js preview --outDir dojo-sync-test-dist --host 127.0.0.1 --port 5193 --strictPort',
    url: 'http://127.0.0.1:5193/family-beta-preview.html',
    reuseExistingServer: false,
  },
})
