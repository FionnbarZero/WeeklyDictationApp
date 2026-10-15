import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'writingIntegrationPreview.spec.ts',
  workers: 1,
  reporter: 'line',
  use: { baseURL: 'http://127.0.0.1:5208', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run preview -- --outDir writing-integration-preview-dist --host 127.0.0.1 --port 5208 --strictPort',
    url: 'http://127.0.0.1:5208/grade2-writing-preview.html',
    reuseExistingServer: false,
  },
})
