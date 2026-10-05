import path from 'node:path'
import { readFileSync } from 'node:fs'
import { expect, test } from './fixtures.ts'
import { openGrade2LearningActivity } from './learningHub.ts'

const APP_STATE_KEY = 'weekly-dictation-state-v2'

async function savedPromptId(page: import('@playwright/test').Page) {
  return page.evaluate((stateKey) => {
    const raw = window.localStorage.getItem(stateKey)
    const state = raw ? JSON.parse(raw) : null
    return state?.acquisitionProgressEnvelopes?.[0]?.flow?.prompt?.id || null
  }, APP_STATE_KEY)
}

async function savedExperiencePromptId(
  page: import('@playwright/test').Page,
  experienceId: 'reading' | 'stroke-order',
) {
  return page.evaluate(
    ({ stateKey, experience }) => {
      const raw = window.localStorage.getItem(stateKey)
      const state = raw ? JSON.parse(raw) : null
      return (
        state?.acquisitionProgressEnvelopes?.find(
          (entry: { experienceId?: string }) => entry.experienceId === experience,
        )?.flow?.prompt?.id || null
      )
    },
    { stateKey: APP_STATE_KEY, experience: experienceId },
  )
}

async function importFixture(
  page: import('@playwright/test').Page,
  testDate = '2026-09-16',
  options: { readonly includeNextWeek?: boolean } = {},
) {
  await page.goto(`/?testDate=${testDate}`)
  const fixturePath = path.resolve('tests/fixtures/grade2-presentation.json')
  if (options.includeNextWeek) {
    const payload = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      slides: Array<{ objectId: string; text: string }>
    }
    payload.slides.unshift({
      objectId: 'browser-reentry-next-week',
      text: 'Week 9/28-10/2\nMandarin\nTier 1: 大，小，上，下，中\nTier 2: 我，你',
    })
    await page.locator('input[type="file"]').setInputFiles({
      name: 'grade2-reentry-presentation.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(payload)),
    })
    await expect(page.locator('.local-import-status')).toContainText('Validated 5 weekly datasets')
    return
  }
  await page.locator('input[type="file"]').setInputFiles(fixturePath)
  await expect(page.locator('.local-import-status')).toContainText('Validated 4 weekly datasets')
}

test('a historical Writing cohort can be selected by date and resumed from the Dojo', async ({ page }) => {
  await importFixture(page)

  await openGrade2LearningActivity(page, 'Enter the Dojo', 'Learn to Write')
  await page.getByRole('button', { name: 'Skip Warmup' }).click()
  await page.getByRole('button', { name: 'Skip Timer' }).click()
  await page.getByRole('button', { name: /I got it right/i }).click()
  await expect.poll(() => savedPromptId(page)).not.toBeNull()
  const promptBeforeRollover = await savedPromptId(page)
  await page.getByRole('button', { name: 'Exit practice' }).click()

  await page.goto('/?testDate=2026-09-22')
  await page.getByRole('button', { name: /Enter the Dojo/i }).click()
  await page.locator('summary').filter({ hasText: 'Reenter' }).click()

  const datePicker = page.getByRole('combobox', { name: 'Choose a historical date' })
  await expect(datePicker).toHaveValue('grade-2__2026-27__2026-09-14__2026-09-18')
  await expect(page.getByRole('button', { name: /Continue Writing/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Stroke Order Unavailable/ })).toBeDisabled()
  await expect(page.getByRole('button', { name: /Start Reading/ })).toBeVisible()

  await page.getByRole('button', { name: /Continue Writing/ }).click()
  await page.getByRole('button', { name: 'Skip Warmup' }).click()
  await expect.poll(() => savedPromptId(page)).toBe(promptBeforeRollover)
})

test('Reading reopens the exact historical prompt after a fresh Warmup', async ({ page }) => {
  await importFixture(page)
  await openGrade2LearningActivity(page, 'Enter the Dojo', 'Read the Words')
  await page.getByRole('button', { name: 'Skip Warmup' }).click()
  await expect.poll(() => savedExperiencePromptId(page, 'reading')).not.toBeNull()
  const promptBeforeRollover = await savedExperiencePromptId(page, 'reading')
  await page.getByRole('button', { name: 'Exit reading' }).click()

  await page.goto('/?testDate=2026-09-22')
  await page.getByRole('button', { name: /Enter the Dojo/i }).click()
  await page.locator('summary').filter({ hasText: 'Reenter' }).click()
  await page.getByRole('button', { name: /Continue Reading/ }).click()
  await page.getByRole('button', { name: 'Skip Warmup' }).click()
  await expect.poll(() => savedExperiencePromptId(page, 'reading')).toBe(promptBeforeRollover)
})

test('Stroke Order resumes the checkpointed historical prompt with a blank pad', async ({ page }) => {
  await importFixture(page, '2026-09-22', { includeNextWeek: true })
  await openGrade2LearningActivity(page, 'Enter the Dojo', 'Stroke Order')
  await page.getByRole('button', { name: 'Skip Warmup' }).click()
  await page.getByRole('button', { name: 'Review now' }).click()
  await page.getByRole('button', { name: /I got it right/i }).click()
  await expect.poll(() => savedExperiencePromptId(page, 'stroke-order')).not.toBeNull()
  const promptBeforeRollover = await savedExperiencePromptId(page, 'stroke-order')
  await page.getByRole('button', { name: 'Exit game' }).click()

  await page.goto('/?testDate=2026-09-29')
  await page.getByRole('button', { name: /Enter the Dojo/i }).click()
  await page.locator('summary').filter({ hasText: 'Reenter' }).click()
  await page.getByRole('button', { name: /Continue Stroke Order/ }).click()
  await page.getByRole('button', { name: 'Skip Warmup' }).click()
  await expect.poll(() => savedExperiencePromptId(page, 'stroke-order')).toBe(promptBeforeRollover)
  await expect(page.locator('.so-student-ink path:not(.so-active-ink)')).toHaveCount(0)
})
