import { defineConfig } from '@playwright/test'

const port = Number(process.env.WRITING_SLAY_PORT || 5218)

export default defineConfig({
  testDir: './tests/writing-pilot',
  outputDir: 'writing-slay-test-results',
  workers: 1,
  timeout: 180_000,
  reporter: 'line',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: process.env.WRITING_SLAY_BROWSER === 'webkit' ? 'webkit' : 'chromium',
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    viewport:
      process.env.WRITING_SLAY_TABLET === 'portrait'
        ? { width: 768, height: 1024 }
        : process.env.WRITING_SLAY_TABLET
          ? { width: 1024, height: 768 }
          : { width: 1366, height: 900 },
  },
  webServer: {
    command: `npm run preview -- --outDir writing-slay-integration-dist --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/family-beta-preview.html`,
    reuseExistingServer: false,
  },
})
