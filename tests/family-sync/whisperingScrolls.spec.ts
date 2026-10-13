import { expect, type FrameLocator, type Page, test } from '@playwright/test'
import { grades, installFamilyFixtures, type SyntheticFamilyDocuments } from './fixtures.ts'

type Probe = {
  starts: number
  stops: number
  pauses: number
  resumes: number
  enabled: boolean
  events: string[]
  revoked: number
}
type TestWindow = Window & { scrollProbe: Probe; failScrollSave?: boolean; failScrollScore?: boolean }

async function setup(page: Page, documents: SyntheticFamilyDocuments = new Map(), canPause = true) {
  await installFamilyFixtures(page, documents)
  await page.addInitScript((canPause) => {
    const probe: Probe = { starts: 0, stops: 0, pauses: 0, resumes: 0, enabled: true, events: [], revoked: 0 }
    ;(window as TestWindow).scrollProbe = probe
    const track = {
      get enabled() {
        return probe.enabled
      },
      set enabled(value: boolean) {
        probe.enabled = value
      },
      stop() {
        probe.stops++
      },
    }
    class Recorder {
      static isTypeSupported() {
        return true
      }
      state = 'inactive'
      mimeType = 'audio/wav'
      ondataavailable?: (event: { data: Blob }) => void
      onstop?: () => void
      start() {
        this.state = 'recording'
        probe.starts++
      }
      stop() {
        this.state = 'inactive'
        // Valid silent PCM avoids racing native decode errors from fake text
        // bytes against the controlled playback-completion event below.
        const bytes = new ArrayBuffer(1644)
        const view = new DataView(bytes)
        const tag = (offset: number, text: string) =>
          [...text].forEach((letter, i) => view.setUint8(offset + i, letter.charCodeAt(0)))
        tag(0, 'RIFF')
        view.setUint32(4, 1636, true)
        tag(8, 'WAVE')
        tag(12, 'fmt ')
        view.setUint32(16, 16, true)
        view.setUint16(20, 1, true)
        view.setUint16(22, 1, true)
        view.setUint32(24, 8000, true)
        view.setUint32(28, 16000, true)
        view.setUint16(32, 2, true)
        view.setUint16(34, 16, true)
        tag(36, 'data')
        view.setUint32(40, 1600, true)
        this.ondataavailable?.({ data: new Blob([bytes], { type: this.mimeType }) })
        this.onstop?.()
      }
      pause() {
        this.state = 'paused'
        probe.pauses++
      }
      resume() {
        this.state = 'recording'
        probe.resumes++
      }
    }
    if (!canPause) Object.defineProperty(Recorder.prototype, 'pause', { value: undefined })
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: Recorder })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [track] }) },
    })
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.revokeObjectURL = (url) => {
      probe.revoked++
      revoke(url)
    }
    HTMLMediaElement.prototype.play = function () {
      probe.events.push(this.src.startsWith('blob:') ? 'child' : 'model')
      setTimeout(() => this.dispatchEvent(new Event('ended')), 5)
      return Promise.resolve()
    }
    HTMLMediaElement.prototype.pause = () => {}
    const speak = speechSynthesis.speak.bind(speechSynthesis)
    speechSynthesis.speak = (utterance) => {
      probe.events.push('model')
      speak(utterance)
    }
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if ((window as TestWindow).failScrollSave && key.startsWith('family-beta-acquisition-v1:'))
        throw new DOMException('Synthetic storage full', 'QuotaExceededError')
      if ((window as TestWindow).failScrollScore && key.startsWith('family-beta-preview-results-v1:'))
        throw new DOMException('Synthetic score storage full', 'QuotaExceededError')
      set.call(this, key, value)
    }
  }, canPause)
}

async function open(page: Page, slug = 'grade5', resuming = false) {
  if (!resuming) {
    await page.goto(`/?grade=${slug}`)
    if (slug === 'grade2') await page.getByLabel('Practice week').selectOption('2026-09-21')
  }
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame.getByRole('button', { name: 'Whispering Scrolls', exact: true }).click()
  await expect(frame.locator('[data-report-activity="Whispering Scrolls"]')).toBeVisible()
  return frame
}

function readScrollsCheckpoint() {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('family-beta-acquisition-v1:') || key.includes(':completed:')) continue
    const value = JSON.parse(localStorage.getItem(key)!)
    if (value.envelope?.activityModule.split(':restart-')[0] === 'whispering-scrolls') return value
  }
  return null
}

async function checkpoint(page: Page) {
  return page.evaluate(readScrollsCheckpoint)
}

async function record(frame: FrameLocator) {
  await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
  await frame.getByRole('button', { name: 'Stop recording', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Replay comparison', exact: true })).toBeVisible()
}

async function review(frame: FrameLocator, teaching = false, correct = true) {
  const before = await frame.locator('body').evaluate(readScrollsCheckpoint)
  await record(frame)
  await frame.getByRole('button', { name: teaching ? 'Continue' : correct ? 'Yes' : 'Not yet', exact: true }).click()
  // Native cross-tab locking is asynchronous. Clicking an assessment does not
  // prove its checkpoint has committed; capture fixtures only after readback.
  await expect
    .poll(async () => (await frame.locator('body').evaluate(readScrollsCheckpoint)).envelope.revision)
    .toBe(before.envelope.revision + 1)
}

for (const [slug, grade] of grades) {
  test(`${grade} Scrolls uses the grade sequence, saves reviewed facts and resumes its own pinned lesson`, async ({
    page,
  }, testInfo) => {
    await setup(page)
    let frame = await open(page, slug)
    const initial = await checkpoint(page)
    await page.screenshot({ path: testInfo.outputPath('scrolls-entry.png'), fullPage: true })
    expect(initial.envelope.flow.prompt.kind).toBe('familiar-dt')
    for (const teaching of [false, false, true, false]) await review(frame, teaching)
    await expect.poll(async () => (await checkpoint(page)).envelope.revision).toBe(4)
    const saved = await checkpoint(page)
    expect(saved.reviewedTrials).toHaveLength(3)
    expect(
      saved.assessments.filter((item: { countsTowardWeeklyScore: boolean }) => item.countsTowardWeeklyScore),
    ).toHaveLength(1)
    const probe = await frame.locator('body').evaluate(() => (window as TestWindow).scrollProbe)
    expect(probe.events.slice(0, 2)).toEqual(['child', 'model'])
    expect(probe.revoked).toBe(4)
    await page.reload()
    await page.getByText('Saved lessons', { exact: true }).click()
    await page.getByRole('button', { name: /Resume saved Whispering Scrolls/ }).click()
    frame = await open(page, slug, true)
    expect((await checkpoint(page)).envelope).toEqual(saved.envelope)
    await expect(frame.getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible()
    expect(
      await frame
        .getByRole('button', { name: slug === 'kindergarten' ? 'High-frequency words' : 'Read the Words', exact: true })
        .count(),
    ).toBe(0)
    await frame.locator('body').evaluate(() => {
      ;(window as TestWindow).failScrollScore = true
    })
    await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
    await expect(frame.getByText(/Your reviewed work is preserved/)).toBeVisible()
    await expect(frame.getByRole('button', { name: 'Retry saving score', exact: true })).toBeVisible()
    await expect(frame.getByRole('button', { name: 'Record my reading', exact: true })).toHaveCount(0)
    expect((await checkpoint(page)).envelope).toEqual(saved.envelope)
    await frame.locator('body').evaluate(() => {
      ;(window as TestWindow).failScrollScore = false
    })
    await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
    await expect
      .poll(() =>
        page.evaluate(() => Object.values(localStorage).some((raw) => raw.includes('"activity":"Whispering Scrolls"'))),
      )
      .toBe(true)
    const results = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('family-beta-preview-results-v1:'))
        .map((key) => JSON.parse(localStorage.getItem(key)!))
        .filter((result) => result.activity === 'Whispering Scrolls'),
    )
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ id: saved.sessionId, channel: 'reading', attempted: 1, correct: 1 })
    const stored = await page.evaluate(() => Object.values(localStorage).join('\n'))
    expect(stored).not.toMatch(/private-scroll-audio|blob:|data:audio/)
  })
}

test('Scrolls report pause silences the microphone and preserves the remaining response time and same recording', async ({
  page,
}) => {
  await setup(page)
  const frame = await open(page)
  await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
  await expect(frame.getByRole('timer')).toBeVisible()
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await expect.poll(() => frame.locator('body').evaluate(() => (window as TestWindow).scrollProbe.enabled)).toBe(false)
  const paused = await frame.getByRole('timer').textContent()
  await page.waitForTimeout(5500)
  expect(await frame.getByRole('timer').textContent()).toBe(paused)
  expect((await checkpoint(page)).envelope.revision).toBe(0)
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await expect.poll(() => frame.locator('body').evaluate(() => (window as TestWindow).scrollProbe.enabled)).toBe(true)
  await expect
    .poll(() => frame.locator('body').evaluate(() => (window as TestWindow).scrollProbe.stops), {
      timeout: 5500,
      intervals: [100],
    })
    .toBe(1)
  await expect(frame.getByRole('button', { name: 'Yes', exact: true })).toBeEnabled()
  const probe = await frame.locator('body').evaluate(() => (window as TestWindow).scrollProbe)
  expect(probe.starts).toBe(1)
  expect(probe.pauses).toBe(1)
  expect(probe.resumes).toBe(1)
  expect(probe.stops).toBe(1)
})

test('Scrolls failed save locks the reviewed answer, then retries it once without losing the recording', async ({
  page,
}) => {
  await setup(page)
  const frame = await open(page)
  await record(frame)
  await frame.locator('body').evaluate(() => {
    ;(window as TestWindow).failScrollSave = true
  })
  await frame.getByRole('button', { name: 'Not yet', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Retry saving response' })).toBeVisible()
  await expect(frame.getByRole('button', { name: 'Yes', exact: true })).toBeDisabled()
  await expect(frame.getByRole('button', { name: 'Done for today' })).toBeDisabled()
  expect((await checkpoint(page)).envelope.revision).toBe(0)
  await frame.locator('body').evaluate(() => {
    ;(window as TestWindow).failScrollSave = false
  })
  await frame.getByRole('button', { name: 'Retry saving response' }).click()
  await expect.poll(async () => (await checkpoint(page)).envelope.revision).toBe(1)
  expect((await checkpoint(page)).assessments[0].correct).toBe(false)
  expect((await checkpoint(page)).reviewedTrials).toHaveLength(1)
  await expect(frame.getByRole('button', { name: 'Done for today' })).toBeEnabled()
})

test('Scrolls unsupported recorder pause releases the microphone and explicitly repeats only the unfinished response', async ({
  page,
}) => {
  await setup(page, new Map(), false)
  const frame = await open(page)
  await review(frame)
  await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await expect(frame.getByText(/This browser could not pause the microphone safely/)).toBeVisible()
  await expect(frame.getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible()
  expect((await checkpoint(page)).envelope.revision).toBe(1)
})

test('Scrolls reviewed progress recovers on a fresh device, while recordings remain temporary', async ({
  page,
  browser,
}) => {
  const documents: SyntheticFamilyDocuments = new Map()
  await setup(page, documents)
  const frame = await open(page)
  await review(frame)
  const saved = await checkpoint(page)
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect
    .poll(() => [...documents.values()].some((doc) => JSON.stringify(doc).includes('whispering-scrolls')))
    .toBe(true)
  const context = await browser.newContext()
  try {
    const second = await context.newPage()
    await setup(second, documents)
    const continued = await open(second)
    await expect.poll(async () => (await checkpoint(second))?.envelope.revision).toBe(1)
    expect((await checkpoint(second)).envelope.flow).toEqual(saved.envelope.flow)
    await review(continued)
    await expect.poll(async () => (await checkpoint(second)).envelope.revision).toBe(2)
    expect((await checkpoint(second)).sessionId).not.toBe(saved.sessionId)
    expect(JSON.stringify([...documents.values()])).not.toMatch(/private-scroll-audio|blob:|data:audio/)
  } finally {
    await context.close()
  }
})

test('Scrolls microphone denial retains the grade timer before fallback comparison and assessment', async ({
  page,
}) => {
  await setup(page)
  const frame = await open(page)
  await frame.locator('body').evaluate(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException('Denied', 'NotAllowedError')
        },
      },
    })
  })
  await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
  await frame.getByRole('button', { name: 'Continue without recording', exact: true }).click()
  await expect(frame.getByRole('timer')).toContainText('5 seconds')
  expect(await frame.getByRole('button', { name: 'Yes', exact: true }).count()).toBe(0)
  await expect(frame.getByRole('button', { name: 'Yes', exact: true })).toBeEnabled({ timeout: 6500 })
  await frame.getByRole('button', { name: 'Yes', exact: true }).click()
  await expect.poll(async () => (await checkpoint(page)).envelope.revision).toBe(1)
  expect(await frame.locator('body').evaluate(() => (window as TestWindow).scrollProbe.starts)).toBe(0)
})

test('Scrolls reopening a queued score cannot append answers to its immutable attempt', async ({ page }) => {
  await setup(page)
  await page.route('**/betaResults/**', (route) => route.abort('internetdisconnected'))
  const frame = await open(page)
  for (const teaching of [false, false, true, false]) await review(frame, teaching)
  const before = await checkpoint(page)
  await frame.locator('body').evaluate(() => {
    ;(window as TestWindow).failScrollScore = true
  })
  await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Retry saving score', exact: true })).toBeVisible()
  await frame.locator('body').evaluate(() => location.reload())
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame.getByRole('button', { name: 'Whispering Scrolls', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Retry saving score', exact: true })).toBeVisible()
  await expect(frame.getByRole('button', { name: 'Record my reading', exact: true })).toHaveCount(0)
  expect((await checkpoint(page)).envelope).toEqual(before.envelope)
  await frame.getByRole('button', { name: 'Retry saving score', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate((id) => Boolean(localStorage.getItem(`family-beta-preview-results-v1:${id}`)), before.sessionId),
    )
    .toBe(true)
  const results = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('family-beta-preview-results-v1:'))
      .map((key) => JSON.parse(localStorage.getItem(key)!)),
  )
  expect(results).toHaveLength(1)
  expect(results[0]).toMatchObject({ id: before.sessionId, activity: 'Whispering Scrolls', attempted: 1, correct: 1 })
})

for (const [slug, grade] of grades) {
  for (const pendingOnly of [false, true]) {
    test(`${grade} Scrolls rejects a mounted tab's answer after another tab ${pendingOnly ? 'queues' : 'confirms'} its score`, async ({
      page,
      context,
    }) => {
      const documents: SyntheticFamilyDocuments = new Map()
      await setup(page, documents)
      const first = await open(page, slug)
      for (const teaching of [false, false, true, false]) await review(first, teaching)
      await expect.poll(async () => (await checkpoint(page)).envelope.revision).toBe(4)
      const before = await checkpoint(page)
      const secondPage = await context.newPage()
      await setup(secondPage, documents)
      // Keep queued-only completion deterministic: neither tab can acknowledge
      // its outbox via the synthetic server before the explicit local retry.
      if (pendingOnly) await context.route('**/betaResults/**', (route) => route.abort('internetdisconnected'))
      const second = await open(secondPage, slug)
      expect((await checkpoint(secondPage)).sessionId).toBe(before.sessionId)
      await record(second)
      await first.locator('body').evaluate((fail) => {
        ;(window as TestWindow).failScrollScore = fail
      }, pendingOnly)
      await first.getByRole('button', { name: 'Done for today', exact: true }).click()
      const scoreKey = `${pendingOnly ? 'family-beta-preview-pending-v1' : 'family-beta-preview-results-v1'}:${before.sessionId}`
      await expect.poll(() => page.evaluate((key) => Boolean(localStorage.getItem(key)), scoreKey)).toBe(true)
      const frozenScore = await page.evaluate((key) => localStorage.getItem(key), scoreKey)
      if (pendingOnly) {
        expect(
          await page.evaluate((id) => localStorage.getItem(`family-beta-preview-results-v1:${id}`), before.sessionId),
        ).toBeNull()
      } else {
        await expect
          .poll(() =>
            page.evaluate((id) => localStorage.getItem(`family-beta-preview-pending-v1:${id}`), before.sessionId),
          )
          .toBeNull()
      }
      await second.getByRole('button', { name: 'Not yet', exact: true }).click()
      await expect(second.getByText(/This attempt is already being saved or is complete/)).toBeVisible()
      expect(await checkpoint(secondPage)).toEqual(before)
      expect(await page.evaluate((key) => localStorage.getItem(key), scoreKey)).toBe(frozenScore)
      // The rejected, temporary response stays available until the child
      // explicitly leaves; it never becomes an extra fact in the frozen score.
      await expect(second.getByRole('button', { name: 'Replay comparison', exact: true })).toBeVisible()
      await second.getByRole('button', { name: 'Return to Dojo', exact: true }).click()
      if (pendingOnly) {
        await first.locator('body').evaluate(() => {
          ;(window as TestWindow).failScrollScore = false
        })
        await first.getByRole('button', { name: 'Retry saving score', exact: true }).click()
      }
      await secondPage.reload()
      const reopened = await open(secondPage, slug)
      const next = await checkpoint(secondPage)
      expect(next.sessionId).not.toBe(before.sessionId)
      expect(next.envelope).toEqual(before.envelope)
      expect(next.reviewedTrials).toEqual(before.reviewedTrials)
      await review(reopened, false, false)
      await reopened.getByRole('button', { name: 'Done for today', exact: true }).click()
      await expect
        .poll(() =>
          secondPage.evaluate(
            (id) => Boolean(localStorage.getItem(`family-beta-preview-results-v1:${id}`)),
            next.sessionId,
          ),
        )
        .toBe(true)
      const results = await secondPage.evaluate(() =>
        Object.keys(localStorage)
          .filter((key) => key.startsWith('family-beta-preview-results-v1:'))
          .map((key) => JSON.parse(localStorage.getItem(key)!)),
      )
      expect(results).toHaveLength(2)
      expect(results.find((result) => result.id === before.sessionId)).toEqual(JSON.parse(frozenScore!))
      expect(results.find((result) => result.id === next.sessionId)).toMatchObject({ attempted: 1, correct: 0 })
    })
  }
}

for (const finishFirst of [true, false]) {
  test(`Scrolls native lock serializes overlapping ${finishFirst ? 'finish before answer' : 'answer before finish'}`, async ({
    page,
    context,
  }) => {
    const documents: SyntheticFamilyDocuments = new Map()
    await setup(page, documents)
    const first = await open(page)
    for (const teaching of [false, false, true, false]) await review(first, teaching)
    await expect.poll(async () => (await checkpoint(page)).envelope.revision).toBe(4)
    const before = await checkpoint(page)
    const secondPage = await context.newPage()
    await setup(secondPage, documents)
    const second = await open(secondPage)
    await record(second)
    const name = await page.evaluate(async () => {
      const key = Object.keys(localStorage).find(
        (key) =>
          key.startsWith('family-beta-acquisition-v1:') &&
          JSON.parse(localStorage.getItem(key)!).envelope?.activityModule === 'whispering-scrolls',
      )!
      const name = `ninja-scrolls-write:${key}`
      await new Promise<void>((held) => {
        void navigator.locks.request(
          name,
          () =>
            new Promise<void>((release) => {
              Object.assign(window, { releaseScrollsWrite: release })
              held()
            }),
        )
      })
      return name
    })
    const count = async () =>
      page.evaluate(
        async (name) => (await navigator.locks.query()).pending!.filter((lock) => lock.name === name).length,
        name,
      )
    const finish = () => first.getByRole('button', { name: 'Done for today', exact: true }).click()
    const answer = () => second.getByRole('button', { name: 'Not yet', exact: true }).click()
    try {
      await (finishFirst ? finish() : answer())
      await expect.poll(count).toBe(1)
      await (finishFirst ? answer() : finish())
      await expect.poll(count).toBe(2)
      expect(await checkpoint(page)).toEqual(before)
      await expect(second.getByRole('button', { name: 'Done for today', exact: true })).toBeDisabled()
    } finally {
      await page.evaluate(() => (window as Window & { releaseScrollsWrite: () => void }).releaseScrollsWrite())
    }
    if (finishFirst) {
      await expect(second.getByText(/This attempt is already being saved or is complete/)).toBeVisible()
      expect(await checkpoint(page)).toEqual(before)
    } else {
      await expect(first.getByText(/Reopen the saved lesson before submitting its score/)).toBeVisible()
      expect((await checkpoint(page)).envelope.revision).toBe(before.envelope.revision + 1)
      expect(
        await page.evaluate(() =>
          Object.keys(localStorage).filter((key) => key.startsWith('family-beta-preview-results-v1:')),
        ),
      ).toEqual([])
      await second.getByRole('button', { name: 'Done for today', exact: true }).click()
    }
    await expect
      .poll(() =>
        page.evaluate(
          (id) => JSON.parse(localStorage.getItem(`family-beta-preview-results-v1:${id}`) || 'null')?.attempted,
          before.sessionId,
        ),
      )
      .toBe(finishFirst ? 1 : 2)
  })
}

test('Scrolls without cross-tab locking keeps the reviewed response for retry without changing a checkpoint', async ({
  page,
}) => {
  await setup(page)
  const frame = await open(page)
  const before = await checkpoint(page)
  await record(frame)
  await frame
    .locator('body')
    .evaluate(() => Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }))
  await frame.getByRole('button', { name: 'Yes', exact: true }).click()
  await expect(frame.getByText(/cannot safely coordinate saved practice across tabs/)).toBeVisible()
  expect(await checkpoint(page)).toEqual(before)
  await frame.locator('body').evaluate(() => {
    Reflect.deleteProperty(navigator, 'locks')
  })
  await frame.getByRole('button', { name: 'Retry saving response', exact: true }).click()
  await expect.poll(async () => (await checkpoint(page)).envelope.revision).toBe(1)
})

test('Scrolls guarded predecessor recovery preserves the new lesson and returns to the same prompt', async ({
  browser,
  request,
}) => {
  test.skip(!process.env.FAMILY_SYNC_REHEARSAL_OLD_ARTIFACT, 'Requires the verified retained predecessor artifact.')
  // This case isolates the new module's rollback guard. offlineTransition.spec
  // separately exercises the real installed-worker replacement lifecycle.
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const select = async (version: string) =>
    expect((await request.post(`/__rehearsal__/version?version=${version}`)).ok()).toBe(true)
  const page = await context.newPage()
  const records = () =>
    page.evaluate(() =>
      Object.fromEntries(
        Object.keys(localStorage)
          .filter((key) => key.startsWith('family-beta-'))
          .sort()
          .map((key) => [key, localStorage.getItem(key)]),
      ),
    )
  try {
    await setup(page)
    const frame = await open(page)
    await review(frame)
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toBeVisible()
    const before = await records()
    const saved = await checkpoint(page)
    await select('rollback')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Your saved work is preserved' })).toBeVisible()
    expect(await records()).toEqual(before)
    await select('candidate')
    await page.reload()
    await page.getByText('Saved lessons', { exact: true }).click()
    await page.getByRole('button', { name: /Resume saved Whispering Scrolls/ }).click()
    await open(page, 'grade5', true)
    expect((await checkpoint(page)).envelope).toEqual(saved.envelope)
  } finally {
    await select('candidate')
    await context.close()
  }
})
