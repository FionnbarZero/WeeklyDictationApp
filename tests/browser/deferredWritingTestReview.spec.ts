import { expect, test } from './fixtures.ts'
import { installGrade2CurriculumFixture } from './grade2Curriculum.ts'
import { openGrade2LearningActivity } from './learningHub.ts'

const APP_STATE_KEY = 'weekly-dictation-state-v2'

async function storedReviewSnapshot(page: import('@playwright/test').Page) {
  return page.evaluate((stateKey) => {
    const state = JSON.parse(window.localStorage.getItem(stateKey) || '{}')
    const results = (state.results || []).filter((item: { phase: string }) => item.phase === 'test-review')
    const scores = (state.scores || []).filter((item: { phase: string }) => item.phase === 'test-review')
    return {
      results,
      scores,
      completed: (state.completedSessions || []).filter(
        (item: { primaryPhase: string; outcome: string }) =>
          item.primaryPhase === 'test-review' && item.outcome === 'completed',
      ),
    }
  }, APP_STATE_KEY)
}

async function openGrade2WritingReview(page: import('@playwright/test').Page, audioAvailable = true) {
  // This checks scoring, not the host OS voice service. Keep the real prompt
  // sequencing and audio gate, with explicit success/error speech events.
  await page.addInitScript((available) => {
    let enabled = available
    const pending = new Set<ReturnType<typeof setTimeout>>()
    window.addEventListener('review-test-enable-speech', () => {
      enabled = true
    })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {
          for (const timer of pending) clearTimeout(timer)
          pending.clear()
        },
        resume() {},
        getVoices() {
          return []
        },
        speak(utterance: SpeechSynthesisUtterance) {
          const timer = setTimeout(() => {
            pending.delete(timer)
            if (!enabled) utterance.onerror?.({} as SpeechSynthesisErrorEvent)
            else {
              utterance.onstart?.({} as SpeechSynthesisEvent)
              utterance.onend?.({} as SpeechSynthesisEvent)
            }
          }, 0)
          pending.add(timer)
        },
      },
    })
  }, audioAvailable)
  await installGrade2CurriculumFixture(page)
  await page.goto('/?testDate=2026-09-29')
  await expect(page.locator('.curriculum-source-status')).toContainText('Loaded 4 weekly datasets')
  await openGrade2LearningActivity(page, 'The Final Boss Test', 'Writing Test')
  await page.getByRole('button', { name: 'Skip Warmup' }).click()
}

test('Grade 2 writing responses stay provisional until one final all-target review', async ({ page }) => {
  await openGrade2WritingReview(page)

  await expect(page.getByText('出生', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Yes' })).toHaveCount(0)

  for (let index = 0; index < 5; index += 1) {
    // A completed collector deliberately ignores a second click. Wait for the
    // next keyed prompt rather than sending another click to the previous one.
    await expect(
      page.getByRole('heading', { name: `Listen, then write word ${index + 1}.`, exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Skip Timer' }).click()
  }

  const provisional = await storedReviewSnapshot(page)
  expect(provisional.results).toHaveLength(0)
  expect(provisional.scores).toHaveLength(0)
  expect(provisional.completed).toHaveLength(0)

  await expect(page.getByRole('heading', { name: /Review everything/ })).toBeVisible()
  for (const term of ['出生', '但是', '运动', '地方', '不同']) {
    await expect(page.getByText(term, { exact: true })).toBeVisible()
  }

  const correctButtons = page.getByRole('button', { name: 'Yes' })
  await expect(correctButtons).toHaveCount(5)
  for (let index = 0; index < 5; index += 1) await correctButtons.nth(index).click()
  await page.getByRole('button', { name: 'Submit final review' }).click()

  await expect(page.getByText(/Practice complete/)).toBeVisible()
  await expect.poll(async () => (await storedReviewSnapshot(page)).results.length).toBe(5)
  const stored = await storedReviewSnapshot(page)
  expect(stored.scores).toHaveLength(1)
  expect(stored.completed).toHaveLength(1)
  expect(stored.results.every((item: { revealMethod: string }) => item.revealMethod === 'skip_timer')).toBe(true)
})

test('exiting during collection discards the provisional writing review', async ({ page }) => {
  await openGrade2WritingReview(page)
  await page.getByRole('button', { name: 'Skip Timer' }).click()
  await page.getByRole('button', { name: 'Exit without saving' }).click()
  const confirmation = page.getByRole('dialog', { name: 'Exit without saving?' })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Exit without saving' }).click()

  await expect(page.getByRole('heading', { name: /Ready for your next challenge/ })).toBeVisible()
  const stored = await storedReviewSnapshot(page)
  expect(stored.results).toHaveLength(0)
  expect(stored.scores).toHaveLength(0)
  expect(stored.completed).toHaveLength(0)
})

test('failed writing audio blocks collection until a successful retry', async ({ page }) => {
  await openGrade2WritingReview(page, false)
  await expect(page.getByText('The spoken prompt did not play.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Skip Timer' })).toBeDisabled()
  const blocked = await storedReviewSnapshot(page)
  expect(blocked.results).toHaveLength(0)
  expect(blocked.scores).toHaveLength(0)
  expect(blocked.completed).toHaveLength(0)

  await page.evaluate(() => dispatchEvent(new Event('review-test-enable-speech')))
  await page.getByRole('button', { name: 'Try audio again' }).click()
  await expect(page.getByRole('button', { name: 'Skip Timer' })).toBeEnabled()
  await page.getByRole('button', { name: 'Skip Timer' }).click()
  await expect(page.getByRole('heading', { name: 'Listen, then write word 2.' })).toBeVisible()
  expect(await storedReviewSnapshot(page)).toEqual(blocked)
})
