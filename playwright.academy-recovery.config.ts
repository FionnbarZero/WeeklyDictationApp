import { defineConfig } from '@playwright/test'
import base from './playwright.family-security.config.ts'

export default defineConfig({
  ...base,
  testDir: './tests/academy-release',
  testMatch: '*.spec.ts',
  testIgnore: [],
  outputDir: process.env.ACADEMY_RECOVERY_RESULTS || 'test-results/academy-recovery',
  timeout: 240000,
  use: { ...base.use, serviceWorkers: 'block' },
})
