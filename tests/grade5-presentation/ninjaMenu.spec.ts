import { expect, type FrameLocator, type Page, test } from '@playwright/test'

const games = ['Shuriken Match', 'Shadow Strike Dojo', 'Memory Lanterns', 'Context Gap Dash', 'Sushi Scramble']
const moreActivities = ['Return to Dojo · Writing', 'Return to Dojo · Reading', 'Writing Test', 'Reading Test']
const targets = ['或者', '了解', '完', '兴奋的', '告诉', '沟通', '快速地', '有意思']
const browserErrors = new WeakMap<Page, string[]>()
const frameOf = (page: Page) => page.frameLocator('iframe:visible')
const activityButtons = (frame: FrameLocator) => frame.locator('.learning-hub-activity-grid button')

test.beforeEach(async ({ page, baseURL }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.clock.setSystemTime(new Date('2026-10-21T19:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const origin = new URL(baseURL!).origin
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  )
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices() {
          return []
        },
        speak(utterance: SpeechSynthesisUtterance) {
          utterance.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(() => utterance.onend?.({} as SpeechSynthesisEvent), 5)
        },
      },
    })
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        async getUserMedia() {
          throw new DOMException('Synthetic microphone refusal', 'NotAllowedError')
        },
      },
    })
  })
  await page.goto('/family-beta-preview.html?grade=grade5')
  await frameOf(page)
    .getByRole('button', { name: /Practice your Ninja Skills/ })
    .click()
  await expect(activityButtons(frameOf(page))).toHaveText([...games, 'More activities'])
})

test.afterEach(async ({ page }) => expect(browserErrors.get(page)).toEqual([]))

async function expectOnlyMoreActivities(frame: FrameLocator) {
  await expect(activityButtons(frame)).toHaveCount(4)
  // Preserve the source's ordering; this test intentionally checks membership
  // rather than demanding a new order for these existing native activities.
  expect((await activityButtons(frame).allTextContents()).sort()).toEqual([...moreActivities].sort())
  await expect(frame.getByRole('button', { name: '← Back to Ninja Skills', exact: true })).toBeVisible()
  for (const name of [...games, 'More activities'])
    await expect(frame.getByRole('button', { name, exact: true })).toHaveCount(0)
}

async function reportAndReturn(page: Page) {
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await page.getByLabel('What did you see or hear?').fill('Synthetic Grade 5 menu check. No child information.')
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
}

const records = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('family-beta-acquisition-v1:'))),
  )
const resultKeys = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('family-beta-preview-results-v1:')))

test('Ninja Skills shows five games first and a full-width More activities card, with repeatable nested/back/report navigation', async ({
  page,
}, info) => {
  const frame = frameOf(page)
  const grid = frame.locator('.learning-hub-activity-grid')
  const cards = grid.locator(':scope > article')
  await expect(cards).toHaveCount(6)
  await expect(cards.locator('h3')).toHaveText([...games, 'More activities'])
  for (const name of moreActivities) await expect(frame.getByRole('button', { name, exact: true })).toHaveCount(0)
  const bounds = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect()
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
    }),
  )
  const gridBounds = await grid.boundingBox()
  expect(gridBounds).not.toBeNull()
  const training = bounds[5]
  expect(training.top).toBeGreaterThanOrEqual(Math.max(...bounds.slice(0, 5).map((box) => box.bottom)) - 1)
  expect(training.right - training.left).toBeCloseTo(gridBounds!.width, 0)
  await cards.last().scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('grade5-ninja-more-activities.png'), fullPage: true })

  const words = frame.locator('.learning-hub-word-list')
  await expect(words).toHaveCount(2)
  for (const list of await words.all()) await expect(list.locator('span')).toHaveText(targets)
  const unchanged = await records(page)
  for (let visit = 0; visit < 2; visit++) {
    await frame.getByRole('button', { name: 'More activities', exact: true }).click()
    await expectOnlyMoreActivities(frame)
    await reportAndReturn(page)
    await expectOnlyMoreActivities(frame)
    await frame.getByRole('button', { name: '← Back to Ninja Skills', exact: true }).click()
    await expect(activityButtons(frame)).toHaveText([...games, 'More activities'])
  }
  await frame.getByRole('button', { name: 'More activities', exact: true }).click()
  await frame.getByRole('button', { name: '← Back to all challenges', exact: true }).click()
  await frame.getByRole('button', { name: /Practice your Ninja Skills/ }).click()
  await expect(activityButtons(frame)).toHaveText([...games, 'More activities'])
  await expect(frame.getByRole('button', { name: '← Back to Ninja Skills', exact: true })).toHaveCount(0)
  expect(await records(page)).toEqual(unchanged)
  expect(await resultKeys(page)).toEqual([])
})

test('each of the four nested native activities opens and exits back to More activities without a score or duplicate menu', async ({
  page,
}) => {
  const frame = frameOf(page)
  await frame.getByRole('button', { name: 'More activities', exact: true }).click()
  let savedPractice: Record<string, string> = {}
  for (const name of moreActivities) {
    await expectOnlyMoreActivities(frame)
    await frame.getByRole('button', { name, exact: true }).click()
    if (name === 'Return to Dojo · Writing') {
      const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
      const warmup = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
      await expect(teacher.or(warmup)).toBeVisible()
      if (await warmup.isVisible()) await warmup.click()
      await expect(teacher).toHaveAttribute('data-step', '1')
      await expect(teacher).toHaveAttribute('data-character-index', '0')
      savedPractice = await records(page)
      await reportAndReturn(page)
      await expect(teacher).toHaveAttribute('data-step', '1')
      expect(await records(page)).toEqual(savedPractice)
      await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
    } else if (name === 'Return to Dojo · Reading') {
      await expect(frame.getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible()
      await reportAndReturn(page)
      await frame.getByRole('button', { name: 'Exit reading', exact: true }).click()
    } else {
      if (name === 'Writing Test') await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
      await expect(frame.locator('.deferred-collection-review')).toHaveAttribute('data-report-position', '1')
      await expect(frame.locator('.practice-count')).toContainText('1 of 8')
      await reportAndReturn(page)
      await expect(frame.locator('.deferred-collection-review')).toHaveAttribute('data-report-position', '1')
      await frame.getByRole('button', { name: 'Exit without saving', exact: true }).click()
    }
    await expectOnlyMoreActivities(frame)
    const afterExit = await records(page)
    for (const [key, raw] of Object.entries(savedPractice)) expect(afterExit[key]).toBe(raw)
    expect(await resultKeys(page)).toEqual([])
  }
  // Reopening Writing uses the original native checkpoint, not a reset caused
  // by the nested navigation or by entering either test.
  await frame.getByRole('button', { name: 'Return to Dojo · Writing', exact: true }).click()
  await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '1')
  const reopened = await records(page)
  for (const [key, raw] of Object.entries(savedPractice)) expect(reopened[key]).toBe(raw)
  await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
  await expectOnlyMoreActivities(frame)
})
