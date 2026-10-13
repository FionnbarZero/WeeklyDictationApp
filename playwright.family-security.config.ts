import { defineConfig } from '@playwright/test'
import family from './playwright.family-sync.config.ts'

export default defineConfig({
  ...family,
  testDir: './tests',
  // Keep this provider-applied gate bounded. Other family-sync suites rely on
  // the ordinary fixture server's synthetic aliases, not real packaged routes.
  testMatch: [
    'family-security/*.spec.ts',
    'family-sync/a2ReviewRegressions.spec.ts',
    'family-sync/activityContinuity.spec.ts',
    'family-sync/recordingContinuity.spec.ts',
    'family-sync/offlineStartup.spec.ts',
    'family-sync/offlineTransition.spec.ts',
  ],
  outputDir: 'test-results/family-security',
  webServer: {
    command: 'node --experimental-strip-types scripts/serve-family-security-test.ts',
    url: 'http://127.0.0.1:5193/family-beta-preview',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
  },
})
