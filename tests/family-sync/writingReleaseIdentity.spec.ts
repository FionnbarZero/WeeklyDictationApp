import { expect, test } from '@playwright/test'
import { grades, installFamilyFixtures } from './fixtures.ts'

for (const [slug, grade] of grades) {
  test(`${grade}: enabled family writing keeps the canonical release label`, async ({ page }) => {
    await installFamilyFixtures(page)
    await page.goto(`/?grade=${slug}`)
    await expect(page.getByText('Ninja Dojo · Family beta', { exact: true })).toBeVisible()
    await expect(page.getByText('Grade 2 writing pilot · Unpublished', { exact: true })).toHaveCount(0)
  })
}
