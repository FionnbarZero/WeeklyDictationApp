import { expect, test } from '@playwright/test'
import { installFamilyFixtures } from '../family-sync/fixtures.ts'

test('a real parent account cannot mount the prototype family reader', async ({ page }) => {
  let familyReads = 0
  await installFamilyFixtures(page, new Map(), 'parent@example.com')
  await page.route('**/firestore.googleapis.com/**', (route) => {
    familyReads++
    return route.abort()
  })
  await page.goto('/family-beta-preview.html?grade=grade2')
  await expect(page.getByRole('heading', { name: 'Test accounts only' })).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
  expect(familyReads).toBe(0)
})

test('normal parent email is rejected before sign-in or signup requests', async ({ page }) => {
  let authenticationRequests = 0
  await page.route('**/identitytoolkit.googleapis.com/**', (route) => {
    authenticationRequests++
    return route.abort()
  })
  await page.goto('/family-beta-preview.html?grade=grade2')
  await expect(page.getByRole('heading', { name: 'Device and syncing test' })).toBeVisible()
  await page.getByLabel('Email', { exact: true }).fill('parent@example.com')
  await page.getByLabel('Password', { exact: true }).fill('unused-test-value')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Use a separate ninja-device-')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Use a separate ninja-device-')
  expect(authenticationRequests).toBe(0)
})

test('profile setup waits for the private family connection', async ({ page }) => {
  await installFamilyFixtures(page, new Map(), 'ninja-device-fixture@example.invalid')
  let release!: () => void
  const connected = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/firestore.googleapis.com/**/documents:batchGet', async (route) => {
    await connected
    return route.fallback()
  })
  await page.goto('/family-beta-preview.html?grade=grade2')
  await page.locator('summary').filter({ hasText: 'Parent controls' }).click()
  await expect(page.getByRole('button', { name: 'Manage profiles', exact: true })).toBeDisabled()
  release()
  await expect(page.getByRole('button', { name: 'Manage profiles', exact: true })).toBeEnabled()
})

test('changing only the displayed email cannot open a real parent token', async ({ page }) => {
  await installFamilyFixtures(page, new Map(), 'ninja-device-fixture@example.invalid')
  await page.addInitScript(() => {
    sessionStorage.setItem('synthetic-auth-initialized', 'true')
    localStorage.setItem(
      'weekly-dictation-auth-v1',
      JSON.stringify({
        idToken: `synthetic.${btoa(JSON.stringify({ sub: 'synthetic-parent', email: 'parent@example.com', aud: 'weeklydictationapp', iss: 'https://securetoken.google.com/weeklydictationapp' }))}.intercepted-only`,
        expiresAt: Date.now() + 3600000,
        user: { uid: 'synthetic-parent', email: 'ninja-device-fixture@example.invalid' },
      }),
    )
  })
  await page.goto('/family-beta-preview.html?grade=grade2')
  await expect(page.getByRole('heading', { name: 'Test accounts only' })).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
})
