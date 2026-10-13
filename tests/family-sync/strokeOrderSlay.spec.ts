import { expect, type FrameLocator, type Page, test } from '@playwright/test'
import { grades, installFamilyFixtures, type SyntheticFamilyDocuments } from './fixtures.ts'

type TestWindow = Window & { failStrokeSave?: boolean; failStrokeScore?: boolean }
async function setup(page: Page, documents: SyntheticFamilyDocuments = new Map()) {
  await installFamilyFixtures(page, documents)
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if ((window as TestWindow).failStrokeSave && key.startsWith('family-beta-acquisition-v1:'))
        throw new DOMException('Synthetic storage full', 'QuotaExceededError')
      if ((window as TestWindow).failStrokeScore && key.startsWith('family-beta-preview-results-v1:'))
        throw new DOMException('Synthetic score storage full', 'QuotaExceededError')
      set.call(this, key, value)
    }
  })
}
async function open(page: Page, slug = 'grade5', resuming = false) {
  if (!resuming) await page.goto(`/?grade=${slug}`)
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame.getByRole('button', { name: 'Stroke Order Slay', exact: true }).click()
  await expect(frame.getByRole('heading', { name: 'Stroke Order Slay', exact: true })).toBeVisible()
  return frame
}
function readCheckpoint() {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('family-beta-acquisition-v1:') || key.includes(':completed:')) continue
    const value = JSON.parse(localStorage.getItem(key)!)
    if (value.envelope?.activityModule.split(':restart-')[0] === 'stroke-order-slay') return value
  }
  return null
}
async function checkpoint(page: Page) {
  return page.evaluate(readCheckpoint)
}
async function compare(frame: FrameLocator) {
  await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
  await expect(frame.getByRole('heading', { name: 'Compare your writing' })).toBeVisible()
}
async function review(frame: FrameLocator, teaching = false, correct = true) {
  const before = await frame.locator('body').evaluate(readCheckpoint)
  await compare(frame)
  await frame.getByRole('button', { name: teaching ? 'Continue' : correct ? 'Yes' : 'Not yet', exact: true }).click()
  await expect
    .poll(async () => (await frame.locator('body').evaluate(readCheckpoint)).envelope.revision)
    .toBe(before.envelope.revision + 1)
}

for (const [slug, grade] of grades) {
  test(`${grade} Stroke Order runs current Tier 1 acquisition, hides independent targets and restores its pinned lesson`, async ({
    page,
  }, info) => {
    await setup(page)
    let frame = await open(page, slug)
    const initial = await checkpoint(page)
    expect(initial.envelope.flow.prompt.kind).toBe('familiar-dt')
    expect(initial.envelope.tier).toBe('tier-1')
    expect(
      initial.envelope.lessonSnapshot.targetSet.targets.every((word: { tier: string }) => word.tier === 'tier-1'),
    ).toBe(true)
    await expect(frame.locator('.stroke-acquisition-guide')).toHaveCount(0)
    await frame.getByLabel('Type your word instead of drawing it').fill('private-d2-response')
    await compare(frame)
    await expect(frame.getByRole('region', { name: 'Correct writing model' })).toBeVisible()
    await expect(frame.getByLabel('Type your word instead of drawing it')).toHaveValue('private-d2-response')
    await frame.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect.poll(async () => (await checkpoint(page)).envelope.revision).toBe(1)
    await review(frame)
    await expect(frame.locator('.stroke-acquisition-guide.is-animated')).toBeVisible()
    await page.screenshot({ path: info.outputPath(`stroke-${slug}.png`), fullPage: true })
    await review(frame, true)
    await expect(frame.locator('.stroke-acquisition-guide')).toHaveCount(0)
    await review(frame)
    const saved = await checkpoint(page)
    expect(saved.envelope.revision).toBe(4)
    expect(saved.reviewedTrials).toHaveLength(3)
    expect(
      saved.assessments.filter((a: { countsTowardWeeklyScore: boolean }) => a.countsTowardWeeklyScore),
    ).toHaveLength(1)
    await page.reload()
    await page.getByText('Saved lessons', { exact: true }).click()
    await page.getByRole('button', { name: /Resume saved Stroke Order Slay/ }).click()
    frame = await open(page, slug, true)
    expect((await checkpoint(page)).envelope).toEqual(saved.envelope)
    await expect(frame.getByLabel('Type your word instead of drawing it')).toHaveValue('')
    await frame.locator('body').evaluate(() => {
      ;(window as TestWindow).failStrokeScore = true
    })
    await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
    await expect(frame.getByRole('button', { name: 'Retry saving score', exact: true })).toBeVisible()
    await expect(frame.getByLabel('Type your word instead of drawing it')).toHaveCount(0)
    expect((await checkpoint(page)).envelope).toEqual(saved.envelope)
    await frame.locator('body').evaluate(() => {
      ;(window as TestWindow).failStrokeScore = false
    })
    await frame.getByRole('button', { name: 'Retry saving score', exact: true }).click()
    await expect
      .poll(() =>
        page.evaluate(
          (id) => JSON.parse(localStorage.getItem(`family-beta-preview-results-v1:${id}`) || 'null'),
          saved.sessionId,
        ),
      )
      .toMatchObject({
        id: saved.sessionId,
        channel: 'writing',
        activity: 'Stroke Order Slay',
        attempted: 1,
        correct: 1,
      })
    expect(await page.evaluate(() => Object.values(localStorage).join('\n'))).not.toMatch(
      /private-d2-response|"activeStroke"|"typedText"|"strokes":/,
    )
  })

  for (const pendingOnly of [false, true]) {
    test(`${grade} Stroke Order rejects mounted answers after another tab ${pendingOnly ? 'queues' : 'confirms'} completion`, async ({
      page,
      context,
    }) => {
      const documents: SyntheticFamilyDocuments = new Map()
      await setup(page, documents)
      const first = await open(page, slug)
      for (const teaching of [false, false, true, false]) await review(first, teaching)
      const before = await checkpoint(page)
      const secondPage = await context.newPage()
      await setup(secondPage, documents)
      if (pendingOnly) await context.route('**/betaResults/**', (route) => route.abort('internetdisconnected'))
      const second = await open(secondPage, slug)
      await compare(second)
      expect((await checkpoint(secondPage)).sessionId).toBe(before.sessionId)
      await first.locator('body').evaluate((fail) => {
        ;(window as TestWindow).failStrokeScore = fail
      }, pendingOnly)
      await first.getByRole('button', { name: 'Done for today', exact: true }).click()
      const key = `${pendingOnly ? 'family-beta-preview-pending-v1' : 'family-beta-preview-results-v1'}:${before.sessionId}`
      await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), key)).not.toBeNull()
      const result = await page.evaluate((key) => localStorage.getItem(key), key)
      await second.getByRole('button', { name: 'Not yet', exact: true }).click()
      await expect(second.getByRole('region', { name: 'Finished in another tab' })).toBeVisible()
      expect(await checkpoint(secondPage)).toEqual(before)
      expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(result)
    })
  }
}

test('Stroke Order report pauses the timer and guide, preserves temporary input, then reload repeats only the unfinished response', async ({
  page,
}) => {
  await setup(page)
  let frame = await open(page)
  await review(frame)
  await review(frame)
  const pad = frame.locator('svg.skywriting-pad')
  await expect(pad).toBeVisible()
  // Interrupt before pointer-up. A second stroke must not replace the held ink.
  const bounds = (await pad.boundingBox())!
  await page.mouse.move(bounds.x + 30, bounds.y + 30)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 80, bounds.y + 80)
  await expect(frame.locator('.skywriting-stroke')).toHaveCount(1)
  await page
    .getByRole('button', { name: 'Report a problem', exact: true })
    .evaluate((button: HTMLButtonElement) => button.click())
  await page.mouse.up()
  await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'true')
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await page.mouse.move(bounds.x + 110, bounds.y + 30)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 160, bounds.y + 80)
  await page.mouse.up()
  await expect(frame.locator('.skywriting-stroke')).toHaveCount(2)
  await frame.getByLabel('Type your word instead of drawing it').fill('private-d2-response')
  const before = await checkpoint(page)
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'true')
  const time = await frame.getByRole('timer').textContent()
  await page.waitForTimeout(2500)
  expect(await frame.getByRole('timer').textContent()).toBe(time)
  expect(
    await frame
      .locator('.stroke-acquisition-guide path')
      .first()
      .evaluate((e) => getComputedStyle(e).animationPlayState),
  ).toBe('paused')
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await expect(frame.getByLabel('Type your word instead of drawing it')).toHaveValue('private-d2-response')
  await expect.poll(() => frame.getByRole('timer').textContent()).not.toBe(time)
  await page.reload()
  frame = await open(page)
  expect((await checkpoint(page)).envelope).toEqual(before.envelope)
  await expect(frame.getByLabel('Type your word instead of drawing it')).toHaveValue('')
})

test('Stroke Order waits for audible start, retries failed audio, and replays the grade cadence at comparison', async ({
  page,
}) => {
  await setup(page)
  await page.addInitScript(() => {
    const state = window as Window & {
      strokeCue?: SpeechSynthesisUtterance
      strokeSpeech: string[]
      allowStrokeAudio?: boolean
    }
    state.strokeSpeech = []
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices() {
          return []
        },
        speak(u: SpeechSynthesisUtterance) {
          state.strokeCue = u
          state.strokeSpeech.push(u.text)
          if (state.allowStrokeAudio)
            setTimeout(() => {
              u.onstart?.({} as SpeechSynthesisEvent)
              u.onend?.({} as SpeechSynthesisEvent)
            }, 0)
        },
      },
    })
  })
  const frame = await open(page)
  await expect(frame.getByText('Loading prompt audio…', { exact: true })).toBeVisible()
  await page.waitForTimeout(1500)
  await expect(frame.getByRole('timer')).toHaveText('5s')
  await expect(frame.getByLabel('Type your word instead of drawing it')).toBeDisabled()
  await frame.locator('body').evaluate(() => {
    const state = window as Window & { strokeCue?: SpeechSynthesisUtterance }
    state.strokeCue!.onerror?.({} as SpeechSynthesisErrorEvent)
  })
  await expect(frame.getByRole('button', { name: 'Try audio again' })).toBeVisible()
  await frame.locator('body').evaluate(() => {
    const state = window as Window & { allowStrokeAudio?: boolean; strokeSpeech: string[] }
    state.allowStrokeAudio = true
    state.strokeSpeech = []
  })
  await frame.getByRole('button', { name: 'Try audio again' }).click()
  await expect(frame.getByRole('button', { name: 'Skip Timer', exact: true })).toBeVisible()
  await frame.getByRole('button', { name: 'Pause timer', exact: true }).click()
  const word = (await checkpoint(page)).envelope.flow.prompt.word
  const cadence = [word.text, ...(word.sentence ? [word.sentence] : []), word.text, word.text]
  await expect
    .poll(() => frame.locator('body').evaluate(() => (window as Window & { strokeSpeech: string[] }).strokeSpeech))
    .toEqual(cadence)
  await frame.getByRole('button', { name: 'Resume timer', exact: true }).click()
  await compare(frame)
  await expect
    .poll(() => frame.locator('body').evaluate(() => (window as Window & { strokeSpeech: string[] }).strokeSpeech))
    .toEqual([...cadence, ...cadence])
  expect((await checkpoint(page)).envelope.revision).toBe(0)
})

test('Stroke Order failed reviewed answer retries the same choice once and cannot finalize early', async ({ page }) => {
  await setup(page)
  const frame = await open(page)
  await frame.getByLabel('Type your word instead of drawing it').fill('private-d2-response')
  await compare(frame)
  await frame.locator('body').evaluate(() => {
    ;(window as TestWindow).failStrokeSave = true
  })
  await frame.getByRole('button', { name: 'Not yet', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Retry saving this response' })).toBeVisible()
  await expect(frame.getByRole('button', { name: 'Yes', exact: true })).toHaveCount(0)
  await expect(frame.getByRole('button', { name: 'Done for today' })).toBeDisabled()
  await expect(frame.getByLabel('Type your word instead of drawing it')).toHaveValue('private-d2-response')
  expect((await checkpoint(page)).envelope.revision).toBe(0)
  await frame.locator('body').evaluate(() => {
    ;(window as TestWindow).failStrokeSave = false
  })
  await frame.getByRole('button', { name: 'Retry saving this response' }).click()
  await expect.poll(async () => (await checkpoint(page)).envelope.revision).toBe(1)
  expect((await checkpoint(page)).assessments[0].correct).toBe(false)
  expect((await checkpoint(page)).reviewedTrials).toHaveLength(1)
  await expect(frame.getByRole('button', { name: 'Done for today' })).toBeEnabled()
})

test('Stroke Order reviewed facts sync to a fresh device without provisional writing', async ({ page, browser }) => {
  const documents: SyntheticFamilyDocuments = new Map()
  await setup(page, documents)
  const first = await open(page)
  await review(first)
  const saved = await checkpoint(page)
  await first.getByLabel('Type your word instead of drawing it').fill('private-d2-response')
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect
    .poll(() => [...documents.values()].some((doc) => JSON.stringify(doc).includes('stroke-order-slay')))
    .toBe(true)
  const context = await browser.newContext()
  try {
    const second = await context.newPage()
    await setup(second, documents)
    const frame = await open(second)
    await expect.poll(async () => (await checkpoint(second))?.envelope.revision).toBe(1)
    expect((await checkpoint(second)).envelope.flow).toEqual(saved.envelope.flow)
    await expect(frame.getByLabel('Type your word instead of drawing it')).toHaveValue('')
    await review(frame)
    expect((await checkpoint(second)).sessionId).not.toBe(saved.sessionId)
    expect(JSON.stringify([...documents.values()])).not.toMatch(/private-d2-response|"typedText"|"activeStroke"/)
  } finally {
    await context.close()
  }
})

test('Stroke Order guarded D1 recovery preserves its lesson and returns to the same prompt', async ({
  page,
  request,
}) => {
  test.skip(!process.env.FAMILY_SYNC_REHEARSAL_OLD_ARTIFACT, 'Requires retained D1 package')
  await setup(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined })
  })
  const select = async (version: string) => {
    const response = await request.post(`/__rehearsal__/version?version=${version}`)
    expect(response.ok()).toBe(true)
  }
  try {
    await select('candidate')
    const frame = await open(page)
    await review(frame)
    const saved = await checkpoint(page)
    await select('rollback')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Your saved work is preserved' })).toBeVisible()
    expect(await checkpoint(page)).toEqual(saved)
    await select('candidate')
    await page.reload()
    await open(page)
    expect((await checkpoint(page)).envelope).toEqual(saved.envelope)
  } finally {
    await select('candidate')
  }
})
