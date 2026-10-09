import { expect, test, type FrameLocator, type Page } from '@playwright/test'
import type { GameCheckpoint } from '../../src/ninjaSkills/progress.ts'
import { grades, installFamilyFixtures } from './fixtures.ts'

test.beforeEach(async ({ page }) => installFamilyFixtures(page))

async function open(page: Page, slug: string, embedded = false) {
  await page.goto(`/?grade=${slug}`)
  if (embedded)
    await page
      .frameLocator('iframe:visible')
      .getByRole('button', { name: /Practice your Ninja Skills/ })
      .click()
  else await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
  await (embedded ? page.frameLocator('iframe:visible') : page)
    .getByRole('button', { name: 'Shuriken Match', exact: true })
    .click()
  const frame = page.frameLocator('iframe:visible')
  await expect(frame.getByRole('heading', { name: 'Shuriken Match', exact: true })).toBeVisible()
  return frame
}

async function checkpoint(page: Page): Promise<GameCheckpoint> {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('family-beta-games-v1:') && key.includes(':checkpoint:'))
      .map((key) => JSON.parse(localStorage.getItem(key)!))
      .find((value) => value.scope.gameId === 'speed-match'),
  )
}

async function seal(frame: FrameLocator, label: string, mobile: boolean) {
  const button = frame.getByRole('button', { name: `${label}. Click to hear and select.`, exact: true })
  if (mobile) await button.tap()
  else await button.click()
}

for (const [slug, grade, childId] of grades) {
  test(`${grade}: Shuriken resumes time and reviews, pauses reports and preserves expired-cycle results`, async ({
    page,
    isMobile,
  }) => {
    test.setTimeout(120000)
    let frame = await open(page, slug)
    const initial = await checkpoint(page)
    if (initial.pack.moduleId !== 'speed-match') throw new Error('Wrong game')
    const pairs = initial.pack.pairs
    await seal(frame, pairs[0].left.label, isMobile)
    await seal(frame, pairs[1].right.label, isMobile)
    await expect.poll(async () => (await checkpoint(page)).prompts[0].attempted).toBe(1)
    await seal(frame, pairs[0].left.label, isMobile)
    await seal(frame, pairs[0].right.label, isMobile)
    await expect.poll(async () => (await checkpoint(page)).cleared).toEqual([pairs[0].id])
    await expect.poll(async () => (await checkpoint(page)).remainingMs).toBeLessThan(60000)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'true')
    const paused = await checkpoint(page)
    await page.waitForTimeout(2200)
    expect(await checkpoint(page)).toEqual(paused)
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    frame = await open(page, slug, true)
    const resumed = await checkpoint(page)
    expect(resumed.attemptId).toBe(initial.attemptId)
    expect(resumed.remainingMs).toBeLessThanOrEqual(paused.remainingMs!)
    expect(resumed.prompts).toEqual(paused.prompts)
    await expect(frame.locator('.lg-word-seal.is-matched')).toHaveCount(2)
    await expect(frame.locator('.lg-word-seal.is-selected')).toHaveCount(0)
    // Synthetic fixture only: shorten the saved clock to exercise expiry without
    // spending a minute per case. Navigate away before changing its checkpoint.
    await page.goto('about:blank')
    await page.goto(`/?grade=${slug}`)
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find(
        (key) => key.startsWith('family-beta-games-v1:') && key.includes(':checkpoint:'),
      )!
      const value = JSON.parse(localStorage.getItem(key)!)
      value.remainingMs = 1000
      value.revision++
      localStorage.setItem(key, JSON.stringify(value))
    })
    frame = await open(page, slug)
    await expect(frame.getByRole('button', { name: 'Restart mission' })).toBeVisible()
    expect((await checkpoint(page)).remainingMs).toBe(0)
    await frame.getByRole('button', { name: 'Restart mission' }).click()
    await expect.poll(async () => (await checkpoint(page)).cycle).toBe(1)
    expect((await checkpoint(page)).prompts).toEqual(paused.prompts)
    frame = await open(page, slug, true)
    await expect(frame.locator('.lg-moon-timer')).toHaveAttribute('aria-label', '60 seconds remaining')
    for (const pair of pairs) {
      await seal(frame, pair.left.label, isMobile)
      await seal(frame, pair.right.label, isMobile)
    }
    await frame.getByRole('button', { name: 'Back to Ninja Skills', exact: true }).click()
    await expect(frame.locator('.lg-complete')).toHaveCount(0)
    const records = await page.evaluate(() =>
      Object.fromEntries(
        Object.keys(localStorage)
          .filter((key) => key.startsWith('family-beta-games-v1:') || key.startsWith('family-beta-preview-results-v1:'))
          .map((key) => [key, JSON.parse(localStorage.getItem(key)!)]),
      ),
    )
    const results = Object.entries(records)
      .filter(([key]) => key.startsWith('family-beta-preview-results-v1:'))
      .map(([, value]) => value)
    expect(results).toEqual([
      expect.objectContaining({
        id: initial.attemptId,
        childId,
        attempted: pairs.length + 2,
        correct: pairs.length + 1,
      }),
    ])
    const completed = Object.entries(records).find(([key]) => key.includes(':completed:'))![1]
    expect(completed.result).toEqual(results[0])
    expect(completed.checkpoint.cycle).toBe(1)
    expect(completed.targets.reduce((sum: number, target: { attempted: number }) => sum + target.attempted, 0)).toBe(
      pairs.length + 2,
    )
    expect(JSON.stringify(records)).not.toContain('"response"')
  })

  test(`${grade}: Shuriken freezes failed timer saves and retries without replacing the pending operation`, async ({
    page,
    isMobile,
  }) => {
    const frame = await open(page, slug)
    const initial = await checkpoint(page)
    if (initial.pack.moduleId !== 'speed-match') throw new Error('Wrong game')
    const owner = page.frames().find((frame) => frame.url().includes('family-game.html'))!
    await owner.evaluate(() => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('family-beta-games-v1:') && key.includes(':checkpoint:'))
          throw new Error('Synthetic quota fault')
        return original.call(this, key, value)
      }
      ;(window as Window & { restoreSaving?: () => void }).restoreSaving = () => {
        Storage.prototype.setItem = original
      }
    })
    await seal(frame, initial.pack.pairs[0].left.label, isMobile)
    await expect(frame.getByRole('alert').filter({ hasText: 'mission is paused' })).toBeVisible()
    expect(await checkpoint(page)).toEqual(initial)
    await expect(frame.locator('.lg-word-seal:enabled')).toHaveCount(0)
    await page.waitForTimeout(1500)
    expect(await checkpoint(page)).toEqual(initial)
    await owner.evaluate(() => (window as Window & { restoreSaving?: () => void }).restoreSaving?.())
    await frame.getByRole('button', { name: 'Retry saving mission' }).click()
    await expect.poll(async () => (await checkpoint(page)).remainingMs).toBe(59000)
    await seal(frame, initial.pack.pairs[0].right.label, isMobile)
    await expect.poll(async () => (await checkpoint(page)).prompts[0].attempted).toBe(1)
    expect((await checkpoint(page)).cleared).toEqual([initial.pack.pairs[0].id])
    expect((await checkpoint(page)).prompts[0].correct).toBe(1)
  })
}
