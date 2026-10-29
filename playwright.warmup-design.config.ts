import { defineConfig } from '@playwright/test'

const baseURL = process.env.WARMUP_DESIGN_URL || 'http://127.0.0.1:5296'
export default defineConfig({
  testDir: './tests/warmup-design',
  outputDir: 'test-results/warmup-design',
  workers: 2,
  fullyParallel: true,
  timeout: 180000,
  reporter: 'line',
  use: { baseURL, actionTimeout: 12000, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'laptop', use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } } },
    { name: 'landscape', use: { browserName: 'webkit', viewport: { width: 1024, height: 665 }, hasTouch: true } },
    { name: 'portrait', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 }, hasTouch: true } },
  ],
  webServer: process.env.WARMUP_DESIGN_URL
    ? undefined
    : {
        command: `node node_modules/vite/bin/vite.js preview --outDir ${process.env.WARMUP_PACKAGE || '/tmp/ninja-warmup-local-1'} --host 127.0.0.1 --port 5296 --strictPort`,
        url: baseURL,
        reuseExistingServer: false,
      },
})
