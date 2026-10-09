import { expect, test, type FrameLocator, type Page } from '@playwright/test'
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
  const menu = embedded ? page.frameLocator('iframe:visible') : page
  await menu.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
  const frame = page.frameLocator('iframe:visible')
  await expect(frame.locator('.lg-memory-card').first()).toBeVisible()
  return frame
}
async function choose(frame: FrameLocator, indices: number[], mobile: boolean) {
  for (const index of indices) {
    const card = frame.locator('.lg-memory-card').nth(index)
    if (mobile) await card.tap()
    else await card.click()
  }
}
async function checkpoint(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (key) => key.startsWith('family-beta-games-v1:') && key.includes(':checkpoint:'),
    )!
    return JSON.parse(localStorage.getItem(key)!)
  })
}

for (const [slug, grade, childId] of grades) {
  test(`${grade}: Lanterns reloads reviewed turns through either menu and retains exact completed details`, async ({
    page,
    isMobile,
  }) => {
    test.setTimeout(120000)
    let frame = await open(page, slug)
    const faces = await frame.locator('.lg-card-face b').allTextContents()
    const names = [...new Set(faces)]
    const pair = (name: string) => faces.flatMap((face, i) => (face === name ? [i] : []))
    // Kindergarten may contain only two pairs: review the mismatch before
    // matching either, without inventing a third curriculum target.
    await choose(frame, [pair(names[0])[0], pair(names[1])[0]], isMobile)
    await expect(frame.locator('.lg-stat-row')).toContainText('1 turns')
    await expect(frame.locator('.lg-feedback')).toHaveCount(0)
    await choose(frame, pair(names[0]), isMobile)
    await expect(frame.locator('.is-matched')).toHaveCount(2)
    await expect(frame.locator('.lg-stat-row')).toContainText('2 turns')
    await expect(frame.locator('.lg-feedback')).toHaveCount(0)
    const saved = await checkpoint(page)
    expect(saved.prompts.reduce((sum: number, p: { attempted: number }) => sum + p.attempted, 0)).toBe(2)
    frame = await open(page, slug, true)
    await expect(frame.locator('.is-matched')).toHaveCount(2)
    await expect(frame.locator('.lg-stat-row')).toContainText('2 turns')
    expect(await checkpoint(page)).toEqual(saved)
    // Fresh mount discards unreviewed card flips but retains reviewed mistakes.
    const reloadedFaces = await frame.locator('.lg-card-face b').allTextContents()
    for (const name of names.slice(1)) {
      const indices = reloadedFaces.flatMap((face, i) => (face === name ? [i] : []))
      await choose(frame, indices, isMobile)
      if (name !== names.at(-1))
        await expect(frame.locator('.lg-memory-card').nth(indices[0])).toHaveClass(/is-matched/)
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
    const scores = Object.entries(records)
      .filter(([key]) => key.startsWith('family-beta-preview-results-v1:'))
      .map(([, value]) => value)
    expect(scores).toEqual([
      expect.objectContaining({ id: saved.attemptId, childId, correct: names.length, attempted: names.length + 1 }),
    ])
    const completion = Object.entries(records).find(([key]) => key.includes(':completed:'))![1]
    expect(completion.result).toEqual(scores[0])
    expect(completion.targets.reduce((sum: number, t: { attempted: number }) => sum + t.attempted, 0)).toBe(
      names.length + 1,
    )
    expect(JSON.stringify(records)).not.toContain('"response"')
    expect(Object.keys(records).some((key) => key.includes(':pending:'))).toBe(true)
  })

  test(`${grade}: failed Lantern turn stays still and retries under the native browser lock`, async ({
    page,
    isMobile,
  }) => {
    const frame = await open(page, slug)
    const owner = page.frames().find((item) => item.url().includes('family-game.html'))!
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
    const before = await checkpoint(page)
    const faces = await frame.locator('.lg-card-face b').allTextContents()
    const indices = faces.flatMap((face, i) => (face === faces[0] ? [i] : []))
    await choose(frame, indices, isMobile)
    await expect(frame.getByRole('alert').filter({ hasText: 'This turn has not advanced' })).toBeVisible()
    await expect(frame.locator('.is-matched')).toHaveCount(0)
    expect(await checkpoint(page)).toEqual(before)
    await owner.evaluate(() => (window as Window & { restoreSaving?: () => void }).restoreSaving?.())
    await frame.getByRole('button', { name: 'Retry saving turn', exact: true }).click()
    await expect(frame.locator('.is-matched')).toHaveCount(2)
    expect((await checkpoint(page)).revision).toBe(1)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'true')
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'false')
  })
}
