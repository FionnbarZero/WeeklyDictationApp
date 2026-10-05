import { expect, test } from './fixtures.ts'
import { installGrade2CurriculumFixture } from './grade2Curriculum.ts'

test('Grade 2 exposes six source-gated learning modules and launches Memory Lanterns on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await installGrade2CurriculumFixture(page)
  await page.goto('/?testDate=2026-09-29')
  await expect(page.locator('.curriculum-source-status')).toContainText('Loaded 4 weekly datasets')

  await page.getByRole('button', { name: /Practice your Ninja Skills/ }).click()
  for (const title of [
    'Dictation Streak',
    'Shuriken Match',
    'Shadow Strike Dojo',
    'Memory Lanterns',
    'Context Gap Dash',
    'Sushi Scramble',
  ]) await expect(page.getByRole('heading', { name: title })).toBeVisible()

  await expect(page.getByRole('button', { name: 'Needs Source Data' })).toHaveCount(4)
  await expect(page.getByText(/reviewed Pinyin steps/)).toBeVisible()
  await expect(page.getByText(/approved English meanings/)).toBeVisible()
  await expect(page.getByText(/approved sentence/).first()).toBeVisible()

  await page.getByRole('button', { name: 'Start Memory Lanterns' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Lanterns' })).toBeVisible()
  await expect(page.locator('.profile-switcher')).toBeDisabled()
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390)

  await page.getByRole('button', { name: 'Exit learning module' }).click()
  await expect(page.getByRole('heading', { name: 'How do you want to train?' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Memory Lanterns' })).toBeVisible()
  await expect(page.locator('.profile-switcher')).toBeEnabled()
})
