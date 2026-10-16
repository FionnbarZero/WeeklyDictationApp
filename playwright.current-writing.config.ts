import { defineConfig } from '@playwright/test'
import family from './playwright.family-sync.config.ts'

process.env.FAMILY_CURRENT_WRITING = '1'
export default defineConfig({
  ...family,
  // Only retained-package rehearsals switch the server's active artifact.
  // Ordinary CI contexts are isolated and may run independently.
  workers: process.env.FAMILY_SYNC_REHEARSAL_OLD_ARTIFACT ? 1 : 3,
  timeout: 180_000,
  use: { ...family.use, actionTimeout: 20_000 },
  testIgnore: [],
  testMatch: [
    'writingTeaching.spec.ts',
    'writingReleaseIdentity.spec.ts',
    'nativeWritingRelease.spec.ts',
    'a33AttemptIdentity.spec.ts',
    'a33CompletedScores.spec.ts',
    'curriculumPinning.spec.ts',
    'offlineStartup.spec.ts',
    'offlineTransition.spec.ts',
  ],
  outputDir: 'test-results/current-writing',
  webServer: {
    ...family.webServer,
    env: { VITE_GRADE2_WRITING_PILOT: 'true', VITE_CROSS_GRADE_WRITING_PILOT: 'true' },
  },
})
