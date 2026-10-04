import { expect, test } from './fixtures.ts'
import { installGrade2CurriculumFixture } from './grade2Curriculum.ts'
import { openGrade2LearningActivity } from './learningHub.ts'

const APP_STATE_KEY = 'weekly-dictation-state-v2'

type StoredAcquisitionSnapshot = {
  revision: number
  promptId: string | null
  receiptCount: number
  resultCount: number
}

async function storedAcquisitionSnapshot(page: import('@playwright/test').Page): Promise<StoredAcquisitionSnapshot> {
  return page.evaluate((stateKey) => {
    const raw = window.localStorage.getItem(stateKey)
    if (!raw) throw new Error('The local application state was not saved.')
    const state = JSON.parse(raw)
    const envelope = state.acquisitionProgressEnvelopes?.[0]
    if (!envelope) throw new Error('No versioned Acquisition envelope was saved.')
    return {
      revision: envelope.revision,
      promptId: envelope.flow?.prompt?.id || null,
      receiptCount: state.acquisitionTransitionReceipts?.length || 0,
      resultCount: state.results?.length || 0,
    }
  }, APP_STATE_KEY)
}

test('a reviewed Acquisition response resumes at the exact next prompt after reload', async ({ page }) => {
  await installGrade2CurriculumFixture(page)
  await page.goto('/?testDate=2026-09-29')
  await expect(page.locator('.curriculum-source-status')).toContainText('Loaded 4 weekly datasets')
  await openGrade2LearningActivity(page, 'Enter the Dojo', 'Learn to Write')
  await page.getByRole('button', { name: 'Skip Warmup' }).click()
  await expect(page.getByRole('button', { name: 'Skip Timer' })).toBeVisible()

  const beforeAnswer = await storedAcquisitionSnapshot(page)
  expect(beforeAnswer.revision).toBe(0)
  expect(beforeAnswer.promptId).toBeTruthy()

  await page.getByRole('button', { name: 'Skip Timer' }).click()
  await page.getByRole('button', { name: /I got it right/i }).click()

  await expect.poll(async () => (await storedAcquisitionSnapshot(page)).revision).toBe(beforeAnswer.revision + 1)
  const afterAnswer = await storedAcquisitionSnapshot(page)
  expect(afterAnswer.promptId).not.toBe(beforeAnswer.promptId)
  expect(afterAnswer.receiptCount).toBe(1)

  await page.reload()
  await openGrade2LearningActivity(page, 'Enter the Dojo', 'Learn to Write')
  await page.getByRole('button', { name: 'Skip Warmup' }).click()
  await expect(page.getByRole('button', { name: 'Skip Timer' })).toBeVisible()

  const resumed = await storedAcquisitionSnapshot(page)
  expect(resumed).toEqual(afterAnswer)
})
