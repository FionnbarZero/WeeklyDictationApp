import { defineConfig } from '@playwright/test'

const hosted = process.env.GRADE5_PRESENTATION_URL
export default defineConfig({
  testDir: './tests/grade5-presentation',
  workers: 1,
  timeout: 150000,
  outputDir: 'test-results/grade5-presentation',
  reporter: 'line',
  use: { baseURL: hosted || 'http://127.0.0.1:5264', actionTimeout: 15000, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } },
    { name: 'portrait-webkit', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 }, hasTouch: true } },
    {
      name: 'landscape-webkit',
      use: { browserName: 'webkit', viewport: { width: 1024, height: 665 }, hasTouch: true },
    },
  ],
  webServer: hosted
    ? undefined
    : {
        command:
          'node node_modules/vite/bin/vite.js preview --outDir grade5-presentation-preview-dist --host 127.0.0.1 --port 5264 --strictPort',
        url: 'http://127.0.0.1:5264/family-beta-preview.html',
        reuseExistingServer: true,
      },
})
