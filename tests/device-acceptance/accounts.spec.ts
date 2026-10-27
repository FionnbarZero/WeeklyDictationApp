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
