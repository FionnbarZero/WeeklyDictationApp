import { expect, test } from './fixtures.ts'
import { installGrade2CurriculumFixture } from './grade2Curriculum.ts'
import { openGrade2LearningActivity } from './learningHub.ts'

const APP_STATE_KEY = 'weekly-dictation-state-v2'
const SESSION_ONLY_NOTE = 'Prototype reading visit · recording and results are not saved yet'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class FakeSpeechSynthesisUtterance {
      text: string
      lang = ''
      rate = 1
      onend: null | (() => void) = null
      onerror: null | (() => void) = null

      constructor(text: string) {
        this.text = text
      }
    }

    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: FakeSpeechSynthesisUtterance,
    })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        speak(utterance: FakeSpeechSynthesisUtterance) {
          window.setTimeout(() => utterance.onend?.(), 0)
        },
      },
    })
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: class FakeMediaRecorder {
        static isTypeSupported() {
          return true
        }
      },
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        async getUserMedia() {
          throw new DOMException('Microphone permission was not granted.', 'NotAllowedError')
        },
      },
    })
  })

  await installGrade2CurriculumFixture(page)
  await page.goto('/?testDate=2026-09-29')
  await expect(page.locator('.curriculum-source-status')).toContainText('Loaded 4 weekly datasets')
})

test('Grade 2 exposes all Tier 2 routes and recovers from microphone denial without persisting reading results', async ({
  page,
}) => {
  const storedCounts = () =>
    page.evaluate((stateKey) => {
      const state = JSON.parse(window.localStorage.getItem(stateKey) || '{}')
      return {
        results: state.results?.length || 0,
        scores: state.scores?.length || 0,
      }
    }, APP_STATE_KEY)
  const before = await storedCounts()

  await openGrade2LearningActivity(page, 'Enter the Dojo', 'Read the Words')
  await expect(page.getByText(SESSION_ONLY_NOTE, { exact: true })).toBeVisible()
  await expect(page.getByText(/Learn to Read · 1 of 3/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Record my reading' })).toBeVisible()
  await page.getByRole('button', { name: 'Exit reading' }).click()

  await openGrade2LearningActivity(page, 'The Final Boss Test', 'Reading Test')
  await expect(page.getByText(SESSION_ONLY_NOTE, { exact: true })).toBeVisible()
  await expect(page.getByText('Collect first', { exact: true })).toBeVisible()
  await expect(page.getByText(/model pronunciation and correctness buttons stay hidden until every response is collected/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Record my reading' })).toBeVisible()
  await page.getByRole('button', { name: 'Exit reading' }).click()
  await expect(page.getByRole('heading', { name: 'Exit without saving?' })).toBeVisible()
  await page.getByRole('button', { name: 'Exit without saving' }).click()

  await openGrade2LearningActivity(page, 'Enter the Spirit Realm', 'Reading mastery')
  await expect(page.getByText(SESSION_ONLY_NOTE, { exact: true })).toBeVisible()
  await expect(page.getByText('Mastery reading', { exact: true })).toBeVisible()

  for (let position = 0; position < 10; position += 1) {
    if (await page.getByRole('heading', { name: 'Reading path complete' }).isVisible()) break
    await page.getByRole('button', { name: 'Record my reading' }).click()
    const fallback = page.getByRole('alert').filter({ hasText: 'Recording is unavailable.' })
    await expect(fallback).toContainText('Microphone permission was not granted.')
    await page.getByRole('button', { name: 'Continue without recording' }).click()
    await expect(page.getByText('Did your reading match the example?')).toBeVisible()
    await page.getByRole('button', { name: 'Yes' }).click()
  }

  await expect(page.getByRole('heading', { name: 'Reading path complete' })).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText(/This prototype reading visit was not saved\./)).toBeVisible()
  expect(await storedCounts()).toEqual(before)
})
