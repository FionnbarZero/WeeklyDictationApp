import { expect, test } from '@playwright/test'

test('Checkpoint writes wait for the cross-tab lock and duplicate clicks commit once', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices() {
          return []
        },
        speak(u: SpeechSynthesisUtterance) {
          u.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 5)
        },
      },
    })
  })
  await page.goto('/warmup-design-preview.html?grade=grade2')
  await page.getByRole('button', { name: 'Start or resume Warmup', exact: true }).click()
  const skip = page.getByRole('button', { name: 'Skip Timer', exact: true })
  await expect(skip).toBeEnabled({ timeout: 15000 })
  await page.evaluate(
    () =>
      new Promise<void>((acquired) => {
        void navigator.locks.request(
          'ninja-scrolls-write:ninja-warmup-design-v1:grade2',
          () =>
            new Promise<void>((release) => {
              ;(window as unknown as { releaseTestLock: () => void }).releaseTestLock = release
              acquired()
            }),
        )
      }),
  )
  await skip.click()
  await expect(page.locator('.warmup-design')).toHaveAttribute('data-report-phase', 'memory')
  await skip.click()
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('ninja-warmup-design-v1:grade2')!).state.revision),
  ).toBe(0)
  await page.evaluate(() => (window as unknown as { releaseTestLock: () => void }).releaseTestLock())
  await expect(page.locator('.warmup-design')).toHaveAttribute('data-report-phase', 'compare')
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('ninja-warmup-design-v1:grade2')!).state.revision),
  ).toBe(1)
  await page.getByRole('button', { name: 'I got it wrong', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Warmup stroke guide' })).toBeVisible()
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('ninja-warmup-design-v1:grade2')!).state.firstAnswers),
  ).toEqual([false])
})
