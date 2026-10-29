import { defineConfig } from '@playwright/test'

const baseURL = process.env.W2_BASE_URL || 'http://127.0.0.1:5276'
export default defineConfig({
  testDir: './tests/w2-recovery',
  outputDir: 'w2-recovery-test-results',
  workers: 3,
  fullyParallel: true,
  timeout: 120_000,
  reporter: 'line',
  use: { baseURL, actionTimeout: 12_000, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } },
    { name: 'ipad', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 }, hasTouch: true } },
  ],
  webServer: process.env.W2_BASE_URL
    ? undefined
    : {
        command: 'npx vite preview --outDir w2-recovery-preview-dist --host 127.0.0.1 --port 5276 --strictPort',
        url: `${baseURL}/family-beta-preview.html`,
        reuseExistingServer: false,
      },
})
