import { defineConfig } from '@playwright/test'
import base from './playwright.academy-family.config.ts'

export default defineConfig({
  ...base,
  webServer: {
    command: 'node --experimental-strip-types scripts/serve-academy-family-test.ts',
    url: 'http://127.0.0.1:5193/family-beta-preview',
    reuseExistingServer: false,
    timeout: 120000,
  },
})
