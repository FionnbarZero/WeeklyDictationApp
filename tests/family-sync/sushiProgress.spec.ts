import { expect, test, type FrameLocator, type Page } from '@playwright/test'
import type { GameCheckpoint } from '../../src/ninjaSkills/progress.ts'
import type { SequenceGameRound } from '../../src/learningModules/sushi-scramble/runtime/contracts.ts'
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
    .getByRole('button', { name: 'Sushi Scramble', exact: true })
    .click()
  const frame = page.frameLocator('iframe:visible')
  await expect(frame.getByRole('heading', { name: 'Sushi Scramble', exact: true })).toBeVisible()
  return frame
}

async function checkpoint(page: Page): Promise<GameCheckpoint> {
  return page.evaluate(() => {
    const values = Object.keys(localStorage)
      .filter((key) => key.startsWith('family-beta-games-v1:') && key.includes(':checkpoint:'))
      .map((key) => JSON.parse(localStorage.getItem(key)!))
    return values.find((value) => value.scope.gameId === 'sentence-scramble')
  })
}

async function answer(frame: FrameLocator, round: SequenceGameRound, mobile: boolean, ids = round.correctTokenIds) {
  for (const [index, id] of ids.entries()) {
    const token = round.tokens.find((token) => token.id === id)!
    const button = frame
      .locator('.lg-sushi-bar')
      .getByRole('button', { name: `Place ${token.label} in sentence position ${index + 1}`, exact: true })
      .and(frame.locator('button:enabled'))
      .first()
    if (mobile) await button.tap()
    else await button.click()
  }
}

for (const [slug, grade, childId] of grades) {
  test(`${grade}: Sushi restores only reviewed work across menus and saves exact details`, async ({
    page,
    isMobile,
  }) => {
    test.setTimeout(120000)
    let frame = await open(page, slug)
    const initial = await checkpoint(page)
    expect(initial).toBeTruthy()
    if (initial.pack.moduleId !== 'sentence-scramble') throw new Error('Wrong saved game')
    const rounds = initial.pack.rounds
    // An incomplete plate is deliberately not durable.
    await answer(frame, rounds[0], isMobile, rounds[0].correctTokenIds.slice(0, 1))
    await expect(frame.locator('.lg-sushi-plate button')).toHaveCount(1)
    expect(await checkpoint(page)).toEqual(initial)
    frame = await open(page, slug, true)
    await expect(frame.locator('.lg-sushi-plate button')).toHaveCount(0)
    expect(await checkpoint(page)).toEqual(initial)

    const wrong = [...rounds[0].correctTokenIds]
    const different = wrong.findIndex(
      (id) =>
        rounds[0].tokens.find((t) => t.id === id)!.label !== rounds[0].tokens.find((t) => t.id === wrong[0])!.label,
    )
    expect(different).toBeGreaterThan(0)
    ;[wrong[0], wrong[different]] = [wrong[different], wrong[0]]
    await answer(frame, rounds[0], isMobile, wrong)
    await expect.poll(async () => (await checkpoint(page)).revision).toBe(1)
    const mistaken = await checkpoint(page)
    expect(mistaken.prompts[0]).toMatchObject({ attempted: 1, correct: 0 })
    frame = await open(page, slug)
    expect(await checkpoint(page)).toEqual(mistaken)
    await answer(frame, rounds[0], isMobile)
    await expect.poll(async () => (await checkpoint(page)).cleared.length).toBe(1)
    const cleared = await checkpoint(page)
    // Reload immediately after confirmation, even if feedback is still visible.
    frame = await open(page, slug, true)
    expect(await checkpoint(page)).toEqual(cleared)
    for (const [index, round] of rounds.entries()) {
      if (!index) continue
      await expect(frame.locator('.lg-round-label')).toHaveText(`Sentence ${index + 1} of ${rounds.length}`)
      await answer(frame, round, isMobile)
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
      expect.objectContaining({ id: initial.attemptId, childId, attempted: rounds.length + 1, correct: rounds.length }),
    ])
    const completed = Object.entries(records).find(([key]) => key.includes(':completed:'))![1]
    expect(completed.result).toEqual(results[0])
    expect(completed.targets.reduce((sum: number, target: { attempted: number }) => sum + target.attempted, 0)).toBe(
      rounds.length + 1,
    )
    expect(JSON.stringify(records)).not.toContain('"response"')
  })

  test(`${grade}: Sushi holds a failed save, pauses reporting and retries without duplicate turns`, async ({
    page,
    isMobile,
  }) => {
    const frame = await open(page, slug)
    const before = await checkpoint(page)
    expect(before).toBeTruthy()
    if (before.pack.moduleId !== 'sentence-scramble') throw new Error('Wrong saved game')
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
    await answer(frame, before.pack.rounds[0], isMobile)
    await expect(frame.getByRole('alert').filter({ hasText: 'This turn has not advanced' })).toBeVisible()
    expect(await checkpoint(page)).toEqual(before)
    await expect(frame.getByRole('button', { name: 'Clear plate', exact: true })).toBeDisabled()
    await expect(frame.locator('.lg-complete')).toHaveCount(0)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'true')
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await owner.evaluate(() => (window as Window & { restoreSaving?: () => void }).restoreSaving?.())
    await frame.getByRole('button', { name: 'Retry saving turn', exact: true }).click()
    await expect.poll(async () => (await checkpoint(page)).revision).toBe(1)
    expect((await checkpoint(page)).prompts[0]).toMatchObject({ attempted: 1, correct: 1 })
    const restored = await open(page, slug, true)
    await expect(restored.getByRole('alert').filter({ hasText: 'This turn has not advanced' })).toHaveCount(0)
    expect((await checkpoint(page)).cleared).toEqual([before.pack.rounds[0].id])
  })
}
