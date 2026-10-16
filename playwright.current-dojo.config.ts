import { defineConfig } from '@playwright/test'
import family from './playwright.family-sync.config.ts'

// Current-week ordinary entry uses the real canonical packager/offline shell.
// Only external services and learner records are synthetic in this local gate.
export default defineConfig({
  ...family,
  testDir: './tests/dojo-sync',
  testIgnore: [],
  workers: 1,
  timeout: 180_000,
  outputDir: 'test-results/current-dojo',
  webServer: {
    ...family.webServer,
    env: { VITE_GRADE2_WRITING_PILOT: 'true', VITE_CROSS_GRADE_WRITING_PILOT: 'true' },
  },
})
