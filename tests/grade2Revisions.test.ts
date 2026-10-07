import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareAcquisitionProgress } from '../src/application/acquisitionPersistence.ts'
import { originalGrade2Dataset, retainGrade2Editions, sourceGrade2Datasets } from '../src/curriculum/grade2Revisions.ts'
import { createInitialState, loadState } from '../src/domain.ts'
import { grade2WritingDatasets } from '../src/familyBeta/grade2LessonSelection.ts'
import { hydrateLocalStateFromReadOnlySource } from '../src/localHydration.ts'
import { grade2DeckProfile, isCanonicalDataset } from '../src/slidesImporter.ts'

function source(words: string) {
  return hydrateLocalStateFromReadOnlySource(createInitialState(), {
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [{ objectId: 'week', text: `Week 9/21-9/25\nMandarin\nTier 1: ${words}\nTier 2: 城市、上班` }],
  }).state.datasets
}

test('Grade 2 correction retains old dataset and history; new targets receive different identities', () => {
  const original = source('比如、部分'),
    corrected = source('不同、内容')
  const before = createInitialState(original)
  const untouched = JSON.stringify(before)
  const next = retainGrade2Editions(before, corrected)
  assert.equal(JSON.stringify(before), untouched)
  assert.equal(next.datasets.length, 2)
  assert.deepEqual(next.datasets[0], original[0])
  const [edition] = sourceGrade2Datasets(next, corrected)
  assert.notEqual(edition.id, original[0].id)
  assert.notEqual(edition.words[0].id, original[0].words[0].id)
  assert.ok(isCanonicalDataset(edition))
  assert.deepEqual(originalGrade2Dataset(edition).words, corrected[0].words)
  assert.deepEqual(retainGrade2Editions(next, corrected), next)
  assert.deepEqual(sourceGrade2Datasets(next, original), original)
  assert.deepEqual(loadState(JSON.stringify(next)).datasets, next.datasets)
})

test('a correction cannot mutate an unfinished Grade 2 writing lesson, but a fresh child gets the new edition', () => {
  const original = source('比如、部分'),
    corrected = source('不同、内容')
  const prepared = prepareAcquisitionProgress(
    createInitialState(original),
    'child',
    original[0],
    '2026-10-07T10:00:00.000Z',
    () => 0,
    true,
  )
  assert.equal(prepared.status, 'ready')
  const next = retainGrade2Editions(prepared.state, corrected)
  assert.deepEqual(grade2WritingDatasets(next, corrected, 'child'), original)
  assert.deepEqual(next.acquisitionProgressEnvelopes, prepared.state.acquisitionProgressEnvelopes)
  assert.equal(grade2WritingDatasets(next, corrected, 'new-child')[0].words[0].text, '不同')
  const finished = {
    ...next,
    acquisitionProgressEnvelopes: next.acquisitionProgressEnvelopes!.map((e) => ({
      ...e,
      flow: { ...e.flow, teachingComplete: true },
    })),
  }
  assert.equal(grade2WritingDatasets(finished, corrected, 'child')[0].words[0].text, '不同')
})

test('revision identity fails canonical validation if edited or transplanted to another grade', () => {
  const next = retainGrade2Editions(createInitialState(source('比如、部分')), source('不同、内容'))
  const edition = next.datasets[1]
  assert.equal(isCanonicalDataset({ ...edition, grade: 'Grade 5' }), false)
  assert.equal(
    isCanonicalDataset({ ...edition, words: [{ ...edition.words[0], text: '篡改' }, ...edition.words.slice(1)] }),
    false,
  )
  assert.equal(
    isCanonicalDataset({ ...edition, curriculumRevision: { ...edition.curriculumRevision!, fingerprint: 'wrong' } }),
    false,
  )
})

test('the strict default importer still refuses changed same-ID curriculum', () => {
  const state = createInitialState(source('比如、部分'))
  state.datasetImportReferences = [
    { datasetId: state.datasets[0].id, contentFingerprint: 'different', candidateStatus: 'valid' },
  ]
  const hydrated = hydrateLocalStateFromReadOnlySource(state, {
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [{ objectId: 'week', text: 'Week 9/21-9/25\nMandarin\nTier 1: 不同、内容' }],
  })
  assert.equal(hydrated.batch.outcomes[0].status, 'conflict')
  assert.deepEqual(hydrated.state.datasets, state.datasets)
})
