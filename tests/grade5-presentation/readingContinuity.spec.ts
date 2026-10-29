import { expect, type FrameLocator, type Page, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-21T19:00:00Z'))
  await page.context().addInitScript(() => {
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
          throw new DOMException('Synthetic denied microphone', 'NotAllowedError')
        },
      },
    })
  })
})

async function menu(page: Page) {
  await page.goto('/family-beta-preview.html?grade=grade5')
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  return frame
}

const checkpoints = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('family-beta-acquisition-v1:'))),
  )

async function answer(frame: FrameLocator) {
  await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
  await frame.getByRole('button', { name: 'Continue without recording', exact: true }).click()
  await frame.getByRole('button', { name: /^(Yes|Continue)$/ }).click()
}

test('Grade 5 native reading initialization failure keeps Report and Return available and retries safely', async ({
  page,
}) => {
  const frame = await menu(page)
  await frame.locator('body').evaluate(() => {
    const original = Storage.prototype.setItem
    let once = true
    Storage.prototype.setItem = function (key, value) {
      if (once && key.startsWith('family-beta-acquisition-v1:')) {
        once = false
        throw new DOMException('Synthetic full storage', 'QuotaExceededError')
      }
      return original.call(this, key, value)
    }
  })
  await frame.getByRole('button', { name: 'Read the Words', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Retry opening reading', exact: true })).toBeVisible()
  await expect(frame.getByRole('button', { name: 'Return to Grade 5 menu', exact: true })).toBeVisible()
  expect(await checkpoints(page)).toEqual({})
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await page.getByLabel('What did you see or hear?').fill('Synthetic Grade 5 reading initialization check.')
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await frame.getByRole('button', { name: 'Retry opening reading', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible()
  expect(Object.keys(await checkpoints(page))).toHaveLength(1)
})

test('Grade 5 native reading belongs to the selected profile and resumes its exact unfinished trial', async ({
  page,
}) => {
  const frame = await menu(page)
  const profile = JSON.parse((await page.locator('iframe:visible').getAttribute('data-family-profile')) || 'null')
  await frame.getByRole('button', { name: 'Read the Words', exact: true }).click()
  for (let i = 0; i < 4; i++) await answer(frame)
  const current = frame.locator('[data-report-activity="Reading practice"]')
  const phase = await current.getAttribute('data-report-phase')
  const target = await current.getAttribute('data-report-target')
  const before = await checkpoints(page)
  expect(Object.keys(before)).toHaveLength(1)
  const saved = JSON.parse(Object.values(before)[0])
  expect(saved.envelope.childId).toBe(profile.id)
  expect(saved.envelope.grade).toBe('Grade 5')
  expect(saved.envelope.activityModule).toBe('reading-dojo')
  expect(saved.envelope.tier).toBe('tier-2')
  expect(saved.envelope.lessonSnapshot.targetSet.targets.map((item: { text: string }) => item.text)).toEqual([
    '或者',
    '了解',
    '完',
    '兴奋的',
    '告诉',
    '沟通',
    '快速地',
    '有意思',
  ])
  await frame.getByRole('button', { name: 'Exit reading', exact: true }).click()
  const reopened = await menu(page)
  await reopened.getByRole('button', { name: 'Read the Words', exact: true }).click()
  await expect(reopened.locator('[data-report-activity="Reading practice"]')).toHaveAttribute(
    'data-report-phase',
    phase!,
  )
  await expect(reopened.locator('[data-report-activity="Reading practice"]')).toHaveAttribute(
    'data-report-target',
    target!,
  )
  expect(await checkpoints(page)).toEqual(before)
})

test('Grade 5 stale native reading Done cannot adopt another tab’s reviewed work', async ({ page, context }) => {
  const frame = await menu(page)
  await frame.getByRole('button', { name: 'Read the Words', exact: true }).click()
  const other = await context.newPage()
  const otherFrame = await menu(other)
  await otherFrame.getByRole('button', { name: 'Read the Words', exact: true }).click()
  for (let i = 0; i < 4; i++) await answer(otherFrame)
  const before = await checkpoints(page)
  await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
  await expect(frame.getByText(/This activity changed in another tab/)).toBeVisible()
  expect(await checkpoints(page)).toEqual(before)
  await answer(otherFrame)
  expect(await checkpoints(page)).not.toEqual(before)
  await other.close()
})

test('Grade 5 native reading Done before a scored response exits without creating a result', async ({ page }) => {
  const frame = await menu(page)
  await frame.getByRole('button', { name: 'Read the Words', exact: true }).click()
  const before = await checkpoints(page)
  await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Read the Words', exact: true })).toBeVisible()
  expect(await checkpoints(page)).toEqual(before)
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith('family-beta-preview-results-v1:')),
    ),
  ).toEqual([])
})

test('Grade 5 native reading retries a failed result save before finishing its session', async ({ page }) => {
  const frame = await menu(page)
  await frame.getByRole('button', { name: 'Read the Words', exact: true }).click()
  for (let i = 0; i < 4; i++) await answer(frame)
  const before = await checkpoints(page)
  const sessionId = JSON.parse(Object.values(before)[0]).sessionId
  await frame.locator('body').evaluate(() => {
    const original = Storage.prototype.setItem
    let once = true
    Storage.prototype.setItem = function (key, value) {
      if (once && key.startsWith('family-beta-preview-results-v1:')) {
        once = false
        throw new DOMException('Synthetic failed result confirmation', 'QuotaExceededError')
      }
      return original.call(this, key, value)
    }
  })
  await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
  await expect(frame.locator('[role="alert"]')).toContainText('Synthetic failed result confirmation')
  expect(await checkpoints(page)).toEqual(before)
  await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Read the Words', exact: true })).toBeVisible()
  const result = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem(`family-beta-preview-results-v1:${id}`) || 'null'),
    sessionId,
  )
  expect(result.id).toBe(sessionId)
  expect(result.attempted).toBeGreaterThan(0)
  expect(result.channel).toBe('reading')
  expect(await checkpoints(page)).toEqual(before)
})
