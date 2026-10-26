import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { koreAudioSegments } from '../src/audio/koreVoice.ts'
import { scheduledCurriculumWeek } from '../src/familyBeta/automaticCurriculum.ts'
import { type CurriculumSnapshot, validateCurriculum } from '../src/familyBeta/curriculum.ts'
import {
  grade2WetlandReviewPreview,
  recoverGrade2Wetland,
  wetlandReviewLabel,
} from '../src/familyBeta/grade2WetlandReview.ts'
import reviewed from '../src/familyBeta/grade2WetlandSource.json' with { type: 'json' }
import { wetlandStrokeMedians } from '../src/learningGames/strokeOrder/wetlandStrokeAssets.ts'

function snapshot() {
  const source = JSON.parse(
    readFileSync(new URL('./fixtures/game-content-2026-10-26/grade2.json', import.meta.url), 'utf8'),
  ) as CurriculumSnapshot
  if (source.payload.sourceType !== 'google-slides') throw new Error('Expected Slides')
  source.payload.slides = source.payload.slides!.map((s) =>
    s.objectId === reviewed.slide.objectId ? { objectId: s.objectId, text: 'Week 10/19-10/23' } : s,
  )
  source.contentSha256 = createHash('sha256').update(JSON.stringify(source.payload)).digest('hex')
  return source
}

test('isolated reviewed recovery restores only the exact truncated Wetland slide and validates its checksum', async () => {
  assert.equal(grade2WetlandReviewPreview, false, 'ordinary build is excluded')
  const source = snapshot(),
    before = structuredClone(source)
  const previous = await validateCurriculum(JSON.stringify(source), 'Grade 2')
  const repaired = await recoverGrade2Wetland(source)
  const next = await validateCurriculum(JSON.stringify(repaired), 'Grade 2')
  assert.deepEqual(source, before)
  assert.notEqual(repaired.contentSha256, source.contentSha256)
  assert.equal(repaired.reviewedRecovery?.originalContentSha256, source.contentSha256)
  assert.equal(next.datasets.length, previous.datasets.length + 1)
  for (const old of previous.datasets)
    assert.deepEqual(
      next.datasets.find((d) => d.id === old.id),
      old,
    )
  const wetland = next.datasets.find((d) => d.startDate === '2026-10-19')!
  assert.deepEqual(
    wetland.words.map((w) => w.text),
    ['湿地', '食物', '还有', '动物', '蛋'],
  )
  assert.equal(
    next.datasets.some((d) => d.startDate === '2026-10-26'),
    false,
    'keep the original lesson identity',
  )
  assert.equal(scheduledCurriculumWeek(next.datasets, '2026-10-26'), '2026-10-19')
  assert.equal(scheduledCurriculumWeek(next.datasets, '2026-10-26', '2026-10-13'), '2026-10-13')
  assert.equal(await recoverGrade2Wetland(repaired), repaired)
})

test('recovery never substitutes another grade, source, slide or teacher-authored correction', async () => {
  const source = snapshot()
  for (const change of [{ grade: 'Grade 5' }, { sourceId: 'different-deck' }]) {
    const changed = { ...source, ...change } as CurriculumSnapshot
    assert.equal(await recoverGrade2Wetland(changed), changed)
  }
  for (const text of [
    'Week 10/19-10/23\nMandarin\nTier 1: 新词',
    'Week 10/19-10/23\nMandarin\nTier 1:',
    'Week 11/2-11/6',
  ]) {
    const changed = snapshot()
    if (changed.payload.sourceType !== 'google-slides') throw new Error('Slides')
    changed.payload.slides!.find((s) => s.objectId === reviewed.slide.objectId)!.text = text
    assert.equal(await recoverGrade2Wetland(changed), changed)
  }
})

test('review label is limited to Grade 2 and the approved dates without hiding a newer lesson', () => {
  assert.equal(wetlandReviewLabel('Grade 2', '2026-10-19', '2026-10-26'), 'This week · Wetland review (10/26–10/30)')
  for (const args of [
    ['Grade 2', '2026-10-19', '2026-10-25'],
    ['Grade 2', '2026-10-19', '2026-10-31'],
    ['Grade 2', '2026-10-26', '2026-10-26'],
    ['Kindergarten', '2026-10-19', '2026-10-26'],
  ])
    assert.equal(wetlandReviewLabel(...(args as [string, string, string])), 'Current teacher lesson')
})

test('every recovered word and character has Kore and the missing writing guides have valid geometry', async () => {
  const { datasets } = await validateCurriculum(JSON.stringify(await recoverGrade2Wetland(snapshot())), 'Grade 2')
  const d = datasets.find((d) => d.startDate === '2026-10-19')!
  for (const w of Object.values(d.vocabulary!).flat())
    for (const text of [w.text, ...w.text])
      assert.ok(
        koreAudioSegments({ text, language: 'zh-CN', rate: 0.65 })[0].storagePath?.startsWith('audio/kore/'),
        text,
      )
  const counts = { 湿: 12, 食: 9, 还: 7, 蛋: 11 }
  for (const [char, strokes] of Object.entries(wetlandStrokeMedians)) {
    assert.equal(strokes.length, counts[char as keyof typeof counts])
    assert.ok(
      strokes.every(
        (s) =>
          s.length >= 2 &&
          s.every((p) => p.length === 2 && p.every((n) => Number.isFinite(n) && n >= -128 && n <= 1024)),
      ),
    )
  }
})
