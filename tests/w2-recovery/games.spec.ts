import { expect, test, type FrameLocator, type Page } from '@playwright/test'

test.beforeEach(async ({ context }) => {
  // Competing-window cases must use the same controlled audio in both pages.
  await context.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices: () => [],
        speak(u: SpeechSynthesisUtterance) {
          u.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 10)
        },
      },
    })
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
  })
})

async function launch(page: Page, grade = 'grade2', saved = false) {
  await page.goto(`/family-beta-preview.html?grade=${grade}${saved ? '&example=game-recovery' : ''}`)
  const frame = page.frameLocator('iframe:visible')
  if (saved) {
    // The outer saved-game fixture loads a web font. Wait for its first layout
    // before targeting a card: a late font swap can move it between mouse down
    // and mouse up in WebKit, producing no click rather than a game failure.
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    if (process.env.W2_LEGACY_BASELINE === '1')
      await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
    await page
      .getByRole('button', { name: /^(Resume )?Memory Lanterns$/ })
      .last()
      .click()
  } else {
    await frame.getByRole('button', { name: /Practice.*Ninja Skills/i }).click()
    await frame.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
  }
  return frame
}
async function pair(frame: FrameLocator, ordinal = 0) {
  const cards = frame.locator('.lg-memory-card:not(.is-matched)')
  await expect(cards.first()).toBeEnabled()
  const faces = await cards.locator('.lg-card-face b').allTextContents()
  const face = [...new Set(faces)][ordinal]
  const indices = faces.flatMap((text, i) => (text === face ? [i] : []))
  expect(indices).toHaveLength(2)
  await cards.nth(indices[0]).click()
  await cards.nth(indices[1]).click()
}
async function storage(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('family-beta-games-v1:'))),
  )
}

for (const grade of ['kindergarten', 'grade2', 'grade5']) {
  test(`${grade}: ordinary Lanterns completes mismatches, repeated pairs, report pause and two rounds`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const frame = await launch(page, grade)
    for (let round = 0; round < 2; round++) {
      const cards = frame.locator('.lg-memory-card')
      await expect(cards.first()).toBeEnabled()
      const faces = await cards.locator('.lg-card-face b').allTextContents()
      const miss = faces.findIndex((value) => value !== faces[0])
      await cards.first().click()
      await cards.nth(miss).click()
      await expect(frame.locator('.lg-memory-card.is-visible')).toHaveCount(0)
      // Pause a single revealed card, so the mismatch animation cannot finish
      // before the report dialog opens on a busy browser.
      await cards.first().click()
      await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Close and return', exact: true })).toBeVisible()
      await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'true')
      // A stale queued event must not flip a third card while reporting.
      await cards
        .nth(miss + 1 < faces.length ? miss + 1 : 0)
        .evaluate((el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
      await expect(frame.locator('.lg-memory-card.is-visible')).toHaveCount(1)
      await page.getByRole('button', { name: 'Close and return', exact: true }).click()
      await cards.nth(miss).click()
      await expect(frame.locator('.lg-memory-card.is-visible')).toHaveCount(0)
      await expect(cards.first()).toBeEnabled()
      for (let count = 0; count < new Set(faces).size; count++) {
        await pair(frame)
        if (count < new Set(faces).size - 1) await expect(frame.locator('.is-matched')).toHaveCount((count + 1) * 2)
      }
      await frame.getByRole('button', { name: /Back to Ninja Skills/ }).click()
      await expect(frame.getByRole('button', { name: 'Memory Lanterns', exact: true })).toBeVisible()
      if (round === 0) await frame.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
    }
    expect(await storage(page)).toEqual({}) // No new resumable-game policy for ordinary play.
    expect(errors).toEqual([])
  })

  test(`${grade}: saved Lanterns retries a failed write, exits, resumes after reload and discards only that run`, async ({
    page,
  }) => {
    const frame = await launch(page, grade, true)
    await expect(frame.locator('.lg-memory-card').first()).toBeVisible()
    const before = await storage(page)
    await frame.locator('body').evaluate(() => {
      const set = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('family-beta-games-v1:') && key.includes(':checkpoint:'))
          throw new Error('Synthetic storage refusal')
        return set.call(this, key, value)
      }
      ;(window as Window & { restoreStorage?: () => void }).restoreStorage = () => {
        Storage.prototype.setItem = set
      }
    })
    await pair(frame)
    await expect(frame.getByRole('button', { name: 'Retry saving turn' })).toBeVisible()
    expect(await storage(page)).toEqual(before)
    await frame.locator('body').evaluate(() => (window as Window & { restoreStorage?: () => void }).restoreStorage?.())
    await frame.getByRole('button', { name: 'Retry saving turn' }).click()
    await expect(frame.locator('.is-matched')).toHaveCount(2)
    await pair(frame)
    await expect(frame.locator('.is-matched')).toHaveCount(4)
    await frame.getByRole('button', { name: 'Exit learning module' }).click()
    await expect(page.getByRole('heading', { name: 'Your paused work' })).toBeVisible()
    await page.getByRole('button', { name: 'Resume Memory Lanterns', exact: true }).first().click()
    await expect(frame.locator('.is-matched')).toHaveCount(4)
    await page.reload()
    await page.getByRole('button', { name: 'Resume Memory Lanterns', exact: true }).click()
    await expect(frame.locator('.is-matched')).toHaveCount(4)
    const saved = await storage(page)
    await frame.getByRole('button', { name: 'Exit learning module' }).click()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Discard unfinished Memory Lanterns', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Your paused work' })).toBeHidden()
    const after = await storage(page)
    expect(Object.keys(after).filter((key) => key.includes(':checkpoint:'))).toHaveLength(0)
    expect(Object.keys(after).filter((key) => key.includes(':retirement:'))).toHaveLength(1)
    expect(Object.keys(saved).filter((key) => key.includes(':checkpoint:'))).toHaveLength(1)
    await page.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
    await expect(frame.locator('.lg-memory-card').first()).toBeVisible()
    await expect(frame.locator('.is-matched')).toHaveCount(0)
  })
}

test('live second window is blocked; closing the first releases ownership without clearing records', async ({
  page,
  context,
}) => {
  const first = await launch(page, 'grade5', true)
  await pair(first)
  await expect(first.locator('.is-matched')).toHaveCount(2)
  const saved = await storage(page)
  const other = await context.newPage()
  await other.bringToFront()
  const second = await launch(other, 'grade5', true)
  await expect(second.getByRole('alert')).toContainText('open in another window')
  expect(await storage(other)).toEqual(saved)
  await second.getByRole('button', { name: 'Retry opening saved game' }).click()
  await expect(second.getByRole('alert')).toContainText('open in another window')
  await page.close()
  await other.bringToFront()
  // WebKit's page-close acknowledgement can precede native lock cleanup.
  // Observe release without stealing or modifying the lock or saved records.
  await expect
    .poll(async () =>
      other.evaluate(
        async () =>
          (await navigator.locks.query()).held!.filter((lock) => lock.name!.startsWith('ninja-game-view-v1:')).length,
      ),
    )
    .toBe(0)
  await second.getByRole('button', { name: 'Retry opening saved game' }).click()
  await expect(second.locator('.is-matched')).toHaveCount(2)
  await pair(second)
  await expect(second.locator('.is-matched')).toHaveCount(4)
})

test('failed opening can return and discard its own saved checkpoint without loading the game', async ({ page }) => {
  const frame = await launch(page, 'grade2', true)
  await pair(frame)
  await expect(frame.locator('.is-matched')).toHaveCount(2)
  await page.reload()
  if (process.env.W2_LEGACY_BASELINE === '1')
    await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
  await page.addInitScript(() => {
    if (location.pathname.endsWith('/family-game.html')) {
      const set = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('family-beta-games-v1:') && key.includes(':checkpoint:'))
          throw new Error('Synthetic opening failure')
        return set.call(this, key, value)
      }
    }
  })
  await page.getByRole('button', { name: 'Resume Memory Lanterns' }).click()
  await expect(frame.getByRole('alert')).toContainText('Synthetic opening failure')
  await frame.getByRole('button', { name: 'Return to games' }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Discard unfinished Memory Lanterns' }).click()
  await expect(page.getByRole('heading', { name: 'Your paused work' })).toBeHidden()
  expect(Object.keys(await storage(page)).filter((key) => key.includes(':checkpoint:'))).toHaveLength(0)
})

test('a conflicting saved turn can reopen safely without losing the newer confirmed pair', async ({ page }) => {
  const frame = await launch(page, 'grade5', true)
  await pair(frame)
  await expect(frame.locator('.is-matched')).toHaveCount(2)
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (key) => key.startsWith('family-beta-games-v1:') && key.includes(':checkpoint:'),
    )!
    const value = JSON.parse(localStorage.getItem(key)!)
    // Model a synchronized second-device copy without fabricating correctness.
    value.writerId = 'synthetic-other-device'
    value.attemptId = 'synthetic-other-attempt'
    value.revision++
    localStorage.setItem(key, JSON.stringify(value))
  })
  const changed = await storage(page)
  await pair(frame)
  await expect(frame.getByRole('alert').filter({ hasText: 'another tab' })).toBeVisible()
  expect(await storage(page)).toEqual(changed)
  await frame.getByRole('button', { name: 'Reopen saved turns', exact: true }).click()
  await expect(frame.locator('.is-matched')).toHaveCount(2)
  await pair(frame)
  await expect(frame.locator('.is-matched')).toHaveCount(4)
})

test('completed Lantern results remain byte-identical after a later unfinished round is discarded', async ({
  page,
}) => {
  const frame = await launch(page, 'grade2', true)
  await expect(frame.locator('.lg-memory-card').first()).toBeEnabled()
  const total = (await frame.locator('.lg-memory-card').count()) / 2
  for (let index = 0; index < total; index++) {
    await pair(frame)
    if (index < total - 1) await expect(frame.locator('.is-matched')).toHaveCount((index + 1) * 2)
  }
  await frame.getByRole('button', { name: 'Back to Ninja Skills', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Practice your Ninja Skills' })).toBeVisible()
  const results = () =>
    page.evaluate(() =>
      Object.fromEntries(
        Object.entries(localStorage).filter(
          ([key]) => key.includes(':completed:') || key.startsWith('family-beta-preview-results-v1:'),
        ),
      ),
    )
  const completed = await results()
  expect(Object.keys(completed)).toHaveLength(2)
  await page.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
  await pair(frame)
  await expect(frame.locator('.is-matched')).toHaveCount(2)
  await frame.getByRole('button', { name: 'Exit learning module', exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Discard unfinished Memory Lanterns' }).click()
  await expect(page.getByRole('heading', { name: 'Your paused work' })).toBeHidden()
  expect(await results()).toEqual(completed)
})
