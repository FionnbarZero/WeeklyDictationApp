import { defineConfig } from '@playwright/test'

const hostedURL = process.env.WRITING_REFINEMENT_TEST_URL
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'writingRefinement.spec.ts',
  outputDir: hostedURL ? 'writing-refinement-hosted-test-results' : 'writing-refinement-test-results',
  workers: 1,
  reporter: 'line',
  timeout: 180_000,
  use: {
    baseURL: hostedURL || 'http://127.0.0.1:5214',
    actionTimeout: 10000,
    trace: 'retain-on-failure',
    viewport: { width: 1663, height: 916 },
  },
  webServer: hostedURL
    ? undefined
    : {
        command:
          'npm run preview -- --outDir writing-refinement-preview-dist --host 127.0.0.1 --port 5214 --strictPort',
        url: 'http://127.0.0.1:5214/grade2-writing-preview.html',
        reuseExistingServer: false,
      },
})
