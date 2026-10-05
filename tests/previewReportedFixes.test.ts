import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { inspectSnapshot, type CurriculumSnapshot } from '../src/familyBeta/curriculum.ts'
import { channelCohort, channelWords, latestEarlierTargets } from '../src/familyBeta/gamePools.ts'
import {
  masteryStorageKey,
  persistMasteryAssessment,
  prepareMastery,
  readMasteryRecord,
} from '../src/familyBeta/previewMastery.ts'
import { buildStrokeOrderRounds } from '../src/learningGames/strokeOrder/rounds.ts'

function datasets(slug: string) {
  return inspectSnapshot(
    JSON.parse(
      readFileSync(new URL(`../public/curriculum/beta/${slug}.json`, import.meta.url), 'utf8'),
    ) as CurriculumSnapshot,
  ).datasets
}
function memoryStorage() {
  const records = new Map<string, string>()
  return {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value)
    },
  } as Storage
}

test('previous relevant weeks skip holidays and empty reading weeks without mixing writing and reading', () => {
  for (const slug of ['kindergarten', 'grade2', 'grade5']) {
    const source = datasets(slug)
    for (const channel of ['writing', 'reading'] as const) {
      const prior = latestEarlierTargets(source, '2026-10-05', channel)
      assert.equal(prior.length, 1)
      assert.ok(prior[0].startDate < '2026-10-05')
      assert.ok(channelWords(prior[0], channel).length)
      assert.ok(
        channelCohort(prior, channel, 'test')?.terms.every(
          (term) => term.tier === (channel === 'writing' ? 'tier-1' : 'tier-2'),
        ),
      )
    }
  }
  assert.equal(latestEarlierTargets(datasets('grade2'), '2026-10-05', 'reading')[0].startDate, '2026-09-21')
  assert.equal(latestEarlierTargets(datasets('kindergarten'), '2026-10-05', 'writing')[0].startDate, '2026-09-21')
  assert.equal(channelWords(datasets('grade2').find((d) => d.startDate === '2026-09-21')!, 'reading').length, 7)
})

test('every supplied Grade 5 writing target has a stroke guide', () => {
  for (const dataset of datasets('grade5')) {
    const result = buildStrokeOrderRounds(channelWords(dataset, 'writing'))
    assert.deepEqual(result.unsupportedTargets, [])
    assert.equal(result.rounds.length, channelWords(dataset, 'writing').length)
  }
})

test('mastery is unique, channel scoped, suppresses active duplicates, and does not invent assessments', () => {
  for (const slug of ['kindergarten', 'grade2', 'grade5']) {
    const source = datasets(slug)
    const mastered = source.filter((d) => d.startDate < '2026-09-14')
    for (const channel of ['writing', 'reading'] as const) {
      const prepared = prepareMastery(
        readMasteryRecord(memoryStorage(), 'child', source[0].grade, channel),
        source,
        mastered,
        '2026-10-05',
        () => 0.5,
      )
      assert.ok(prepared.words.length > 0)
      assert.ok(prepared.words.length <= 16)
      assert.equal(new Set(prepared.words.map((w) => w.text)).size, prepared.words.length)
      assert.ok(prepared.record.states.every((state) => state.evidence === 'unassessed'))
      const active = new Set(
        source
          .filter((d) => !mastered.includes(d) && d.startDate <= '2026-10-05')
          .flatMap((d) => channelWords(d, channel).map((w) => w.text)),
      )
      assert.ok(prepared.words.every((w) => !active.has(w.text)))
    }
  }
})

test('mastery saves each assessment once, keeps another visit’s progress, and survives reload', () => {
  const source = datasets('kindergarten')
  const mastered = source.filter((d) => d.startDate < '2026-09-14')
  const storage = memoryStorage()
  const original = prepareMastery(
    readMasteryRecord(storage, 'child', 'Kindergarten', 'writing'),
    source,
    mastered,
    '2026-10-05',
    () => 0.5,
  )
  const targetId = original.words[0].id
  const termId = original.selection.entries.find((e) => e.occurrenceIds.includes(targetId))!.masteryTermId
  const state = () =>
    readMasteryRecord(storage, 'child', 'Kindergarten', 'writing').states.find((s) => s.masteryTermId === termId)!
  persistMasteryAssessment(storage, original, targetId, true, 'one')
  persistMasteryAssessment(storage, original, targetId, true, 'one')
  assert.equal(state().consecutiveCorrect, 1)
  persistMasteryAssessment(storage, original, targetId, true, 'two')
  assert.equal(state().bucket, 'mastery-rotation')
  persistMasteryAssessment(storage, original, targetId, false, 'miss')
  assert.equal(state().bucket, 'needs-attention')
  for (const id of ['recover1', 'recover2']) persistMasteryAssessment(storage, original, targetId, true, id)
  assert.equal(state().bucket, 'needs-attention')
  persistMasteryAssessment(storage, original, targetId, true, 'recover3')
  assert.equal(state().bucket, 'mastery-rotation')
  assert.equal(readMasteryRecord(storage, 'child', 'Kindergarten', 'writing').applied.length, 6)
  assert.equal(readMasteryRecord(storage, 'other-child', 'Kindergarten', 'writing').states.length, 0)
  assert.equal(readMasteryRecord(storage, 'child', 'Kindergarten', 'reading').states.length, 0)
  assert.throws(() => persistMasteryAssessment(storage, original, 'outside-queue', true, 'bad'))
})

test('corrupt mastery and failed saves are not silently replaced', () => {
  const storage = memoryStorage()
  const key = masteryStorageKey('child', 'Grade 2', 'reading')
  storage.setItem(key, '{broken')
  assert.throws(() => readMasteryRecord(storage, 'child', 'Grade 2', 'reading'))
  assert.equal(storage.getItem(key), '{broken')
  const source = datasets('grade2')
  const prepared = prepareMastery(
    readMasteryRecord(memoryStorage(), 'child', 'Grade 2', 'reading'),
    source,
    source.filter((d) => d.startDate < '2026-09-14'),
    '2026-10-05',
  )
  const unavailable = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota')
    },
  } as unknown as Storage
  assert.throws(() => persistMasteryAssessment(unavailable, prepared, prepared.words[0].id, true, 'event'), /quota/)
})

test('writing ink is half-width while tracing guides retain their original width', () => {
  const sky = readFileSync(new URL('../src/skywriting/skywriting.css', import.meta.url), 'utf8')
  const strokes = readFileSync(new URL('../src/learningGames/strokeOrder/strokeOrder.css', import.meta.url), 'utf8')
  assert.match(sky, /\.skywriting-stroke \{[^}]*stroke-width: 9;/)
  assert.match(sky, /is-review \.skywriting-stroke \{ stroke-width: 5;/)
  assert.match(strokes, /\.so-student-ink path \{[^}]*stroke-width: 2\.4;/)
  assert.match(strokes, /stroke-width: 6\.5;/)
})
