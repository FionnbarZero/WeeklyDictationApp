import { defineConfig } from '@playwright/test'
import base from './playwright.integrated-regression.config.ts'
export default defineConfig({
  ...base,
  testDir: './tests/integrated-regression-followup',
  outputDir: process.env.INTEGRATED_RESULTS || 'test-results/integrated-followup',
  grep: /Grade 5: .*completes its actual|approved direct mastered arcade/,
})
