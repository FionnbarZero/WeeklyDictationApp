import { expect, test } from './fixtures.ts'
import { grade2CurriculumFixture } from './grade2Curriculum.ts'

test('Grade 2 loads its reviewed Slides snapshot automatically and retries safely', async ({ page }) => {
  const snapshot = await grade2CurriculumFixture()
  let requests = 0
  await page.route('**/curriculum/grade2-presentation.json', (route) => {
    requests += 1
    if (requests === 1) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"schema":"invalid"}' })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(snapshot),
    })
  })

  await page.goto('/?testDate=2026-09-29')

  await expect(page.getByText('Weekly vocabulary could not be updated automatically.')).toBeVisible()
  await expect(page.locator('input[type="file"]')).toHaveCount(0)

  await page.getByRole('button', { name: 'Try again' }).click()

  await expect(page.locator('.curriculum-source-status')).toContainText('Loaded 4 weekly datasets')
  await expect(page.getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
  expect(requests).toBe(2)
})
