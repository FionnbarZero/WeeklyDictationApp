import { expect, test, type FrameLocator, type Page } from '@playwright/test'
import type { GameCheckpoint } from '../../src/ninjaSkills/progress.ts'
import type { ContextGameRound } from '../../src/learningModules/context-gap-dash/runtime/contracts.ts'
import { grades, installFamilyFixtures } from './fixtures.ts'

test.beforeEach(async ({ page }) => {
  await installFamilyFixtures(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

async function open(page: Page, slug: string, embedded = false) {
  await page.goto(`/?grade=${slug}`)
  if (embedded)
    await page
      .frameLocator('iframe:visible')
      .getByRole('button', { name: /Practice your Ninja Skills/ })
      .click()
  else await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
  await (embedded ? page.frameLocator('iframe:visible') : page)
    .getByRole('button', { name: 'Context Gap Dash', exact: true })
    .click()
  const frame = page.frameLocator('iframe:visible')
  await expect(frame.getByRole('heading', { name: 'Context Gap Dash', exact: true })).toBeVisible()
  return frame
}

async function checkpoint(page: Page): Promise<GameCheckpoint> {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('family-beta-games-v1:') && key.includes(':checkpoint:'))
      .map((key) => JSON.parse(localStorage.getItem(key)!))
      .find((value) => value.scope.gameId === 'context-gap-dash'),
  )
}

async function answer(frame: FrameLocator, round: ContextGameRound, mobile: boolean, correct = true) {
  await expect(frame.locator('.lg-dash-context-clue strong')).toHaveText(round.cueText!)
  const index = round.choices.findIndex((choice) => (choice.id === round.correctChoiceId) === correct)
  const choice = frame.locator(mobile ? '.lg-mobile-gate-choices button' : '.lg-canvas-access button').nth(index)
  await expect(choice).toBeEnabled()
  if (mobile) await choice.tap()
  else await frame.locator('canvas').press(String(index + 1))
}

for (const [slug, grade, childId] of grades) {
  test(`${grade}: Context restores a reviewed mistake and completed gates without replaying them`, async ({
    page,
    isMobile,
  }) => {
    test.setTimeout(120000)
    let frame = await open(page, slug)
    const initial = await checkpoint(page)
    expect(initial).toBeTruthy()
    if (initial.pack.moduleId !== 'context-gap-dash') throw new Error('Wrong saved game')
    const rounds = initial.pack.rounds
    await answer(frame, rounds[0], isMobile, false)
    await expect.poll(async () => (await checkpoint(page)).revision).toBe(1)
    const saved = await checkpoint(page)
    expect(saved.cleared).toEqual([rounds[0].id])
    expect(saved.prompts[0]).toMatchObject({ attempted: 1, correct: 0 })
    frame = await open(page, slug, true)
    expect(await checkpoint(page)).toEqual(saved)
    for (const round of rounds.slice(1)) await answer(frame, round, isMobile)
    await expect(frame.getByRole('button', { name: 'Celebrate and finish', exact: true })).toBeVisible()
    const final = await checkpoint(page)
    // A completed detail is durable before the user leaves the finish screen.
    frame = await open(page, slug)
    expect(await checkpoint(page)).toEqual(final)
    await frame.getByRole('button', { name: 'Celebrate and finish', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Practice your Ninja Skills', exact: true })).toBeVisible()
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
      expect.objectContaining({ id: initial.attemptId, childId, attempted: rounds.length, correct: rounds.length - 1 }),
    ])
    const completed = Object.entries(records).find(([key]) => key.includes(':completed:'))![1]
    expect(completed.result).toEqual(results[0])
    expect(completed.targets.reduce((sum: number, target: { correct: number }) => sum + target.correct, 0)).toBe(
      rounds.length - 1,
    )
    expect(JSON.stringify(records)).not.toContain('"response"')
  })

  test(`${grade}: Context keeps the failed gate locked until an exact retry succeeds`, async ({ page, isMobile }) => {
    const frame = await open(page, slug)
    const before = await checkpoint(page)
    if (before.pack.moduleId !== 'context-gap-dash') throw new Error('Wrong saved game')
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
    await answer(frame, before.pack.rounds[0], isMobile, false)
    await expect(frame.getByRole('alert').filter({ hasText: 'This turn has not advanced' })).toBeVisible()
    expect(await checkpoint(page)).toEqual(before)
    await expect(frame.locator('.lg-mobile-gate-choices button:enabled')).toHaveCount(0)
    await expect(frame.locator('.lg-canvas-access button:enabled')).toHaveCount(0)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'true')
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await owner.evaluate(() => (window as Window & { restoreSaving?: () => void }).restoreSaving?.())
    await frame.getByRole('button', { name: 'Retry saving turn', exact: true }).click()
    await expect.poll(async () => (await checkpoint(page)).revision).toBe(1)
    const saved = await checkpoint(page)
    expect(saved.prompts[0]).toMatchObject({ attempted: 1, correct: 0 })
    expect(saved.cleared).toEqual([before.pack.rounds[0].id])
    await open(page, slug, true)
    expect(await checkpoint(page)).toEqual(saved)
  })
}
