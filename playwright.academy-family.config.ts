import { defineConfig } from '@playwright/test'
import base from './playwright.device-acceptance.config.ts'

export default defineConfig({
  ...base,
  testDir: './tests',
  testMatch: [
    'academy-family/*.spec.ts',
    'device-acceptance/assessment.spec.ts',
    'device-acceptance/media.spec.ts',
    'device-acceptance/offline.spec.ts',
    'device-acceptance/retained.spec.ts',
    'device-acceptance/scrolling.spec.ts',
    'device-acceptance/writing.spec.ts',
  ],
  outputDir: process.env.DEVICE_RESULTS || 'test-results/academy-family',
})
