import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { SOURCE_REGISTRY } from '../src/config.ts'
import {
  extractGrade5Presentation,
  grade5SlidesSourceAdapter,
  grade5SlidesSourceProfile,
} from '../src/curriculum/adapters/grade5GoogleSlides.ts'
import type { SlidesPresentationPayload } from '../src/curriculum/model.ts'

function loadFixture(): SlidesPresentationPayload {
  return JSON.parse(readFileSync(new URL('./fixtures/grade5-presentation.json', import.meta.url), 'utf8')) as SlidesPresentationPayload
}

function replaceFirstContent(value: unknown, from: string, to: string): boolean {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) {
    for (const child of value) if (replaceFirstContent(child, from, to)) return true
    return false
  }
  const record = value as Record<string, unknown>
  if (typeof record.content === 'string' && record.content.includes(from)) {
    record.content = record.content.replace(from, to)
    return true
  }
  for (const child of Object.values(record)) if (replaceFirstContent(child, from, to)) return true
  return false
}

function cloneFixture() {
  return structuredClone(loadFixture())
}

test('Grade 5 table roles produce one canonical Acquisition candidate per observed week', () => {
  const fixture = loadFixture()
  const extraction = extractGrade5Presentation(fixture)
  const candidates = [...extraction.candidates].sort((left, right) => left.normalizedStartDate!.localeCompare(right.normalizedStartDate!))

  assert.equal(extraction.issues.length, 0)
  assert.equal(candidates.length, 4)
  assert.ok(candidates.every((candidate) => candidate.status === 'valid'))
  assert.ok(candidates.every((candidate) => candidate.instructionalRole === 'weekly-acquisition'))
  assert.ok(candidates.every((candidate) => candidate.source.adapterId === 'grade-5-google-slides-v1'))
  assert.deepEqual(candidates.map((candidate) => candidate.datasetId), [
    'grade-5__2026-27__2026-08-31__2026-09-04',
    'grade-5__2026-27__2026-09-08__2026-09-11',
    'grade-5__2026-27__2026-09-14__2026-09-18',
    'grade-5__2026-27__2026-09-21__2026-09-25',
  ])
  assert.deepEqual(candidates[0].tier1.map((item) => item.text), ['需要', '部分', '重要', '开始', '各种各样'])
  assert.deepEqual(candidates[1].tier1.map((item) => item.text), ['怎样', '吸收', '通过', '像', '如果'])
  assert.deepEqual(candidates[2].tier1.map((item) => item.text), ['或者', '了解', '完', '兴奋的', '告诉'])
  assert.deepEqual(candidates[3].tier1.map((item) => item.text), ['盐', '咸', '层', '用处', '神奇的'])
  assert.deepEqual(candidates[3].tier2.map((item) => item.text), ['河流', '躺', '留', '不断地', '美味的', '刷牙', '洒', '沉', '浮'])
  assert.deepEqual(candidates[3].tier3.map((item) => item.text), ['蒸发', '消毒', '融化（解释：消失/不见了）', '溶解（在水里不见了）'])
  assert.ok(candidates.every((candidate) => candidate.tier1.every((item) => !/students|review|book/i.test(item.text))))

  assert.deepEqual(
    grade5SlidesSourceAdapter.adapt(fixture).map((candidate) => candidate.datasetId),
    extraction.candidates.map((candidate) => candidate.datasetId),
  )
})

test('Grade 5 emits one deterministic progression event per accepted source step', () => {
  const extraction = extractGrade5Presentation(loadFixture())

  assert.deepEqual(extraction.progressionEvents.map((event) => ({
    effectiveDate: event.effectiveDate,
    introducedDatasetId: event.introducedDatasetId,
    confirmedDatasetId: event.confirmedDatasetId,
  })), [
    {
      effectiveDate: '2026-08-31',
      introducedDatasetId: 'grade-5__2026-27__2026-08-31__2026-09-04',
      confirmedDatasetId: undefined,
    },
    {
      effectiveDate: '2026-09-08',
      introducedDatasetId: 'grade-5__2026-27__2026-09-08__2026-09-11',
      confirmedDatasetId: 'grade-5__2026-27__2026-08-31__2026-09-04',
    },
    {
      effectiveDate: '2026-09-14',
      introducedDatasetId: 'grade-5__2026-27__2026-09-14__2026-09-18',
      confirmedDatasetId: 'grade-5__2026-27__2026-09-08__2026-09-11',
    },
    {
      effectiveDate: '2026-09-21',
      introducedDatasetId: 'grade-5__2026-27__2026-09-21__2026-09-25',
      confirmedDatasetId: 'grade-5__2026-27__2026-09-14__2026-09-18',
    },
  ])
  assert.equal(new Set(extraction.progressionEvents.map((event) => event.eventId)).size, 4)
})

test('an identical same-week source occurrence creates no duplicate progression event', () => {
  const fixture = cloneFixture()
  const duplicate = structuredClone(fixture.slides![0])
  duplicate.objectId = 'z-duplicate-week-7'
  fixture.slides = [duplicate, ...fixture.slides!]

  const extraction = extractGrade5Presentation(fixture)

  assert.equal(extraction.candidates.length, 5)
  assert.equal(extraction.classification.decisions.filter((decision) => decision.status === 'duplicate').length, 1)
  assert.equal(extraction.progressionEvents.length, 4)
  assert.ok(extraction.issues.some((issue) => issue.code === 'duplicate_source_unit'))
})

test('different bottom-row vocabulary for one week blocks that week without replacing earlier events', () => {
  const fixture = cloneFixture()
  const conflict = structuredClone(fixture.slides![0])
  conflict.objectId = 'z-conflicting-week-7'
  assert.equal(replaceFirstContent(conflict, 'Tier 1: 盐、咸、层、用处、神奇的', 'Tier 1: 盐、盐、层、用处、神奇的'), true)
  fixture.slides = [conflict, ...fixture.slides!]

  const extraction = extractGrade5Presentation(fixture)

  assert.equal(extraction.progressionEvents.length, 3)
  assert.ok(extraction.classification.decisions.filter((decision) => decision.status === 'conflict').length >= 2)
  assert.ok(extraction.issues.some((issue) => issue.code === 'same_week_conflict'))
  assert.ok(!extraction.progressionEvents.some((event) => event.effectiveDate === '2026-09-21'))
})

test('a top-row mismatch preserves the accepted chain and leaves later cohorts pending', () => {
  const fixture = cloneFixture()
  assert.equal(replaceFirstContent(fixture.slides![1], 'Tier 1：怎样、吸收、通过、像、如果', 'Tier 1：怎样、吸收、通过、像、冲突'), true)

  const extraction = extractGrade5Presentation(fixture)

  assert.equal(extraction.progressionEvents.length, 2)
  assert.ok(extraction.issues.some((issue) => issue.code === 'confirmation_mismatch'))
  assert.ok(extraction.issues.some((issue) => issue.code === 'progression_chain_blocked'))
  assert.ok(extraction.candidates.some((candidate) => candidate.normalizedStartDate === '2026-09-14' && candidate.status === 'valid'))
  assert.ok(extraction.candidates.some((candidate) => candidate.normalizedStartDate === '2026-09-21' && candidate.status === 'valid'))
  assert.ok(!extraction.progressionEvents.some((event) => event.effectiveDate === '2026-09-14'))
  assert.ok(!extraction.progressionEvents.some((event) => event.effectiveDate === '2026-09-21'))
})

test('missing intermediate source evidence never causes calendar-based catch-up', () => {
  const fixture = cloneFixture()
  fixture.slides = fixture.slides!.filter((slide) => slide.objectId !== 'h582f1d63128ff4cf_0_0')

  const extraction = extractGrade5Presentation(fixture)

  assert.deepEqual(extraction.progressionEvents.map((event) => event.effectiveDate), ['2026-08-31', '2026-09-08'])
  assert.ok(extraction.issues.some((issue) => issue.code === 'confirmation_mismatch'))
})

test('a valid source step after a calendar gap advances exactly once', () => {
  const fixture = cloneFixture()
  fixture.slides = fixture.slides!.filter((slide) => slide.objectId !== 'h582f1d63128ff4cf_0_0')
  assert.equal(replaceFirstContent(fixture.slides![0], 'Tier 1：或者、了解、完、兴奋的、告诉', 'Tier 1：怎样、吸收、通过、像、如果'), true)
  assert.equal(replaceFirstContent(fixture.slides![0], 'Tier 2：提醒、沟通、快速地、有意思、年长的、并且、表达、碰', 'Tier 2：空气、根、帮助、植物、食物、得到、关、打开'), true)
  assert.equal(replaceFirstContent(fixture.slides![0], 'Tier 3：发出、警告、扇动、部位、情绪、睁、打招呼、大象群、抬、连续地、尖叫、人类、围、下巴、传递', 'Tier 3：光合作用、呼吸、排出、氧气、气孔、二氧化碳、能量、合成、肺、人类'), true)

  const extraction = extractGrade5Presentation(fixture)

  assert.deepEqual(extraction.progressionEvents.map((event) => event.effectiveDate), ['2026-08-31', '2026-09-08', '2026-09-21'])
  assert.equal(extraction.progressionEvents.at(-1)?.confirmedDatasetId, 'grade-5__2026-27__2026-09-08__2026-09-11')
  assert.ok(!extraction.issues.some((issue) => issue.code === 'confirmation_mismatch'))
})

test('Grade 5 enforces its Tier 1 count range while preserving repeated source occurrences', () => {
  const repeatedFixture = cloneFixture()
  assert.equal(replaceFirstContent(repeatedFixture.slides![0], 'Tier 1: 盐、咸、层、用处、神奇的', 'Tier 1: 盐、盐、层'), true)
  const repeated = extractGrade5Presentation(repeatedFixture).candidates.find((candidate) => candidate.normalizedStartDate === '2026-09-21')!

  assert.equal(repeated.status, 'valid')
  assert.deepEqual(repeated.tier1.map((item) => item.text), ['盐', '盐', '层'])
  assert.equal(new Set(repeated.tier1.map((item) => item.targetOccurrenceId)).size, 3)

  const oversizedFixture = cloneFixture()
  assert.equal(replaceFirstContent(
    oversizedFixture.slides![0],
    'Tier 1: 盐、咸、层、用处、神奇的',
    'Tier 1: 盐、咸、层、用处、神奇的、盐、咸、层、用处、神奇的、盐',
  ), true)
  const oversizedExtraction = extractGrade5Presentation(oversizedFixture)
  const oversized = oversizedExtraction.candidates.find((candidate) => candidate.normalizedStartDate === '2026-09-21')!

  assert.equal(oversized.status, 'malformed')
  assert.ok(oversized.validationOutcomes.some((outcome) => outcome.code === 'grade5_tier1_count_out_of_range'))
  assert.ok(!oversizedExtraction.progressionEvents.some((event) => event.effectiveDate === '2026-09-21'))
})

test('pre-baseline Grade 5 slides remain provenance issues and do not become candidates', () => {
  const fixture = cloneFixture()
  const preBaseline = structuredClone(fixture.slides!.at(-1)!)
  preBaseline.objectId = 'observed-week-3'
  assert.equal(replaceFirstContent(preBaseline, 'Week 4 (8/31-9/4)', 'Week 3 (8/24-28)'), true)
  fixture.slides!.push(preBaseline)

  const extraction = extractGrade5Presentation(fixture)

  assert.equal(extraction.candidates.length, 4)
  assert.ok(extraction.issues.some((issue) => issue.code === 'pre_baseline_source_unit' && issue.sourceUnitId === 'observed-week-3'))
})

test('the Grade 5 source profile remains inactive until lifecycle and practice profiles are implemented', () => {
  const registryEntry = SOURCE_REGISTRY.find((entry) => entry.grade === 'Grade 5')

  assert.equal(registryEntry?.sourceAdapterId, grade5SlidesSourceProfile.sourceAdapterId)
  assert.equal(registryEntry?.active, false)
  assert.equal(registryEntry?.practiceProfileId, 'grade-5-unimplemented')
})
