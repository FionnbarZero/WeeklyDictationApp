import { defineConfig } from '@playwright/test'

const baseURL = process.env.AUTO_CURRICULUM_URL || 'http://127.0.0.1:5298/'
export default defineConfig({
  testDir: './tests/automatic-curriculum',
  workers: 2,
  fullyParallel: true,
  timeout: 120000,
  reporter: 'line',
  outputDir: 'test-results/automatic-curriculum',
  use: { baseURL, actionTimeout: 12000, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'laptop', use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } } },
    { name: 'landscape', use: { browserName: 'webkit', viewport: { width: 1024, height: 665 }, hasTouch: true } },
    { name: 'portrait', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 }, hasTouch: true } },
  ],
  webServer: process.env.AUTO_CURRICULUM_URL
    ? undefined
    : {
        command:
          'node node_modules/vite/bin/vite.js preview --outDir automatic-curriculum-preview-dist --host 127.0.0.1 --port 5298 --strictPort',
        url: baseURL,
        reuseExistingServer: false,
      },
})
