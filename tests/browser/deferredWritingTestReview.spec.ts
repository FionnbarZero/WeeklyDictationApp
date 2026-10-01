import { expect, test } from '@playwright/test'
import path from 'node:path'
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
      completed: (state.completedSessions || []).filter((item: { primaryPhase: string; outcome: string }) => item.primaryPhase === 'test-review' && item.outcome === 'completed'),
    }
  }, APP_STATE_KEY)
}

async function openGrade2WritingReview(page: import('@playwright/test').Page) {
  await page.goto('/?testDate=2026-09-29')
  await page.locator('input[type="file"]').setInputFiles(path.resolve('tests/fixtures/grade2-presentation.json'))
  await expect(page.locator('.local-import-status')).toContainText('Validated 4 weekly datasets')
  await openGrade2LearningActivity(page, 'The Final Boss Test', 'Writing Test')
  await page.getByRole('button', { name: 'Skip Warmup' }).click()
}

test('Grade 2 writing responses stay provisional until one final all-target review', async ({ page }) => {
  await openGrade2WritingReview(page)

  await expect(page.getByText('出生', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Yes' })).toHaveCount(0)

  for (let index = 0; index < 5; index += 1) {
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
  await page.getByRole('button', { name: 'Exit practice' }).click()

  await expect(page.getByRole('heading', { name: /Ready for your next challenge/ })).toBeVisible()
  const stored = await storedReviewSnapshot(page)
  expect(stored.results).toHaveLength(0)
  expect(stored.scores).toHaveLength(0)
  expect(stored.completed).toHaveLength(0)
})
