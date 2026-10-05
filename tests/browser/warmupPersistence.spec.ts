import { expect, test } from './fixtures.ts'
import path from 'node:path'
import { openGrade2LearningActivity } from './learningHub.ts'

const APP_STATE_KEY = 'weekly-dictation-state-v2'

async function warmupSnapshot(page: import('@playwright/test').Page) {
  return page.evaluate((stateKey) => {
    const raw = window.localStorage.getItem(stateKey)
    if (!raw) throw new Error('The local application state was not saved.')
    const state = JSON.parse(raw)
    const visit =
      state.warmupVisitsV1?.find((candidate: { status: string }) => candidate.status === 'in-progress') ||
      state.warmupVisitsV1?.at(-1)
    if (!visit) throw new Error('No durable Warmup visit was saved.')
    return {
      id: visit.id,
      revision: visit.revision,
      nextPosition: visit.nextPosition,
      attemptedCount: visit.attemptedCount,
      queueIds: visit.queue.map((entry: { id: string }) => entry.id),
      receiptCount: state.warmupTransitionReceiptsV1?.length || 0,
      attemptCount: state.warmupAttemptsV1?.length || 0,
      graphCount: state.warmupGraphPointsV1?.length || 0,
    }
  }, APP_STATE_KEY)
}

test('a reviewed standalone Warmup answer resumes the same queue position and graph point after reload', async ({
  page,
}) => {
  await page.goto('/?testDate=2026-09-29')
  await page.locator('input[type="file"]').setInputFiles(path.resolve('tests/fixtures/grade2-presentation.json'))
  await expect(page.locator('.local-import-status')).toContainText('Validated 4 weekly datasets')

  await openGrade2LearningActivity(page, 'Enter the Spirit Realm', 'Writing mastery warmup')
  await page.getByRole('button', { name: 'Begin Warmup' }).click()
  await expect(page.getByRole('button', { name: 'Skip Timer' })).toBeVisible()
  const before = await warmupSnapshot(page)

  await page.getByRole('button', { name: 'Skip Timer' }).click()
  await page.getByRole('button', { name: /I got it right/i }).click()
  await expect.poll(async () => (await warmupSnapshot(page)).revision).toBe(before.revision + 1)
  const after = await warmupSnapshot(page)
  expect(after.id).toBe(before.id)
  expect(after.nextPosition).toBe(before.nextPosition + 1)
  expect(after.queueIds).toEqual(before.queueIds)
  expect(after.attemptedCount).toBe(1)
  expect(after.receiptCount).toBe(1)
  expect(after.attemptCount).toBe(1)
  expect(after.graphCount).toBe(1)

  await page.reload()
  await openGrade2LearningActivity(page, 'Enter the Spirit Realm', 'Writing mastery warmup')
  await page.getByRole('button', { name: 'Begin Warmup' }).click()
  await expect(page.getByRole('button', { name: 'Skip Timer' })).toBeVisible()
  expect(await warmupSnapshot(page)).toEqual(after)
})

test('a started pre-activity Warmup can finalize one partial graph point and continue to the selected activity', async ({
  page,
}) => {
  await page.goto('/?testDate=2026-09-29')
  await page.locator('input[type="file"]').setInputFiles(path.resolve('tests/fixtures/grade2-presentation.json'))
  await openGrade2LearningActivity(page, 'Enter the Dojo', 'Learn to Write')
  await page.getByRole('button', { name: 'Begin Warmup' }).click()
  await page.getByRole('button', { name: 'Skip Timer' }).click()
  await page.getByRole('button', { name: /I got it right/i }).click()
  await page.getByRole('button', { name: 'Continue to activity' }).click()
  await expect(page.getByText(/Word 1/i)).toBeVisible()
  const snapshot = await warmupSnapshot(page)
  expect(snapshot.attemptedCount).toBe(1)
  expect(snapshot.graphCount).toBe(1)
  const visitStatus = await page.evaluate((stateKey) => {
    const state = JSON.parse(window.localStorage.getItem(stateKey) || '{}')
    return state.warmupVisitsV1?.at(-1)?.status
  }, APP_STATE_KEY)
  expect(visitStatus).toBe('partial')
})

test('restored monthly Mastery totals remain visible without becoming invented visit graph points', async ({
  page,
}) => {
  await page.goto('/?testDate=2026-09-29')
  await page.locator('input[type="file"]').setInputFiles(path.resolve('tests/fixtures/grade2-presentation.json'))
  await expect(page.locator('.local-import-status')).toContainText('Validated 4 weekly datasets')

  const legacyMonthlyScore = {
    id: 'learner-a-random-rotation-2026-09',
    childId: 'learner-a',
    month: '2026-09',
    correct: 7,
    total: 10,
    percent: 70,
    status: 'finalized',
    updatedAt: '2026-10-01T00:00:00.000Z',
    finalizedAt: '2026-10-01T00:00:00.000Z',
  }
  await page.evaluate(
    ({ stateKey, score }) => {
      const state = JSON.parse(window.localStorage.getItem(stateKey) || '{}')
      state.monthlyRotationScores = [score]
      state.warmupGraphPointsV1 = []
      window.localStorage.setItem(stateKey, JSON.stringify(state))
    },
    { stateKey: APP_STATE_KEY, score: legacyMonthlyScore },
  )

  await page.reload()
  await page.getByRole('button', { name: 'Progress' }).click()
  const legacyHistory = page.getByRole('region', { name: 'Earlier Mastery history' })
  await expect(legacyHistory).toContainText('September 2026')
  await expect(legacyHistory).toContainText('7/10 correct')
  await expect(legacyHistory).toContainText('70%')
  await expect(page.getByText('Complete at least one Warmup answer to begin this graph.')).toBeVisible()

  const stored = await page.evaluate((stateKey) => {
    const state = JSON.parse(window.localStorage.getItem(stateKey) || '{}')
    return {
      monthlyRotationScores: state.monthlyRotationScores,
      warmupGraphPointsV1: state.warmupGraphPointsV1,
    }
  }, APP_STATE_KEY)
  expect(stored.monthlyRotationScores).toEqual([legacyMonthlyScore])
  expect(stored.warmupGraphPointsV1).toEqual([])
})
