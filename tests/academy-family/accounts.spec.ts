import { expect, test } from '@playwright/test'
import { installFamilyFixtures } from '../family-sync/fixtures.ts'

test('the family release requires sign-in and accepts an ordinary parent email', async ({ page }) => {
  let signIns = 0
  let familyReads = 0
  await page.route('**/firestore.googleapis.com/**', (route) => {
    familyReads++
    return route.abort()
  })
  await page.route('**/identitytoolkit.googleapis.com/**', (route) => {
    signIns++
    expect(route.request().postDataJSON().email).toBe('parent@example.com')
    return route.fulfill({ status: 400, json: { error: { message: 'INVALID_LOGIN_CREDENTIALS' } } })
  })
  await page.goto('/family-beta-preview.html?grade=grade2')
  await expect(page).toHaveTitle('Mandarin Ninja Academy · Family app')
  await expect(page.getByText('Mandarin Ninja Academy', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.getByLabel('Email', { exact: true }).fill('parent@example.com')
  await page.getByLabel('Password', { exact: true }).fill('unused-synthetic-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(signIns).toBe(1)
  expect(familyReads).toBe(0)
  await expect(page.getByText(/Use a separate ninja-device-/)).toHaveCount(0)
})

test('an authenticated ordinary family opens the approved app with accurate syncing information', async ({ page }) => {
  await installFamilyFixtures(page, new Map(), 'parent@example.com')
  await page.goto('/family-beta-preview.html?grade=grade2')
  await expect(page.frameLocator('iframe:visible').getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
  await page.locator('summary').filter({ hasText: 'Parent controls' }).click()
  await expect(page.getByRole('note').filter({ hasText: 'Mandarin Ninja Academy' })).toContainText('Family app')
  await expect(page.getByRole('region', { name: 'Family syncing' })).toContainText('confirmed')
  await expect(page.getByText(/Test learners only|Progress saves in this browser; no account/)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Saved-game recovery example' })).toHaveCount(0)
})

test('family release profile setup waits for the authenticated family connection', async ({ page }) => {
  await installFamilyFixtures(page, new Map(), 'parent@example.com')
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
