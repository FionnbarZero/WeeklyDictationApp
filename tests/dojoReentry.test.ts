import assert from 'node:assert/strict'
import test from 'node:test'
import type { AcquisitionProgressEnvelope } from '../src/acquisition/persistence/contracts.ts'
import { createInitialState, type AcquisitionProgressRecord, type Dataset, type Word } from '../src/domain.ts'
import { dojoExperienceForProgress, unfinishedDojoReentryCohorts } from '../src/practice/dojoReentry.ts'

function dataset(id: string, startDate: string): Dataset {
  const word: Word = {
    id: `${id}-word`,
    text: '学',
    sentence: '',
    datasetId: id,
    grade: 'Grade 2',
    language: 'mandarin',
    tier: 'tier-1',
    activityType: 'dictation',
  }
  return {
    id,
    dateRange: startDate,
    startDate,
    endDate: startDate,
    grade: 'Grade 2',
    schoolYear: '2026–2027',
    description: id,
    words: [word],
  }
}

function legacyProgress(
  childId: string,
  datasetId: string,
  updatedAt: string,
  teachingComplete = false,
): AcquisitionProgressRecord {
  return {
    id: `legacy-${childId}-${datasetId}`,
    childId,
    datasetId,
    grade: 'Grade 2',
    flow: { datasetId, teachingComplete } as AcquisitionProgressRecord['flow'],
    updatedAt,
  }
}

function versionedProgress(
  childId: string,
  datasetId: string,
  activityModule: string,
  updatedAt: string,
): AcquisitionProgressEnvelope<Word> {
  return {
    contractId: 'acquisition-persistence-v1',
    childId,
    datasetId,
    activityModule,
    status: 'in-progress',
    updatedAt,
  } as AcquisitionProgressEnvelope<Word>
}

test('Dojo reentry lists every historical cohort with separate activity states', () => {
  const oldest = dataset('oldest', '2026-09-01')
  const recent = dataset('recent', '2026-09-08')
  const completed = dataset('completed', '2026-08-25')
  const quarantined = dataset('quarantined', '2026-08-18')
  const active = dataset('active', '2026-09-15')
  const future = dataset('future', '2026-09-22')
  const datasets = [oldest, recent, completed, quarantined, active, future]
  const state = createInitialState()
  state.acquisitionProgressions = [
    legacyProgress('child-a', oldest.id, '2026-09-02T10:00:00.000Z'),
    legacyProgress('child-a', completed.id, '2026-08-26T10:00:00.000Z', true),
    legacyProgress('child-a', quarantined.id, '2026-08-19T10:00:00.000Z'),
    legacyProgress('child-a', active.id, '2026-09-16T10:00:00.000Z'),
    legacyProgress('child-a', future.id, '2026-09-23T10:00:00.000Z'),
    legacyProgress('child-b', recent.id, '2026-09-09T09:00:00.000Z'),
  ]
  state.acquisitionProgressEnvelopes = [
    versionedProgress('child-a', recent.id, 'mandarin-tier2-reading', '2026-09-09T10:00:00.000Z'),
    versionedProgress('child-a', recent.id, 'mandarin-tier1-stroke-order', '2026-09-10T10:00:00.000Z'),
  ]
  state.acquisitionProgressQuarantine = [
    {
      id: 'quarantine',
      childId: 'child-a',
      datasetId: quarantined.id,
      reason: 'conflict',
      quarantinedAt: '2026-09-01T00:00:00.000Z',
      raw: {},
    },
  ]

  const cohorts = unfinishedDojoReentryCohorts({
    state,
    childId: 'child-a',
    datasets,
    activeDatasetId: active.id,
  })

  assert.deepEqual(
    cohorts.map((cohort) => cohort.dataset.id),
    [recent.id, oldest.id, completed.id, quarantined.id],
  )
  assert.deepEqual(
    cohorts[0].experiences.map((experience) => [experience.experienceId, experience.status]),
    [
      ['writing', 'not-started'],
      ['stroke-order', 'in-progress'],
      ['reading', 'in-progress'],
    ],
  )
  assert.equal(cohorts[0].updatedAt, '2026-09-10T10:00:00.000Z')
  assert.equal(cohorts[1].experiences[0].status, 'in-progress')
  assert.equal(cohorts[2].experiences[0].status, 'completed')
  assert.deepEqual(
    cohorts[3].experiences.map((experience) => [experience.experienceId, experience.status]),
    [
      ['writing', 'unavailable'],
      ['stroke-order', 'not-started'],
      ['reading', 'not-started'],
    ],
  )
})

test('legacy progress defaults to Writing while explicit and module identities remain separate', () => {
  assert.equal(dojoExperienceForProgress(legacyProgress('child-a', 'week', '2026-09-01T00:00:00.000Z')), 'writing')
  assert.equal(
    dojoExperienceForProgress(
      versionedProgress('child-a', 'week', 'mandarin-tier1-stroke-order', '2026-09-01T00:00:00.000Z'),
    ),
    'stroke-order',
  )
  assert.equal(
    dojoExperienceForProgress({
      ...versionedProgress('child-a', 'week', 'unknown-module', '2026-09-01T00:00:00.000Z'),
      experienceId: 'reading',
    } as AcquisitionProgressEnvelope<Word> & { experienceId: 'reading' }),
    'reading',
  )
})
