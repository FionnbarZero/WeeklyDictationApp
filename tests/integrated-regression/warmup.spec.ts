import { test } from '@playwright/test'
import { installFamilyFixtures } from '../family-sync/fixtures.ts'

// Reuse approved behavioral assertions on the exact authenticated test package.
// Every account/server request is intercepted within this disposable test family.
test.beforeEach(async ({ page }) => {
  await installFamilyFixtures(page, new Map(), 'ninja-device-fixture@example.invalid')
})

await import('../native-warmup/interaction.spec.ts')
