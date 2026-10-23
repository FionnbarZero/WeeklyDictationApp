import { expect, type Page, test } from '@playwright/test'
import { buildAcquisitionCheckpoint } from '../../src/acquisition/persistence/reducer.ts'
import {
  acquisitionPersistenceContext,
  applyAcquisitionCheckpointToAppState,
} from '../../src/application/acquisitionPersistence.ts'
import * as pilot from '../../src/application/writingAcquisition/pilot.ts'
import type { AppState } from '../../src/domain.ts'
import { practiceWorkspaceKey, practiceWorkspaceStorage } from '../../src/familyBeta/practiceWorkspaceStorage.ts'
import { finishEnabledTeacher } from '../family-sync/writingTeacherDriver.ts'

const child = 'preview-1'
const key = practiceWorkspaceKey(child)
const stateKey = 'weekly-dictation-state-v2'
function disk(records: Record<string, string>) {
  return {
    get length() {
      return Object.keys(records).length
    },
    key: (i: number) => Object.keys(records)[i] ?? null,
    getItem: (k: string) => records[k] ?? null,
    setItem: (k: string, v: string) => {
      records[k] = v
    },
  }
}
async function read(page: Page) {
  const records = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  const storage = practiceWorkspaceStorage(disk(records), child)
  const state = JSON.parse(storage.getItem(stateKey)!) as AppState
  return { records, storage, state, progress: state.writingAcquisitionProgress![0] }
}
async function open(page: Page) {
  await page.goto('/family-beta-preview.html?grade=grade2')
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
  const warmup = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
  await expect(warmup.or(frame.getByRole('button', { name: 'Exit game', exact: true }))).toBeVisible()
  if (await warmup.isVisible()) await warmup.click()
  return frame
}

test('long Grade 2 writing crosses 500, reloads and continues without losing scores or the correction position', async ({
  page,
  context,
  baseURL,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-16T19:00:00Z'))
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === new URL(baseURL!).origin ? route.continue() : route.abort(),
  )
  await context.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices() {
          return []
        },
        speak(u: SpeechSynthesisUtterance) {
          u.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 5)
        },
      },
    })
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 5)
      return Promise.resolve()
    }
  })
  await open(page)
  await finishEnabledTeacher(page)
  const initial = await read(page)
  let state = initial.state
  // Fast-forward synthetic history using real reducers, not forged counters or
  // teaching completion. The actual UI submits the boundary answers below.
  while (
    state.writingAcquisitionProgress![0].assessments.length < 499 ||
    state.writingAcquisitionProgress![0].acquisition.flow.prompt!.kind === 'show-copy'
  ) {
    const p = state.writingAcquisitionProgress![0]
    const dataset = state.datasets.find((d) => d.id === p.lesson.dataset.id)!
    const persistence = acquisitionPersistenceContext(child, dataset, 'Grade 2', p.acquisition)
    const checkpoint = buildAcquisitionCheckpoint({
      envelope: p.acquisition,
      context: persistence,
      sessionId: 'long-browser-visit',
      answeredPromptId: p.acquisition.flow.prompt!.id,
      occurredAt: p.updatedAt,
      response: { correct: false, revealMethod: 'skip_timer' },
      random: () => 0.25,
    })
    const applied = applyAcquisitionCheckpointToAppState(state, checkpoint, persistence, false)
    if (applied.status === 'conflict') throw new Error(applied.reason)
    state = pilot.withCheckpoint(state, applied.state, checkpoint)
  }
  initial.storage.setItem(stateKey, JSON.stringify(state))
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw: initial.records[key] })
  let frame = await open(page)
  const answer = async (correct: boolean) => {
    const skip = frame.getByRole('button', { name: 'Skip Timer', exact: true })
    const response = frame.getByRole('button', { name: correct ? 'I got it right' : 'I got it wrong', exact: true })
    await expect(skip.or(response)).toBeVisible()
    if (await skip.isVisible()) await skip.click()
    await response.click()
  }
  await answer(false)
  await expect.poll(async () => (await read(page)).progress.assessments.length).toBe(500)
  await answer(true) // unscored copy
  const at500 = await read(page)
  expect(at500.progress.acquisition.flow.prompt!.kind).toBe('target')
  frame = await open(page)
  expect(JSON.stringify((await read(page)).state.results)).toBe(JSON.stringify(at500.state.results))
  await answer(true)
  await expect.poll(async () => (await read(page)).progress.assessments.length).toBe(501)
  const after = await read(page)
  expect(after.state.results).toHaveLength(at500.state.results.length + 1)
  expect(JSON.stringify(after.state.results.slice(0, -1))).toBe(JSON.stringify(at500.state.results))
  expect(after.progress.acquisition.flow.phase).toBe('expanded-trials')
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  expect((await read(page)).records[key]).toBe(after.records[key])
  await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
  frame = await open(page)
  const reopened = await read(page)
  // Opening another visit legitimately adds a warmup visit/skip receipt. All
  // writing progress, answer history, scores and other saved facts must persist.
  const { warmupVisitsV1, warmupTransitionReceiptsV1, ...restoredFacts } = reopened.state
  const { warmupVisitsV1: oldVisits, warmupTransitionReceiptsV1: oldReceipts, ...savedFacts } = after.state
  expect(restoredFacts).toEqual(savedFacts)
  expect(warmupVisitsV1).toHaveLength((oldVisits?.length ?? 0) + 1)
  expect(warmupTransitionReceiptsV1).toHaveLength((oldReceipts?.length ?? 0) + 1)
  expect(warmupVisitsV1!.slice(0, -1)).toEqual(oldVisits)
  expect(warmupTransitionReceiptsV1!.slice(0, -1)).toEqual(oldReceipts)
})
