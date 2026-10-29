import { expect, test } from '@playwright/test'

test('obsolete demonstrations are absent from the consolidated public package', async ({ request, page }) => {
  for (const path of ['grade5-oct23-preview.html', 'warmup-design-preview.html']) {
    const response = await request.get(`./${path}`)
    expect(response.status()).toBe(404)
  }
  await page.goto('./family-beta-preview.html?grade=grade5')
  await page.getByText('Parent controls', { exact: true }).click()
  await expect(page.locator('a[href*="grade5-oct23-preview"]')).toHaveCount(0)
})
