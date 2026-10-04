import assert from 'node:assert/strict'
import test from 'node:test'
import type { PracticeSession } from '../src/domain.ts'
import type { Grade5ActivityLaunchRequest } from '../src/grade5Lab/learningHub.ts'
import {
  GRADE5_LAB_STORAGE_KEY,
  appendGrade5LabResult,
  emptyGrade5LabProgress,
  grade5RequestKey,
  readGrade5LabProgress,
  saveGrade5WritingRun,
  writeGrade5LabProgress,
} from '../src/grade5Lab/persistence.ts'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() {
    return this.values.size
  }
  clear() {
    this.values.clear()
  }
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.values.delete(key)
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

const request: Grade5ActivityLaunchRequest = {
  cohortId: 'grade-5-week',
  eligibleCohortIds: ['grade-5-week'],
  stage: 'test-review-1',
  learningChannel: 'tier-1-writing',
  activityKind: 'test-review',
  warmupMaximum: 6,
  preActivityWarmupRequirement: 'required',
}

const session: PracticeSession = {
  id: 'grade-5-run',
  childId: 'grade-5-lab-child',
  grade: 'Grade 5',
  primaryDatasetId: 'grade-5-week',
  reviewCycle: 1,
  primaryPhase: 'test-review',
  segment: 'warmup',
  stage: 'warmup-intro',
  queue: [],
  warmupQueue: [],
  primaryQueue: [],
  index: 0,
  startedAt: '2026-10-03T12:00:00.000Z',
  warmupAnswers: [],
  primaryAnswers: [],
  warmupCategoryByWordId: {},
  warmupRandomRotationWordIds: [],
  warmupRotationCycleId: 1,
}

test('Grade 5 activity position survives a device-storage round trip', () => {
  const progress = saveGrade5WritingRun(
    emptyGrade5LabProgress(),
    request,
    session,
    null,
    'timer',
    '2026-10-03T12:01:00.000Z',
  )
  const storage = new MemoryStorage()
  assert.equal(writeGrade5LabProgress(storage, progress), true)
  const restored = readGrade5LabProgress(storage)

  assert.equal(restored.activeWriting?.requestKey, grade5RequestKey(request))
  assert.deepEqual(restored.activeWriting?.session, session)
  assert.doesNotMatch(JSON.stringify(restored), /audio|blob:|data:audio/i)
})

test('Grade 5 keeps Test Review 1 and Test Review 2 as separate durable results', () => {
  const active = saveGrade5WritingRun(emptyGrade5LabProgress(), request, session, null, 'timer')
  const first = appendGrade5LabResult(active, {
    id: 'review-1',
    channel: 'tier-1-writing',
    activityKind: 'test-review',
    stage: 'test-review-1',
    cohortId: 'grade-5-week-1',
    reviewCycle: 1,
    correct: 5,
    total: 6,
    answers: [],
    completedAt: '2026-10-03T12:02:00.000Z',
  })
  const second = appendGrade5LabResult(first, {
    id: 'review-2',
    channel: 'tier-1-writing',
    activityKind: 'test-review',
    stage: 'test-review-2',
    cohortId: 'grade-5-week-2',
    reviewCycle: 2,
    correct: 6,
    total: 6,
    answers: [],
    completedAt: '2026-10-03T12:03:00.000Z',
  })

  assert.equal(second.activeWriting, undefined)
  assert.deepEqual(
    second.results.map((result) => result.reviewCycle),
    [1, 2],
  )
})

test('Grade 5 rejects an unrecognized device-persistence schema', () => {
  const storage = new MemoryStorage()
  storage.setItem(GRADE5_LAB_STORAGE_KEY, JSON.stringify({ schema: 'future-schema', results: [] }))
  assert.deepEqual(readGrade5LabProgress(storage), emptyGrade5LabProgress())
})
