import { expect, test } from './fixtures.ts'
import path from 'node:path'
import { openGrade2LearningActivity } from './learningHub.ts'

test('profile manager traps focus, closes on Escape, and restores its trigger', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'R Grade 2' })

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
  await page.goto('/?testDate=2026-09-29')
  await page.locator('input[type="file"]').setInputFiles(path.resolve('tests/fixtures/grade2-presentation.json'))
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
