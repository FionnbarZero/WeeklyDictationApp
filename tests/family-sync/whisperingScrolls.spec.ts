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
type TestWindow = Window & { scrollProbe: Probe; failScrollSave?: boolean }

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
      mimeType = 'audio/webm'
      ondataavailable?: (event: { data: Blob }) => void
      onstop?: () => void
      start() {
        this.state = 'recording'
        probe.starts++
      }
      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['private-scroll-audio']) })
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

async function checkpoint(page: Page) {
  return page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('family-beta-acquisition-v1:') || key.includes(':completed:')) continue
      const value = JSON.parse(localStorage.getItem(key)!)
      if (value.envelope?.activityModule.split(':restart-')[0] === 'whispering-scrolls') return value
    }
    return null
  })
}

async function record(frame: FrameLocator) {
  await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
  await frame.getByRole('button', { name: 'Stop recording', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Replay comparison', exact: true })).toBeVisible()
}

async function review(frame: FrameLocator, teaching = false, correct = true) {
  await record(frame)
  await frame.getByRole('button', { name: teaching ? 'Continue' : correct ? 'Yes' : 'Not yet', exact: true }).click()
}

for (const [slug, grade] of grades) {
  test(`${grade} Scrolls uses the grade sequence, saves reviewed facts and resumes its own pinned lesson`, async ({
    page,
  }) => {
    await setup(page)
    let frame = await open(page, slug)
    const initial = await checkpoint(page)
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
    await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
    await expect
      .poll(() =>
        page.evaluate(() => Object.values(localStorage).some((raw) => raw.includes('"activity":"Whispering Scrolls"'))),
      )
      .toBe(true)
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
  await expect(frame.getByRole('button', { name: 'Yes', exact: true })).toBeEnabled({ timeout: 7000 })
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
