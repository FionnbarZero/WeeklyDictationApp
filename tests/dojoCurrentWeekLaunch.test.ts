import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  createWritingLesson,
  GRADE5_WRITING_POLICY,
  KINDERGARTEN_WRITING_POLICY,
  TRACE_INDEPENDENT_PREVIEW_POLICY,
  writingCharacterGuides,
} from '../src/application/writingAcquisition/lesson.ts'
import { inspectSnapshot, validateCurriculum, type CurriculumSnapshot } from '../src/familyBeta/curriculum.ts'
import { strokeOrderLesson } from '../src/familyBeta/strokeOrderSlay.ts'
import {
  kindergartenWritingDatasetForLab,
  kindergartenWritingUnavailableReason,
} from '../src/kindergartenLab/acquisitionLab.ts'
import { kindergartenReadingAcquisitionPathway } from '../src/kindergartenLab/readingPractice.ts'
import { kindergartenAudioForText } from '../src/audio/kindergartenAudio.ts'
import { extractTier1, grade2DeckProfile } from '../src/slidesImporter.ts'
import { candidateContentFingerprint } from '../src/curriculum/identity.ts'
import { grade2StrokeMedians } from '../src/learningGames/strokeOrder/grade2StrokeAssets.ts'
import { grade5StrokeMedians } from '../src/learningGames/strokeOrder/grade5StrokeAssets.ts'
import { strokeMedians } from '../src/learningGames/strokeOrder/strokeAssets.ts'
import { octoberStrokeMedians } from '../src/learningGames/strokeOrder/octoberStrokeAssets.ts'
import { retainGrade2Editions, sourceGrade2Datasets } from '../src/curriculum/grade2Revisions.ts'
import type { AppState } from '../src/domain.ts'

function source(slug: string) {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/dojo-launch-2026-10-16/${slug}.json`, import.meta.url), 'utf8'),
  ) as CurriculumSnapshot
}
const expected = {
  kindergarten: { date: '2026-10-12', words: ['土', '花'], policy: KINDERGARTEN_WRITING_POLICY },
  grade2: { date: '2026-10-13', words: ['走', '最', '哪里', '家', '住'], policy: TRACE_INDEPENDENT_PREVIEW_POLICY },
  grade5: { date: '2026-10-05', words: ['盐', '咸', '层', '用处', '神奇的'], policy: GRADE5_WRITING_POLICY },
}
for (const [slug, current] of Object.entries(expected)) {
  test(`${slug}: the actual current week opens a complete writing lesson and separate Slay activity`, async () => {
    const snapshot = source(slug)
    const inspected = await validateCurriculum(JSON.stringify(snapshot), snapshot.grade)
    const dataset = inspected.datasets
      .filter((d) => d.startDate <= '2026-10-16')
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
    assert.equal(dataset.startDate, current.date)
    assert.deepEqual(
      dataset.words.map((w) => w.text),
      current.words,
    )
    const lesson = createWritingLesson(dataset, current.policy)
    assert.deepEqual(
      lesson.targets.map((w) => w.text),
      current.words,
    )
    const slay = strokeOrderLesson([dataset])
    assert.deepEqual(slay.unsupported, [])
    assert.equal(slay.targetSet.targets.length, current.words.length)
    for (const word of current.words) assert.equal(writingCharacterGuides(word).length, [...word].length)
  })
}

test('Kindergarten current-week reading does not depend on writing audio or stroke support', () => {
  const candidate = inspectSnapshot(source('kindergarten')).candidates.find(
    (c) => c.normalizedStartDate === '2026-10-12',
  )!
  const writing = kindergartenWritingDatasetForLab(candidate)
  assert.deepEqual(
    writing.words.map((w) => w.text),
    ['土', '花'],
  )
  for (const target of [...candidate.tier1, ...candidate.tier2])
    assert.ok(kindergartenAudioForText(target.text)?.storagePath)
  const missingWriting = { ...candidate, tier1: candidate.tier1.map((w) => ({ ...w, text: '龘' })) }
  missingWriting.contentFingerprint = candidateContentFingerprint(missingWriting)
  assert.match(kindergartenWritingUnavailableReason(missingWriting)!, /Writing audio.*龘/)
  const pathway = kindergartenReadingAcquisitionPathway(missingWriting)
  assert.equal(pathway.available, true)
  assert.deepEqual(
    pathway.cohorts[0].targets.map((w) => w.text),
    ['树', '草', '要'],
  )
  assert.throws(() => kindergartenReadingAcquisitionPathway({ ...candidate, status: 'malformed' }), /canonical/)
  assert.throws(() => kindergartenReadingAcquisitionPathway({ ...candidate, tier2: [] }), /canonical/)
})

test('only the exact stroke-order resource label is excluded; word order and unknown text are preserved', () => {
  for (const label of ['stroke order', 'Stroke Order:', 'strokeorder'])
    assert.deepEqual(
      extractTier1(`Mandarin\nTier 1:\n${label}\n走，最，哪里，家,住\nTier 2: 雨林`, grade2DeckProfile),
      expected.grade2.words,
    )
  assert.deepEqual(extractTier1('Mandarin\nTier 1: 未知,unknown label,走', grade2DeckProfile), [
    '未知',
    'unknownlabel',
    '走',
  ])
  assert.throws(() => writingCharacterGuides('unknownlabel'), /Chinese characters/)
})

test('the new guide supplement never changes previously supported guide fingerprints', () => {
  const prior = { ...strokeMedians, ...grade5StrokeMedians, ...grade2StrokeMedians }
  for (const character of Object.keys(octoberStrokeMedians)) assert.equal(character in prior, false)
  assert.deepEqual(
    Object.values(octoberStrokeMedians).map((strokes) => strokes.length),
    [3, 7, 7, 12, 9, 10, 7, 7],
  )
})

test('corrected import creates a new Grade 2 edition without rewriting saved word identities', () => {
  const snapshot = source('grade2')
  const corrected = inspectSnapshot(snapshot).datasets.find((d) => d.startDate === '2026-10-13')!
  const oldWords = ['strokeorder', ...expected.grade2.words].map((text, i) => ({
    ...corrected.words[0],
    id: `${corrected.id}-${i + 1}`,
    text,
  }))
  const old = { ...corrected, words: oldWords, vocabulary: { ...corrected.vocabulary!, tier1: oldWords } }
  const before = JSON.stringify(old)
  const state = retainGrade2Editions({ datasets: [old] } as AppState, [corrected])
  assert.equal(JSON.stringify(state.datasets[0]), before)
  const selected = sourceGrade2Datasets(state, [corrected])
  assert.equal(selected.length, 1)
  assert.notEqual(selected[0].id, old.id)
  assert.deepEqual(
    selected[0].words.map((w) => w.text),
    expected.grade2.words,
  )
  assert.equal(state.datasets.length, 2)
})
