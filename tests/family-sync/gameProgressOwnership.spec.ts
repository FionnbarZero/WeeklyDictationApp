import { expect, test, type Page } from '@playwright/test'
import { installFamilyFixtures, type SyntheticFamilyDocuments } from './fixtures.ts'

async function launch(page: Page) {
  await page.goto('/?grade=grade5')
  await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
  await page.getByRole('button', { name: /^(Resume )?Memory Lanterns$/ }).click()
  const frame = page.frameLocator('iframe:visible')
  await expect(frame.locator('.lg-memory-card').first()).toBeVisible()
  return frame
}

test('native family lock serializes competing Lantern tabs without overwriting a reviewed turn', async ({
  page,
  context,
  isMobile,
}) => {
  const documents: SyntheticFamilyDocuments = new Map()
  await installFamilyFixtures(page, documents)
  const first = await launch(page)
  const secondPage = await context.newPage()
  await installFamilyFixtures(secondPage, documents)
  const second = await launch(secondPage)
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
  for (const [frame, pairIndex] of [
    [first, 0],
    [second, 1],
  ] as const) {
    const cards = frame.locator('.lg-memory-card')
    const faces = await cards.locator('.lg-card-face b').allTextContents()
    const face = [...new Set(faces)][pairIndex]
    for (const index of faces.flatMap((value, i) => (value === face ? [i] : []))) {
      if (isMobile) await cards.nth(index).tap()
      else await cards.nth(index).click()
    }
    await expect(frame.getByText('Saving this turn…', { exact: true })).toBeVisible()
  }
  await page.evaluate(() => (window as Window & { releaseGameLock?: () => void }).releaseGameLock?.())
  await expect(second.getByRole('alert').filter({ hasText: 'another tab' })).toBeVisible()
  const saved = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (key) => key.startsWith('family-beta-games-v1:') && key.includes(':checkpoint:'),
    )!
    return localStorage.getItem(key)!
  })
  expect(JSON.parse(saved).revision).toBe(1)
  expect(JSON.parse(saved).cleared).toHaveLength(1)
  await second.getByRole('button', { name: 'Retry saving turn', exact: true }).click()
  await expect(second.getByRole('alert').filter({ hasText: 'another tab' })).toBeVisible()
  expect(
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find(
        (key) => key.startsWith('family-beta-games-v1:') && key.includes(':checkpoint:'),
      )!
      return localStorage.getItem(key)
    }),
  ).toBe(saved)
})

test('explicit Lantern discard removes only its owned unfinished checkpoint', async ({ page }) => {
  await installFamilyFixtures(page)
  const frame = await launch(page)
  const faces = await frame.locator('.lg-card-face b').allTextContents()
  for (const index of faces.flatMap((value, i) => (value === faces[0] ? [i] : [])))
    await frame.locator('.lg-memory-card').nth(index).click()
  await expect(frame.locator('.is-matched')).toHaveCount(2)
  await frame.getByRole('button', { name: 'Exit learning module', exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Discard unfinished Memory Lanterns', exact: true }).click()
  await expect(page.locator('iframe[title="Memory Lanterns"]')).toHaveCount(0)
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter(
        (key) => key.startsWith('family-beta-games-v1:') && key.includes(':checkpoint:'),
      ),
    ),
  ).toEqual([])
  await page.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
  await expect(page.frameLocator('iframe:visible').locator('.lg-memory-card').first()).toBeVisible()
  await expect(page.frameLocator('iframe:visible').locator('.is-matched')).toHaveCount(0)
})

test('an unfinished Lantern round reopens from device storage after an offline cold start', async ({ page, context }) => {
  await installFamilyFixtures(page)
  await page.goto('/?grade=grade5')
  await expect(page.locator('[data-offline-shell-status]')).toContainText('Offline app ready', { timeout: 120_000 })
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
  await page.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
  const cards = page.frameLocator('iframe:visible').locator('.lg-memory-card')
  await expect(cards.first()).toBeVisible()
  const faces = await cards.locator('.lg-card-face b').allTextContents()
  const indices = faces.flatMap((value, index) => (value === faces[0] ? [index] : []))
  await cards.nth(indices[0]).click()
  await cards.nth(indices[1]).click()
  await expect(cards.nth(indices[0])).toHaveClass(/is-matched/)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText(/Offline: using this parent’s previously confirmed device records/)).toBeVisible()
  await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Resume Memory Lanterns', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Resume Memory Lanterns', exact: true }).click()
  await expect(page.frameLocator('iframe:visible').locator('.is-matched')).toHaveCount(2)
  await context.setOffline(false)
})

test('offline Lantern completion queues graph and detail separately and only acknowledges the graph on reconnect', async ({
  page,
  context,
  isMobile,
}) => {
  const documents: SyntheticFamilyDocuments = new Map()
  await installFamilyFixtures(page, documents)
  const frame = await launch(page)
  await context.setOffline(true)
  const cards = frame.locator('.lg-memory-card')
  const faces = await cards.locator('.lg-card-face b').allTextContents()
  const names = [...new Set(faces)]
  for (const name of names) {
    const indices = faces.flatMap((face, i) => (face === name ? [i] : []))
    for (const index of indices) {
      if (isMobile) await cards.nth(index).tap()
      else await cards.nth(index).click()
    }
    if (name !== names.at(-1)) await expect(cards.nth(indices[0])).toHaveClass(/is-matched/)
  }
  await frame.getByRole('button', { name: 'Back to Ninja Skills', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Practice your Ninja Skills', exact: true })).toBeVisible()
  const pending = () =>
    page.evaluate(() => {
      const keys = Object.keys(localStorage)
      return {
        graph: keys.filter((key) => key.startsWith('family-beta-preview-pending-v1:')).length,
        detail: keys.filter((key) => key.startsWith('family-beta-games-v1:') && key.includes(':pending:')).length,
        results: keys
          .filter((key) => key.startsWith('family-beta-preview-results-v1:'))
          .map((key) => JSON.parse(localStorage.getItem(key)!)),
      }
    })
  expect(await pending()).toMatchObject({
    graph: 1,
    detail: 1,
    results: [expect.objectContaining({ correct: names.length, attempted: names.length })],
  })
  await context.setOffline(false)
  await expect.poll(async () => (await pending()).graph).toBe(0)
  await expect.poll(async () => (await pending()).detail).toBe(0)
  expect([...documents.keys()].filter((key) => key.includes('/betaResults/'))).toHaveLength(1)
  expect([...documents.keys()].filter((key) => key.includes('/betaGameCompletions/'))).toHaveLength(1)
})
