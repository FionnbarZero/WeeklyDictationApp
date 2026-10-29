import { defineConfig } from '@playwright/test'
const baseURL = process.env.NATIVE_WARMUP_URL || 'http://127.0.0.1:5316/'
export default defineConfig({
  testDir: './tests/native-warmup',
  workers: 3,
  fullyParallel: true,
  timeout: 240_000,
  reporter: 'line',
  outputDir: process.env.NATIVE_WARMUP_RESULTS || 'test-results/native-warmup',
  use: { baseURL, actionTimeout: 15_000, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'laptop', use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } } },
    { name: 'landscape', use: { browserName: 'webkit', viewport: { width: 1024, height: 665 }, hasTouch: true } },
    { name: 'portrait', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 }, hasTouch: true } },
  ],
  webServer: process.env.NATIVE_WARMUP_URL
    ? undefined
    : {
        command: `python3 -m http.server 5316 --bind 127.0.0.1 --directory ${process.env.NATIVE_WARMUP_PACKAGE || 'kore-voice-preview-dist'}`,
        url: baseURL,
        reuseExistingServer: false,
      },
})
