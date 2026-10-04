import { expect, test } from './fixtures.ts'
import { installGrade2CurriculumFixture } from './grade2Curriculum.ts'
import { openGrade2LearningActivity } from './learningHub.ts'

test('profile manager traps focus, closes on Escape, and restores its trigger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('.curriculum-source-status')).toContainText('Loaded 6 weekly datasets')
  const trigger = page.getByRole('button', { name: 'Profiles', exact: true })

  await trigger.click()

  const dialog = page.getByRole('dialog', { name: 'Who is practicing?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Close profile manager' })).toBeFocused()

  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: 'Add child' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Close profile manager' })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('profile switching and sign-out are locked while a child activity is active', async ({ page }) => {
  await installGrade2CurriculumFixture(page)
  await page.goto('/?testDate=2026-09-29')
  await expect(page.locator('.curriculum-source-status')).toContainText('Loaded 4 weekly datasets')
  await openGrade2LearningActivity(page, 'Enter the Dojo', 'Learn to Write')

  const profileSwitcher = page.locator('.profile-switcher')
  await expect(profileSwitcher).toBeDisabled()
  await expect(profileSwitcher).toHaveAccessibleDescription(
    'Exit the current activity before switching profiles or signing out.',
  )
  await profileSwitcher.click({ force: true })
  await expect(page.locator('.child-menu')).toHaveCount(0)

  await page.getByRole('button', { name: 'Exit practice' }).click()
  await expect(profileSwitcher).toBeEnabled()
})
