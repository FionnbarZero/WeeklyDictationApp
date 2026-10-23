import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createWritingProgress,
  advanceWritingProgress,
  teachingPosition,
  validateWritingProgress,
} from '../src/application/writingAcquisition/progress.ts'
import { writingPreviewLesson, REFINEMENT_PREVIEW_POLICY } from '../src/writingAcquisition/previewLesson.ts'
import { COPY_MEMORY_WRITING_POLICY } from '../src/writingAcquisition/correctionStrategy.ts'
import { openWritingStore } from '../src/infrastructure/writingProgressStore.ts'

const now = '2026-10-23T18:00:00.000Z'
const random = () => 0.25
const owner = 'long-writing-test'

for (const policy of [REFINEMENT_PREVIEW_POLICY, COPY_MEMORY_WRITING_POLICY]) {
  test(`${policy}: continue past 500 assessments without discarding history or changing correction`, () => {
    let progress = createWritingProgress(writingPreviewLesson(policy), owner, 'long-attempt', now, { random })
    while (teachingPosition(progress))
      progress = advanceWritingProgress(
        progress,
        {
          id: `teach-${progress.revision}`,
          kind: 'complete-teaching-step',
          expectedRevision: progress.revision,
          position: teachingPosition(progress)!,
        },
        now,
        random,
      )
    const answer = (correct = false) => {
      progress = advanceWritingProgress(
        progress,
        {
          id: `answer-${progress.revision}`,
          kind: 'answer',
          expectedRevision: progress.revision,
          promptId: progress.acquisition.flow.prompt!.id,
          correct,
          revealMethod: 'skip_timer',
        },
        now,
        random,
      )
    }
    while (progress.assessments.length < 500) answer()
    const first500 = JSON.stringify(progress.assessments)
    while (progress.acquisition.flow.prompt!.kind === 'show-copy') answer()
    const bytes = JSON.stringify(progress)
    const records = new Map([['writing', bytes]])
    const storage = {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => {
        records.set(key, value)
      },
    }
    const store = openWritingStore(storage, 'writing', owner, () => {
      throw new Error('Must resume')
    })
    const command = {
      id: `answer-${progress.revision}`,
      kind: 'answer' as const,
      expectedRevision: progress.revision,
      promptId: progress.acquisition.flow.prompt!.id,
      correct: true,
      revealMethod: 'skip_timer',
    }
    progress = store.apply(command, now, random)
    assert.equal(progress.assessments.length, 501)
    assert.equal(JSON.stringify(progress.assessments.slice(0, 500)), first500)
    assert.equal(progress.assessments[500].correct, true)
    const saved = records.get('writing')!
    const reopened = openWritingStore(storage, 'writing', owner, () => {
      throw new Error('Must resume')
    })
    assert.equal(JSON.stringify(reopened.current), JSON.stringify(progress))
    assert.equal(JSON.stringify(reopened.apply(command, now, random)), JSON.stringify(progress))
    assert.equal(records.get('writing'), saved)
    validateWritingProgress(progress, owner)
    assert.equal(JSON.parse(bytes).assessments.length, 500)
  })
}
