import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fetchAutomaticGrade2Curriculum, hydrateAutomaticGrade2Curriculum } from '../src/automaticGrade2Curriculum.ts'
import { GRADE2_DECK_ID } from '../src/config.ts'
import { createInitialState } from '../src/domain.ts'
import {
  GRADE2_CURRICULUM_SNAPSHOT_SCHEMA,
  parseGrade2CurriculumSnapshot,
  projectGrade2CurriculumText,
} from '../src/curriculum/grade2CurriculumSnapshot.ts'
import { fetchGrade2CurriculumSnapshot, readGrade2CurriculumSnapshot } from '../scripts/grade2SlidesSnapshot.ts'

const snapshotPath = new URL('../public/curriculum/grade2-presentation.json', import.meta.url)

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
