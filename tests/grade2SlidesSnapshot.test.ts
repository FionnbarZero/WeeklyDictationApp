import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fetchGrade2CurriculumSnapshot, readGrade2CurriculumSnapshot } from '../scripts/grade2SlidesSnapshot.ts'
import { prepareAcquisitionProgress } from '../src/application/acquisitionPersistence.ts'
import { fetchAutomaticGrade2Curriculum, hydrateAutomaticGrade2Curriculum } from '../src/automaticGrade2Curriculum.ts'
import { GRADE2_DECK_ID } from '../src/config.ts'
import {
  GRADE2_CURRICULUM_SNAPSHOT_SCHEMA,
  parseGrade2CurriculumSnapshot,
  projectGrade2CurriculumText,
} from '../src/curriculum/grade2CurriculumSnapshot.ts'
import { createInitialState } from '../src/domain.ts'
import { grade2WritingDatasets } from '../src/familyBeta/grade2LessonSelection.ts'

const snapshotPath = new URL('../public/curriculum/grade2-presentation.json', import.meta.url)

async function withIncompleteWeek() {
  const snapshot = parseGrade2CurriculumSnapshot(JSON.parse(await readFile(snapshotPath, 'utf8')))
  snapshot.presentation.slides!.unshift({
    objectId: 'future-incomplete',
    text: 'Week 10/19-10/23\nMandarin\nTier 1:\nTier 2:',
  })
  return snapshot
}

test('family hydration accepts valid weeks alongside an incomplete future week and remains idempotent', async () => {
  const snapshot = await withIncompleteWeek()
  const state = createInitialState()
  const before = structuredClone(state)
  const next = hydrateAutomaticGrade2Curriculum(state, snapshot, false, { allowIncompleteWeeks: true })
  assert.equal(next.datasets.length, 6)
  assert.equal(
    next.datasets.some((dataset) => dataset.startDate === '2026-10-19'),
    false,
  )
  assert.deepEqual(state, before)
  assert.deepEqual(hydrateAutomaticGrade2Curriculum(next, snapshot, false, { allowIncompleteWeeks: true }), next)
  // The ordinary reviewed-snapshot contract is still strict by default.
  assert.throws(() => hydrateAutomaticGrade2Curriculum(state, snapshot), /conflicts with existing browser lessons/i)
})

test('family hydration rejects all-invalid or empty source without changing retained lessons', async () => {
  const snapshot = await withIncompleteWeek()
  const valid = structuredClone(snapshot)
  valid.presentation.slides!.shift()
  const state = hydrateAutomaticGrade2Curriculum(createInitialState(), valid)
  const before = structuredClone(state)
  for (const slides of [[snapshot.presentation.slides![0]], []]) {
    const invalid = { ...snapshot, presentation: { ...snapshot.presentation, slides } }
    for (const retainCorrections of [false, true])
      assert.throws(
        () => hydrateAutomaticGrade2Curriculum(state, invalid, retainCorrections, { allowIncompleteWeeks: true }),
        /no valid weekly lessons/i,
      )
    assert.deepEqual(state, before)
  }
})

test('incomplete-week handling never bypasses source or existing-lesson conflicts', async () => {
  const snapshot = await withIncompleteWeek()
  const valid = structuredClone(snapshot)
  valid.presentation.slides!.shift()
  const state = hydrateAutomaticGrade2Curriculum(createInitialState(), valid)
  const before = structuredClone(state)
  const changed = structuredClone(snapshot)
  changed.presentation.slides![1].text = changed.presentation.slides![1].text!.replace('英雄， 每个', '英杰， 每个')
  assert.throws(
    () => hydrateAutomaticGrade2Curriculum(state, changed, false, { allowIncompleteWeeks: true }),
    /conflicts with existing browser lessons/i,
  )
  changed.presentation.slides!.push({ ...snapshot.presentation.slides![1], objectId: 'conflicting-week' })
  for (const retainCorrections of [false, true])
    assert.throws(
      () => hydrateAutomaticGrade2Curriculum(state, changed, retainCorrections, { allowIncompleteWeeks: true }),
      /conflicts with existing browser lessons/i,
    )
  const wrongDeck = { ...snapshot, presentation: { ...snapshot.presentation, presentationId: 'wrong-deck' } }
  assert.throws(
    () => hydrateAutomaticGrade2Curriculum(state, wrongDeck, true, { allowIncompleteWeeks: true }),
    /no valid weekly lessons/i,
  )
  assert.deepEqual(state, before)
})

test('a partial source correction preserves a pinned Grade 2 target and its reviewed history', async () => {
  const snapshot = await withIncompleteWeek()
  const original = hydrateAutomaticGrade2Curriculum(createInitialState(), snapshot, false, {
    allowIncompleteWeeks: true,
  })
  const dataset = original.datasets.find((item) => item.words.some((word) => word.text === '英雄'))!
  const prepared = prepareAcquisitionProgress(
    original,
    'synthetic-child',
    dataset,
    '2026-10-14T10:00:00.000Z',
    () => 0,
    true,
  )
  assert.equal(prepared.status, 'ready')
  prepared.state.legacyRecords.push({
    id: 'retained-history',
    childId: 'synthetic-child',
    legacySet: 'historical',
    correct: true,
    importedAt: '2026-09-01T00:00:00.000Z',
    note: 'legacy-date-range-unknown',
  })
  prepared.state.scores.push({
    id: 'completed-score',
    childId: 'synthetic-child',
    datasetId: dataset.id,
    datasetDateRange: dataset.dateRange,
    phase: 'test-review',
    sessionId: 'completed-attempt',
    sessionDate: '2026-10-13',
    percent: 100,
    correct: dataset.words.length,
    wordCount: dataset.words.length,
  })
  const before = structuredClone(prepared.state)
  const changed = structuredClone(snapshot)
  const slide = changed.presentation.slides!.find((item) => item.objectId === dataset.sourceSlideId)!
  slide.text = slide.text!.replace('英雄， 每个', '英杰， 每个')
  const next = hydrateAutomaticGrade2Curriculum(prepared.state, changed, true, { allowIncompleteWeeks: true })
  assert.equal(next.datasets.length, original.datasets.length + 1)
  assert.deepEqual(
    next.datasets.find((item) => item.id === dataset.id),
    dataset,
  )
  const incoming = hydrateAutomaticGrade2Curriculum(createInitialState(), changed, false, {
    allowIncompleteWeeks: true,
  }).datasets
  assert.equal(
    grade2WritingDatasets(next, incoming, 'synthetic-child').find((item) => item.id === dataset.id)?.id,
    dataset.id,
  )
  for (const key of [
    'acquisitionProgressEnvelopes',
    'acquisitionProgressions',
    'scores',
    'results',
    'completedSessions',
    'legacyRecords',
  ] as const)
    assert.deepEqual(next[key], before[key])
  assert.deepEqual(prepared.state, before)
})

test('the reviewed Grade 2 snapshot validates all current Slides datasets', async () => {
  const { snapshot, batch } = await readGrade2CurriculumSnapshot(snapshotPath.pathname)
  assert.equal(snapshot.source.documentId, GRADE2_DECK_ID)
  assert.equal(batch.status, 'ok')
  assert.deepEqual(batch.summary.dateRanges, [
    '8/31–9/4',
    '9/8–9/11',
    '9/14–9/18',
    '9/21–9/25',
    '9/29–10/2',
    '10/5–10/9',
  ])
  assert.deepEqual(batch.summary.wordCounts, [5, 5, 5, 5, 9, 9])
  assert.equal(
    batch.outcomes.some((outcome) => outcome.status === 'error' || outcome.status === 'conflict'),
    false,
  )
})

test('the curriculum projection strips unrelated ELA and Math sections', () => {
  assert.equal(
    projectGrade2CurriculumText('Week 10/5-10/9\nMandarin\nTier 1: 英雄\n\nELA\nprivate ELA text\nMath\nmath text'),
    'Week 10/5-10/9\nMandarin\nTier 1: 英雄',
  )
})

test('the trusted snapshot job reads Slides once and emits a validated projection', async () => {
  const result = await fetchGrade2CurriculumSnapshot(
    { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' },
    {
      googleAccessToken: async () => 'read-only-token',
      fetchGooglePresentation: async (presentationId, token) => {
        assert.equal(presentationId, GRADE2_DECK_ID)
        assert.equal(token, 'read-only-token')
        return {
          presentationId,
          slides: [
            {
              objectId: 'current-week',
              text: 'Week 10/5-10/9\nMandarin\nWriting vocabulary: 英雄，每个\nELA\nnot published',
            },
          ],
        }
      },
      now: () => new Date('2026-10-04T00:00:00.000Z'),
    },
  )
  assert.equal(result.batch.summary.datasetCount, 1)
  assert.equal(result.snapshot.presentation.slides?.[0].text.includes('not published'), false)
  assert.equal(result.snapshot.source.retrievedAt, '2026-10-04T00:00:00.000Z')
})

test('the browser accepts only the registered same-origin snapshot contract and preserves existing state', async () => {
  const raw = await readFile(snapshotPath, 'utf8')
  const loaded = await fetchAutomaticGrade2Curriculum({
    baseUrl: '/',
    fetchImpl: async (input) => {
      assert.equal(input, '/curriculum/grade2-presentation.json')
      return new Response(raw, { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  })
  const state = createInitialState()
  state.legacyRecords.push({
    id: 'legacy',
    childId: 'rhys',
    legacySet: 'historical',
    correct: true,
    importedAt: '2026-09-01T00:00:00.000Z',
    note: 'legacy-date-range-unknown',
  })
  const hydrated = hydrateAutomaticGrade2Curriculum(state, loaded.snapshot)
  assert.equal(loaded.datasetCount, 6)
  assert.equal(hydrated.datasets.length, 6)
  assert.equal(hydrated.legacyRecords.length, 1)
  assert.equal(hydrateAutomaticGrade2Curriculum(hydrated, loaded.snapshot).datasets.length, 6)
})

test('the browser rejects snapshot tampering and preserves existing lessons on a source conflict', async () => {
  const raw = await readFile(snapshotPath, 'utf8')
  const tampered = JSON.parse(raw)
  tampered.presentation.slides[0].text += '\nUnreviewed change'
  await assert.rejects(
    fetchAutomaticGrade2Curriculum({
      baseUrl: '/',
      fetchImpl: async () =>
        new Response(JSON.stringify(tampered), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    }),
    /checksum/i,
  )

  const snapshot = parseGrade2CurriculumSnapshot(JSON.parse(raw))
  const hydrated = hydrateAutomaticGrade2Curriculum(createInitialState(), snapshot)
  const changed = structuredClone(snapshot)
  changed.presentation.slides![0].text = changed.presentation.slides![0].text!.replace('英雄， 每个', '英杰， 每个')
  assert.throws(() => hydrateAutomaticGrade2Curriculum(hydrated, changed), /conflicts with existing browser lessons/i)
  assert.equal(hydrated.datasets.length, 6)
})

test('snapshot parsing rejects another deck or malformed provenance', () => {
  assert.throws(
    () =>
      parseGrade2CurriculumSnapshot({
        schema: GRADE2_CURRICULUM_SNAPSHOT_SCHEMA,
        source: {
          type: 'google-slides',
          documentId: 'wrong-deck',
          documentUrl: 'https://docs.google.com/presentation/d/wrong-deck',
          retrievedAt: '2026-10-04T00:00:00.000Z',
          contentSha256: 'a'.repeat(64),
        },
        presentation: { presentationId: 'wrong-deck', slides: [] },
      }),
    /invalid source metadata/i,
  )
})
