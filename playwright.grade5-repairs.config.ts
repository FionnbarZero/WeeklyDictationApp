import { defineConfig } from '@playwright/test'
const hosted = process.env.GRADE5_REPAIRS_URL
export default defineConfig({
  testDir: './tests',
  testMatch: ['oct20-regressions/*.spec.ts', 'grade5-repairs/*.spec.ts'],
  grep: /grade5|Grade 5/,
  workers: 1,
  timeout: 150000,
  outputDir: 'test-results/grade5-repairs',
  reporter: 'line',
  use: { baseURL: hosted || 'http://127.0.0.1:5261', actionTimeout: 15000, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } },
    {
      name: 'landscape-webkit',
      use: { browserName: 'webkit', viewport: { width: 1024, height: 665 }, hasTouch: true },
    },
    { name: 'short-webkit', use: { browserName: 'webkit', viewport: { width: 983, height: 638 }, hasTouch: true } },
    { name: 'portrait-webkit', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 }, hasTouch: true } },
  ],
  webServer: hosted
    ? undefined
    : {
        command:
          'node node_modules/vite/bin/vite.js preview --outDir grade5-repair-preview-dist --host 127.0.0.1 --port 5261 --strictPort',
        url: 'http://127.0.0.1:5261/family-beta-preview.html?grade=grade5',
        reuseExistingServer: true,
      },
})
