import { expect, test } from '@playwright/test'
import { installFamilyFixtures } from './fixtures.ts'

test('Context confirmation during reporting stays visually paused until the report closes', async ({
  page,
  baseURL,
  isMobile,
}) => {
  await installFamilyFixtures(page)
  if (baseURL && new URL(baseURL).hostname === '127.0.0.1')
    await page.route(`${baseURL}/**`, (route) => route.continue())
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?grade=grade5')
  await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
  await page.getByRole('button', { name: 'Context Gap Dash', exact: true }).click()
  const frame = page.frameLocator('iframe:visible')
  const choice = frame.locator(isMobile ? '.lg-mobile-gate-choices button' : '.lg-canvas-access button').first()
  await expect(choice).toBeEnabled()
  await page.evaluate(() => {
    const target = window as Window & { releaseGameLock?: () => void; gameLockReady?: boolean }
    void navigator.locks.request('ninja-game-storage-v1:family-synthetic-parent', async () => {
      target.gameLockReady = true
      await new Promise<void>((resolve) => {
        target.releaseGameLock = resolve
      })
    })
  })
  await expect
    .poll(() => page.evaluate(() => (window as Window & { gameLockReady?: boolean }).gameLockReady))
    .toBe(true)
  const before = (await frame.locator('.lg-phaser-meta').textContent())!
  const clue = await frame.locator('.lg-dash-context-clue strong').innerText()
  if (isMobile) await choice.tap()
  else await frame.locator('canvas').press('1')
  await expect(choice).toBeDisabled()
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'true')
  await page.evaluate(() => (window as Window & { releaseGameLock?: () => void }).releaseGameLock?.())
  await expect
    .poll(() =>
      page.evaluate(() => {
        const key = Object.keys(localStorage).find(
          (key) => key.startsWith('family-beta-games-v1:') && key.includes(':checkpoint:'),
        )!
        return JSON.parse(localStorage.getItem(key)!).revision
      }),
    )
    .toBe(1)
  await expect(frame.locator('.lg-phaser-meta')).toHaveText(before)
  await expect(frame.locator('.lg-dash-context-clue strong')).toHaveText(clue)
  await expect(frame.locator('.lg-mobile-feedback')).toBeEmpty()
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await expect(frame.locator('.lg-mobile-feedback')).not.toBeEmpty()
})
