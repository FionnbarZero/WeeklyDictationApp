import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { buildCurriculumSnapshot } from '../backend/betaCurriculum.ts'
import {
  projectGrade2CurriculumPresentation,
  projectGrade2CurriculumText,
} from '../src/curriculum/grade2CurriculumSnapshot.ts'
import { scheduledCurriculumWeek } from '../src/familyBeta/automaticCurriculum.ts'
import { type CurriculumSnapshot, inspectSnapshot } from '../src/familyBeta/curriculum.ts'
import type { PresentationLike } from '../src/slidesImporter.ts'

// Actual October 19/26 teacher Mandarin runs and element ordering, read on
// October 26. Unrelated subjects are replaced with synthetic exclusion probes.
const source = JSON.parse(
  await readFile(new URL('./fixtures/grade2-october-source-order.json', import.meta.url), 'utf8'),
) as PresentationLike
const writing = ['湿地', '食物', '还有', '动物', '蛋']
const reading = ['栖息地', '昆虫', '金蛙', '蛇', '鳄鱼', '湿地']
const tier3 = ['陆地', '白鹭', '灌木', '海藻', '芦苇', '生态环境', '健康']

test('actual reordered, colonless, formatted Grade 2 source recovers exact word boundaries and tiers', () => {
  const snapshot = buildCurriculumSnapshot('Grade 2', { ...source, sourceType: 'google-slides' }, '')
  const loaded = inspectSnapshot(snapshot)
  assert.equal(loaded.datasets.length, 1)
  const dataset = loaded.datasets[0]
  assert.equal(dataset.startDate, '2026-10-19')
  assert.deepEqual(
    dataset.words.map((w) => w.text),
    writing,
  )
  assert.deepEqual(
    dataset.vocabulary?.tier2.map((w) => w.text),
    reading,
  )
  assert.deepEqual(
    dataset.vocabulary?.tier3.map((w) => w.text),
    tier3,
  )
  const text = JSON.stringify(snapshot.payload)
  assert.doesNotMatch(text, /Unrelated subject|示例|Mandarin song/)
  // Idempotent projection is required when the snapshot is revalidated.
  assert.deepEqual(
    projectGrade2CurriculumPresentation(snapshot.payload),
    snapshot.payload.sourceType === 'google-slides'
      ? { presentationId: snapshot.payload.presentationId, slides: snapshot.payload.slides }
      : null,
  )
})

test('all native subject-element orders produce the same Mandarin targets', () => {
  const slide = source.slides![1]
  const elements = slide.pageElements as Array<{ table?: unknown }>
  const tables = elements.filter((e) => e.table)
  const shapes = elements.filter((e) => !e.table)
  for (const order of [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ]) {
    const payload = {
      ...source,
      sourceType: 'google-slides' as const,
      slides: [{ ...slide, pageElements: [...shapes, ...order.map((i) => tables[i])] }],
    }
    const dataset = inspectSnapshot(buildCurriculumSnapshot('Grade 2', payload, '')).datasets[0]
    assert.deepEqual(
      dataset.words.map((w) => w.text),
      writing,
      `element order ${order}`,
    )
    assert.deepEqual(
      dataset.vocabulary?.tier2.map((w) => w.text),
      reading,
    )
    assert.deepEqual(
      dataset.vocabulary?.tier3.map((w) => w.text),
      tier3,
    )
  }
})

test('a testing/review week without explicit targets does not invent a new vocabulary cohort', () => {
  const loaded = inspectSnapshot(buildCurriculumSnapshot('Grade 2', { ...source, sourceType: 'google-slides' }, ''))
  const review = loaded.candidates.find((c) => c.normalizedStartDate === '2026-10-26')!
  assert.deepEqual(review.tier1, [])
  assert.deepEqual(review.tier2, [])
  assert.equal(review.status, 'malformed')
  assert.ok(loaded.warnings.length)
  assert.equal(scheduledCurriculumWeek(loaded.datasets, '2026-10-26'), '2026-10-19')
  assert.equal(scheduledCurriculumWeek(loaded.datasets, '2026-10-18'), '')
})

test('normalizing standalone labels does not promote tier mentions in prose to targets', () => {
  const projected = projectGrade2CurriculumText(
    'Week 10/26-10/30\nMath\nTier 1: 示例\nMandarin\nReview of T1\nReview Tier 1 and Tier 2\nELA\nTier 1: 不要',
  )
  assert.equal(projected, 'Week 10/26-10/30\nMandarin\nReview of T1\nReview Tier 1 and Tier 2')
  assert.doesNotMatch(projected, /示例|不要|Tier 1:/)
})

test('retained Grade 2 snapshot identities, vocabulary and fingerprints remain unchanged', async () => {
  const old = JSON.parse(
    await readFile(new URL('../public/curriculum/beta/grade2.json', import.meta.url), 'utf8'),
  ) as CurriculumSnapshot
  const before = structuredClone(old)
  const refreshed = buildCurriculumSnapshot('Grade 2', old.payload, '')
  assert.deepEqual(inspectSnapshot(refreshed).datasets, inspectSnapshot(old).datasets)
  assert.deepEqual(old, before)
})
