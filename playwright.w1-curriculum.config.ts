import { defineConfig } from '@playwright/test'

const baseURL = process.env.W1_BASE_URL || 'http://127.0.0.1:5274'
process.env.FAMILY_CURRENT_WRITING = '1'
export default defineConfig({
  testDir: './tests/w1-curriculum',
  outputDir: 'w1-curriculum-test-results',
  workers: 3,
  fullyParallel: true,
  timeout: 120_000,
  reporter: 'line',
  use: { baseURL, actionTimeout: 12_000, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: {
        browserName: 'chromium',
        channel: process.env.W1_INSTALLED_CHROME === '1' ? 'chrome' : undefined,
        viewport: { width: 1366, height: 900 },
      },
    },
    { name: 'ipad', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 } } },
  ],
  webServer: process.env.W1_BASE_URL
    ? undefined
    : {
        command: 'npx vite preview --outDir w1-curriculum-preview-dist --host 127.0.0.1 --port 5274 --strictPort',
        url: `${baseURL}/family-beta-preview.html`,
        reuseExistingServer: false,
      },
})
