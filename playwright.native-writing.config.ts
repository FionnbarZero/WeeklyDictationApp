import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  outputDir: 'native-writing-test-results',
  workers: 3,
  fullyParallel: true,
  timeout: 180_000,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:5239',
    actionTimeout: 12_000,
    trace: 'retain-on-failure',
    viewport: { width: 1024, height: 768 },
  },
  projects: [
    { name: 'chromium', testMatch: 'native-writing/**/*.spec.ts', use: { browserName: 'chromium' } },
    { name: 'webkit', testMatch: 'native-writing/**/*.spec.ts', use: { browserName: 'webkit' } },
    {
      name: 'grade2-regression',
      testMatch: 'writing-pilot/integration.spec.ts',
      grep: /Slay acquisition|actual Grade 2 launcher|pinned six-step/,
      use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } },
    },
  ],
  webServer: {
    command: `npx vite preview --outDir ${process.env.NATIVE_WRITING_DIST || 'native-writing-integration-dist'} --host 127.0.0.1 --port 5239 --strictPort`,
    url: 'http://127.0.0.1:5239/family-beta-preview.html',
    reuseExistingServer: false,
  },
})
