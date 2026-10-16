import { defineConfig } from '@playwright/test'
import family from './playwright.family-sync.config.ts'

process.env.DOJO_FAMILY_PACKAGE = '1'
// Current-week ordinary entry uses the real canonical packager/offline shell.
// Only external services and learner records are synthetic in this local gate.
export default defineConfig({
  ...family,
  testDir: './tests',
  testMatch: ['dojo-sync/resume.spec.ts', 'dojo-launch/recovery.spec.ts'],
  testIgnore: [],
  workers: 1,
  timeout: 180_000,
  outputDir: 'test-results/current-dojo',
  webServer: {
    ...family.webServer,
    command: process.env.FAMILY_SECURITY_CANDIDATE
      ? 'node --experimental-strip-types scripts/serve-family-security-test.ts'
      : family.webServer.command,
    env: { VITE_GRADE2_WRITING_PILOT: 'true', VITE_CROSS_GRADE_WRITING_PILOT: 'true' },
  },
})
