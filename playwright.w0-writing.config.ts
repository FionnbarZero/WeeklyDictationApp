import { defineConfig } from '@playwright/test'

const baseURL = process.env.W0_BASE_URL || 'http://127.0.0.1:5272'
process.env.FAMILY_CURRENT_WRITING = '1'
export default defineConfig({
  testDir: './tests/w0-writing',
  outputDir: 'w0-writing-test-results',
  workers: 3,
  fullyParallel: true,
  timeout: 180_000,
  reporter: 'line',
  use: { baseURL, actionTimeout: 12_000, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } },
    { name: 'portrait', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 } } },
    { name: 'landscape', use: { browserName: 'webkit', viewport: { width: 1024, height: 665 } } },
  ],
  webServer: process.env.W0_BASE_URL
    ? undefined
    : {
        command: 'npx vite preview --outDir w0-writing-preview-dist --host 127.0.0.1 --port 5272 --strictPort',
        url: `${baseURL}/family-beta-preview.html`,
        reuseExistingServer: false,
      },
})
