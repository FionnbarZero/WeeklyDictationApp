import { expect, test } from '@playwright/test'
import { installFamilyFixtures } from '../family-sync/fixtures.ts'

test.beforeEach(async ({ page }) => {
  await installFamilyFixtures(page, new Map(), 'ninja-device-fixture@example.invalid')
  const navigate = page.goto.bind(page)
  page.goto = async (url, options) => {
    const response = await navigate(url, options)
    if (!url.includes('grade=grade5')) return response
    // This suite's reference packs describe the retained weekly route, while
    // the default now intentionally selects the approved 50-word review.
    await page
      .frameLocator('iframe:visible')
      .getByRole('button', { name: /Enter the Dojo/ })
      .waitFor()
    const controls = page.locator('summary').filter({ hasText: 'Parent controls' })
    await controls.click()
    await page.getByRole('combobox', { name: 'Practice week', exact: true }).selectOption('2026-10-13')
    await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-week', '2026-10-13')
    await controls.click()
    return response
  }
})

await import('../report-repairs/completeGames.spec.ts')
