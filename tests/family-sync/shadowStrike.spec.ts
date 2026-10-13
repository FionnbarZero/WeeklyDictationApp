import { expect, type FrameLocator, type Page, test } from '@playwright/test'
import type { GameCheckpoint } from '../../src/ninjaSkills/progress.ts'
import { grades, installFamilyFixtures, type SyntheticFamilyDocuments } from './fixtures.ts'

async function open(page: Page, slug = 'grade5', embedded = false) {
  await page.goto(`http://127.0.0.1:5193/?grade=${slug}`)
  const menu = embedded ? page.frameLocator('iframe:visible') : page
  if (embedded) await menu.getByRole('button', { name: /Practice your Ninja Skills/ }).click()
  else await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
  await menu.getByRole('button', { name: /^(Resume )?Shadow Strike Dojo$/ }).click()
  const frame = page.frameLocator('iframe:visible')
  await expect(frame.locator('.lg-world-choice').first()).toBeEnabled({ timeout: 30000 })
  return frame
}

async function checkpoint(page: Page): Promise<GameCheckpoint> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (key) =>
        key.startsWith('family-beta-games-v1:') &&
        key.includes(':checkpoint:') &&
        JSON.parse(localStorage.getItem(key)!).scope.gameId === 'target-blast',
    )!
    return JSON.parse(localStorage.getItem(key)!)
  })
}

async function strike(frame: FrameLocator, choiceId: string, mobile: boolean) {
  const choice = frame.locator(`[data-choice-id="${choiceId}"]`)
  await expect(choice).toBeEnabled({ timeout: 30000 })
  if (mobile) await choice.tap()
  else await choice.click()
}

async function records(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage)
        .filter((key) => key.startsWith('family-beta-games-v1:') || key.startsWith('family-beta-preview-results-v1:'))
        .map((key) => [key, JSON.parse(localStorage.getItem(key)!)]),
    ),
  )
}

for (const [slug, grade, childId] of grades) {
  test(`${grade}: Shadow Strike restores errors across both menus, finishes offline and recovers exact cloud details`, async ({
    page,
    context,
    browser,
    isMobile,
  }) => {
    test.setTimeout(120000)
    const documents: SyntheticFamilyDocuments = new Map()
    await installFamilyFixtures(page, documents)
    let frame = await open(page, slug)
    const initial = await checkpoint(page)
    expect(initial.pack.moduleId).toBe('target-blast')
    if (initial.pack.moduleId !== 'target-blast') throw new Error('Wrong fixture.')
    const rounds = initial.pack.rounds
    for (const round of rounds) {
      expect(initial.pack.cohort.terms.find((term) => term.occurrenceId === round.targetId)?.tier).toBe('tier-2')
      for (const choice of round.choices)
        expect(initial.pack.cohort.terms.find((term) => `choice:${term.occurrenceId}` === choice.id)?.tier).toBe(
          'tier-2',
        )
    }
    const wrong = rounds[0].choices.find((choice) => choice.id !== rounds[0].correctChoiceId)!
    await strike(frame, wrong.id, isMobile)
    await expect.poll(async () => (await checkpoint(page)).revision).toBe(1)
    await expect(frame.locator('.lg-feedback')).toContainText('Correct target:')
    await expect(frame.locator('.lg-round-label')).toHaveText(`Training strike 1 of ${rounds.length}`)
    const saved = await checkpoint(page)
    expect(saved.cleared).toEqual([])
    expect(saved.prompts[0]).toMatchObject({ attempted: 1, correct: 0 })
    // Navigation drops only provisional animation; the reviewed error remains.
    frame = await open(page, slug, true)
    expect(await checkpoint(page)).toEqual(saved)
    await expect(frame.locator('.lg-round-label')).toHaveText(`Training strike 1 of ${rounds.length}`)
    await context.setOffline(true)
    for (const [index, round] of rounds.entries()) {
      await expect(frame.locator('.lg-round-label')).toHaveText(`Training strike ${index + 1} of ${rounds.length}`, {
        timeout: 30000,
      })
      await strike(frame, round.correctChoiceId, isMobile)
      await expect
        .poll(async () => (await checkpoint(page)).cleared)
        .toEqual(rounds.slice(0, index + 1).map((prompt) => prompt.id))
    }
    await expect(frame.getByRole('heading', { name: 'Master rank reached!', exact: true })).toBeVisible()
    await expect(frame.locator('.lg-complete-stats')).toContainText('1 learning retries')
    await frame.getByRole('button', { name: 'Celebrate and return', exact: true }).click()
    // The shared write lock commits asynchronously; clicking alone is not
    // evidence that the score or navigation callback has been saved.
    await expect(frame.getByRole('button', { name: 'Celebrate and return', exact: true })).toHaveCount(0)
    const savedRecords = await records(page)
    const scores = Object.entries(savedRecords)
      .filter(([key]) => key.startsWith('family-beta-preview-results-v1:'))
      .map(([, value]) => value)
    expect(scores).toEqual([
      expect.objectContaining({
        childId,
        grade,
        activity: 'Shadow Strike Dojo',
        correct: rounds.length,
        attempted: rounds.length + 1,
      }),
    ])
    const completion = Object.entries(savedRecords).find(([key]) => key.includes(':completed:'))![1]
    expect(completion.result).toEqual(scores[0])
    expect(completion.targets.every((target: { tier: string }) => target.tier === 'tier-2')).toBe(true)
    expect(JSON.stringify(savedRecords)).not.toContain('"response"')
    expect(Object.keys(savedRecords).some((key) => key.includes(':pending:'))).toBe(true)
    await context.setOffline(false)
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await expect
      .poll(async () => Object.keys(await records(page)).filter((key) => key.includes(':pending:')).length, {
        timeout: 30000,
      })
      .toBe(0)
    await expect.poll(() => [...documents.keys()].filter((key) => key.includes('/betaGameCompletions/')).length).toBe(1)
    const freshContext = await browser.newContext()
    try {
      const fresh = await freshContext.newPage()
      await installFamilyFixtures(fresh, documents)
      await fresh.goto(`http://127.0.0.1:5193/?grade=${slug}`)
      await fresh.getByRole('button', { name: 'Progress', exact: true }).click()
      await expect(
        fresh.getByRole('cell', { name: `${rounds.length} / ${rounds.length + 1}`, exact: true }),
      ).toBeVisible()
      await expect
        .poll(async () => Object.entries(await records(fresh)).find(([key]) => key.includes(':completed:'))?.[1])
        .toEqual(completion)
    } finally {
      await freshContext.close()
    }
  })
}

test('Shadow Strike holds a failed save without feedback and retries exactly once', async ({ page, isMobile }) => {
  await installFamilyFixtures(page)
  const frame = await open(page)
  const before = await checkpoint(page)
  if (before.pack.moduleId !== 'target-blast') throw new Error('Wrong fixture.')
  const owner = page.frames().find((frame) => frame.url().includes('family-game.html'))!
  await owner.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('family-beta-games-v1:') && key.includes(':checkpoint:'))
        throw new Error('Synthetic quota fault')
      original.call(this, key, value)
    }
    ;(window as Window & { restoreSaving?: () => void }).restoreSaving = () => {
      Storage.prototype.setItem = original
    }
  })
  await strike(frame, before.pack.rounds[0].correctChoiceId, isMobile)
  await expect(frame.getByRole('alert')).toContainText('This strike has not advanced')
  await expect(frame.locator('.lg-target-blast-playfield')).toHaveClass(/phase-saving/)
  await expect(frame.locator('.lg-world-choice.is-correct')).toHaveCount(0)
  await expect(frame.locator('.lg-world-choice:enabled')).toHaveCount(0)
  expect(await checkpoint(page)).toEqual(before)
  await owner.evaluate(() => (window as Window & { restoreSaving?: () => void }).restoreSaving?.())
  await frame.getByRole('button', { name: 'Retry saving strike', exact: true }).click()
  await expect(frame.locator('.lg-round-label')).toHaveText(`Training strike 2 of ${before.pack.rounds.length}`)
  const saved = await checkpoint(page)
  expect(saved.revision).toBe(1)
  expect(saved.prompts[0]).toMatchObject({ attempted: 1, correct: 1 })
})

test('Shadow Strike report pause holds a confirmed save and pauses feedback movement', async ({ page, isMobile }) => {
  await installFamilyFixtures(page)
  const frame = await open(page)
  const before = await checkpoint(page)
  if (before.pack.moduleId !== 'target-blast') throw new Error('Wrong fixture.')
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
  await strike(frame, before.pack.rounds[0].correctChoiceId, isMobile)
  await expect(frame.locator('.lg-target-blast-playfield')).toHaveClass(/phase-saving/)
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'true')
  await page.evaluate(() => (window as Window & { releaseGameLock?: () => void }).releaseGameLock?.())
  await expect.poll(async () => (await checkpoint(page)).revision).toBe(1)
  await page.waitForTimeout(1500)
  await expect(frame.locator('.lg-target-blast-playfield')).toHaveClass(/phase-saving/)
  await expect(frame.locator('.lg-world-choice.is-correct')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await expect(frame.locator('.lg-target-blast-playfield')).toHaveClass(/phase-impact/)
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'true')
  await page.waitForTimeout(1500)
  await expect(frame.locator('.lg-target-blast-playfield')).toHaveClass(/phase-impact/)
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await expect(frame.locator('.lg-round-label')).toHaveText(`Training strike 2 of ${before.pack.rounds.length}`)
  expect((await checkpoint(page)).revision).toBe(1)
})

test('Shadow Strike resumes on a second device and returns the newest reviewed checkpoint', async ({
  page,
  browser,
  isMobile,
}) => {
  const documents: SyntheticFamilyDocuments = new Map()
  await installFamilyFixtures(page, documents)
  const frame = await open(page)
  const first = await checkpoint(page)
  if (first.pack.moduleId !== 'target-blast') throw new Error('Wrong fixture.')
  await strike(frame, first.pack.rounds[0].correctChoiceId, isMobile)
  await expect.poll(async () => (await checkpoint(page)).cleared.length).toBe(1)
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect.poll(() => [...documents.keys()].filter((key) => key.includes('/betaGameCheckpoints/')).length).toBe(1)
  const secondContext = await browser.newContext()
  try {
    const second = await secondContext.newPage()
    await installFamilyFixtures(second, documents)
    const secondFrame = await open(second)
    await expect(secondFrame.locator('.lg-round-label')).toHaveText(`Training strike 2 of ${first.pack.rounds.length}`)
    const continued = await checkpoint(second)
    expect(continued.pack).toEqual(first.pack)
    expect(continued.runId).toBe(first.runId)
    expect(continued.attemptId).not.toBe(first.attemptId)
    await strike(secondFrame, first.pack.rounds[1].correctChoiceId, false)
    await expect.poll(async () => (await checkpoint(second)).cleared.length).toBe(2)
    await second.getByRole('button', { name: 'Progress', exact: true }).click()
    await expect
      .poll(() =>
        [...documents.entries()]
          .filter(([key]) => key.includes('/betaGameCheckpoints/'))
          .map(([, value]) => JSON.parse((value.fields.payload as { stringValue: string }).stringValue).cleared.length),
      )
      .toEqual([2])
    const returned = await open(page)
    await expect(returned.locator('.lg-round-label')).toHaveText(`Training strike 3 of ${first.pack.rounds.length}`)
    expect((await checkpoint(page)).cleared).toEqual(first.pack.rounds.slice(0, 2).map((round) => round.id))
  } finally {
    await secondContext.close()
  }
})

for (const offline of [false, true]) {
  test(`Shadow Strike explicit discard retires only its owned unfinished round (${offline ? 'offline then reconnect' : 'online'})`, async ({
    page,
    context,
    isMobile,
  }) => {
    const documents: SyntheticFamilyDocuments = new Map()
    await installFamilyFixtures(page, documents)
    const frame = await open(page)
    const first = await checkpoint(page)
    if (first.pack.moduleId !== 'target-blast') throw new Error('Wrong fixture.')
    await strike(frame, first.pack.rounds[0].correctChoiceId, isMobile)
    await expect.poll(async () => (await checkpoint(page)).cleared.length).toBe(1)
    if (offline) await context.setOffline(true)
    await frame.getByRole('button', { name: 'Exit learning module', exact: true }).click()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Discard unfinished Shadow Strike Dojo', exact: true }).click()
    await expect(page.locator('iframe[title="Shadow Strike Dojo"]')).toHaveCount(0)
    const localRetirements = async () =>
      Object.entries(await records(page))
        .filter(([key]) => key.includes(':retirement:'))
        .map(([, value]) => value.runId)
    const onlineRetirements = () =>
      [...documents.entries()]
        .filter(([key]) => key.includes('/betaGameRetirements/'))
        .map(([, value]) => JSON.parse((value.fields.payload as { stringValue: string }).stringValue))
    if (offline) {
      // Only a disconnected device must retain the local outbox marker.
      expect(await localRetirements()).toEqual([first.runId])
      expect(onlineRetirements()).toEqual([])
      await context.setOffline(false)
    }
    // Successful readback acknowledges/removes the local marker. Waiting for
    // that durable fact avoids racing fast sync while preserving both checks.
    await expect.poll(onlineRetirements).toEqual([expect.objectContaining({ runId: first.runId, scope: first.scope })])
    await expect.poll(localRetirements).toEqual([])
    const retired = await records(page)
    expect(Object.keys(retired).some((key) => key.includes(':checkpoint:'))).toBe(false)
    expect(Object.keys(retired).some((key) => key.startsWith('family-beta-preview-results-v1:'))).toBe(false)
    await page.getByRole('button', { name: 'Shadow Strike Dojo', exact: true }).click()
    await expect(page.frameLocator('iframe:visible').locator('.lg-round-label')).toHaveText(
      `Training strike 1 of ${first.pack.rounds.length}`,
    )
    expect((await checkpoint(page)).runId).not.toBe(first.runId)
  })
}

test('Shadow Strike journey movement uses a transform without per-frame layout', async ({ page, context }) => {
  await installFamilyFixtures(page)
  const frame = await open(page)
  await expect(frame.locator('.lg-training-ninja')).toHaveCSS('left', '0px')
  await expect(frame.locator('.lg-training-ninja-track')).toHaveCSS('transition-property', 'transform')
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  const before = await cdp.send('Performance.getMetrics')
  const actor = frame.locator('.lg-training-ninja')
  const start = await actor.boundingBox()
  await frame
    .locator('.lg-training-field')
    .evaluate((node) => (node as HTMLElement).style.setProperty('--training-ninja-x', '94%'))
  await page.waitForTimeout(1200)
  const after = await cdp.send('Performance.getMetrics')
  const metric = (value: typeof before, name: string) => value.metrics.find((metric) => metric.name === name)!.value
  const layoutCount = metric(after, 'LayoutCount') - metric(before, 'LayoutCount')
  expect(layoutCount).toBeLessThan(12) // old left-transition probe measured 47–50
  expect((await actor.boundingBox())!.x - start!.x).toBeGreaterThan(100)
  await test
    .info()
    .attach('movement-metrics', { body: JSON.stringify({ layoutCount }), contentType: 'application/json' })
  await frame
    .locator('.lg-training-field')
    .evaluate((node) => (node as HTMLElement).style.setProperty('--training-ninja-x', '6%'))
  await page.waitForTimeout(1000)
  // Capture separately from a tapping journey: full-page capture can reset
  // touch emulation in this Chromium version.
  await page.screenshot({ path: test.info().outputPath('shadow-strike.png'), fullPage: true })
})
