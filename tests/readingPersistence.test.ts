import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activeTier2ReadingProgress,
  checkpointTier2ReadingProgress,
  completeTier2ReadingProgress,
  mergeTier2ReadingProgress,
} from '../src/application/readingPersistence.ts'
import { createInitialState } from '../src/domain.ts'
import {
  TIER2_READING_PROGRESS_CONTRACT_ID,
  TIER2_READING_PROGRESS_SCHEMA_VERSION,
  type Tier2ReadingProgressRecord,
} from '../src/readingPractice/contracts.ts'
import { readLocalTier2ReadingProgress, writeLocalTier2ReadingProgress } from '../src/persistence/tier2ReadingLocal.ts'
import type { Tier2ReadingPathway, Tier2ReadingTarget } from '../src/tier2/contracts.ts'
import { grade2Tier2ReadingProfile } from '../src/tier2/profiles/grade2.ts'
import {
  decodeTier2ReadingCloudProgress,
  encodeTier2ReadingCloudProgress,
} from '../src/persistence/tier2ReadingCloud.ts'

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

const target: Tier2ReadingTarget = {
  id: 'reading-target-1',
  text: '帮助',
  sentence: '',
  datasetId: 'grade2-reading-week',
  grade: 'Grade 2',
  language: 'mandarin',
  tier: 'tier-2',
  activityType: 'reading',
}

const pathway: Tier2ReadingPathway = {
  kind: 'test-review',
  cycle: 1,
  cohorts: [{ datasetId: target.datasetId, targets: [target], available: true }],
  available: true,
}

function progress(revision = 1): Tier2ReadingProgressRecord {
  return {
    schemaVersion: TIER2_READING_PROGRESS_SCHEMA_VERSION,
    contractId: TIER2_READING_PROGRESS_CONTRACT_ID,
    id: 'reading-session-1',
    childId: 'maya',
    grade: 'Grade 2',
    schoolYear: '2026–2027',
    activityModule: 'mandarin-tier2-reading',
    profileId: grade2Tier2ReadingProfile.id,
    profileVersion: grade2Tier2ReadingProfile.version,
    pathwayKind: 'test-review',
    reviewCycle: 1,
    cohortIds: [target.datasetId],
    targetOccurrenceIds: [target.id],
    revision,
    status: 'in-progress',
    run: {
      kind: 'test-review',
      queue: [target],
      index: 1,
      attempts: [{ promptKind: 'test-review', target, correct: true, countsTowardScore: true }],
    },
    startedAt: '2026-10-03T12:00:00.000Z',
    updatedAt: '2026-10-03T12:01:00.000Z',
  }
}

test('Tier 2 reading checkpoints resume the exact child, pathway, and review cycle', () => {
  const saved = checkpointTier2ReadingProgress(createInitialState(), progress())
  assert.equal(
    activeTier2ReadingProgress(saved, 'maya', '2026–2027', grade2Tier2ReadingProfile, pathway)?.id,
    'reading-session-1',
  )
  assert.equal(
    activeTier2ReadingProgress(saved, 'another-child', '2026–2027', grade2Tier2ReadingProfile, pathway),
    undefined,
  )
  assert.equal(
    activeTier2ReadingProgress(saved, 'maya', '2026–2027', grade2Tier2ReadingProfile, { ...pathway, cycle: 2 }),
    undefined,
  )
})

test('completed reading results survive a device round trip without microphone audio', () => {
  const summary = { kind: 'test-review' as const, attempted: 1, correct: 1, diagnostics: 0 }
  const state = completeTier2ReadingProgress(
    checkpointTier2ReadingProgress(createInitialState(), progress()),
    progress(),
    summary,
    '2026-10-03T12:02:00.000Z',
  )
  const storage = new MemoryStorage()
  assert.equal(writeLocalTier2ReadingProgress(storage, state.tier2ReadingProgressV1 || []), true)
  const restored = readLocalTier2ReadingProgress(storage)
  assert.equal(restored[0].status, 'completed')
  assert.deepEqual(restored[0].summary, summary)
  assert.doesNotMatch(JSON.stringify(restored), /audio|blob:|data:audio/i)
})

test('stale reading revisions cannot replace a newer device checkpoint', () => {
  const newer = checkpointTier2ReadingProgress(createInitialState(), progress(2))
  assert.equal(checkpointTier2ReadingProgress(newer, progress(1)), newer)
})

test('Firebase reading metadata round-trips lifecycle and self-assessments without any audio fields', () => {
  const withCurriculumAudio = structuredClone(progress())
  const queueTarget = withCurriculumAudio.run.kind === 'test-review' ? withCurriculumAudio.run.queue[0] : null
  assert.ok(queueTarget)
  ;(queueTarget as Tier2ReadingTarget).audio = {
    storagePath: 'curriculum/reference.mp3',
    voice: 'reference',
  }
  const encoded = encodeTier2ReadingCloudProgress(withCurriculumAudio)
  assert.equal('run' in encoded, false)
  assert.match(encoded.runJson, /targetOccurrenceId|reading-target-1|correct/)
  assert.doesNotMatch(JSON.stringify(encoded), /"audio"|blob:|data:audio|mimeType|recordingUrl/i)
  const decoded = decodeTier2ReadingCloudProgress(encoded)
  assert.ok(decoded)
  assert.equal(decoded.reviewCycle, 1)
  assert.deepEqual(decoded.targetOccurrenceIds, [target.id])
  assert.equal(decoded.run.kind, 'test-review')
})

test('device and Firebase reading metadata merge by monotonic revision', () => {
  const merged = mergeTier2ReadingProgress([progress(1)], [progress(2)])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].revision, 2)
  assert.throws(
    () => mergeTier2ReadingProgress([progress(2)], [{ ...progress(2), updatedAt: '2026-10-03T12:03:00.000Z' }]),
    /conflicting content/i,
  )
})
