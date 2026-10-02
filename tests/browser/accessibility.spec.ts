import { expect, test } from './fixtures.ts'

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
