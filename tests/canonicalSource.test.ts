import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { canonicalizeWeeklyDatasetCandidate, isCanonicalWeeklyDatasetCandidate, validateWeeklyDatasetCandidate } from '../src/curriculum/canonical.ts'
import type { SheetsWorkbookPayload, SourceAdapter } from '../src/curriculum/model.ts'
import { grade2PracticeProfile } from '../src/practice/profiles/grade2.ts'
import {
  candidateFromSlide,
  grade2DeckProfile,
  grade2SlidesSourceAdapter,
  importLogIdFor,
  importWeeklyDatasets,
  parseSlide,
  type PresentationLike,
} from '../src/slidesImporter.ts'

function loadPresentationFixture(name: string): PresentationLike {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
  return JSON.parse(readFileSync(path, 'utf8')) as PresentationLike
}

function expectedGrade2Dataset(options: {
  id: string
  dateRange: string
  startDate: string
  endDate: string
  sourceSlideId: string
  words: string[]
}) {
  return {
    id: options.id,
    dateRange: options.dateRange,
    startDate: options.startDate,
    endDate: options.endDate,
    grade: 'Grade 2',
    schoolYear: '2026–2027',
    description: `Tier 1 words from ${options.dateRange}`,
    sourceDeckId: '10gpdTFqwBhWf9pD9HzF8AkD9Zyg7nBUSeTCGXuS8ky4',
    sourceSlideId: options.sourceSlideId,
    importStatus: 'valid',
    isWritingWorkshop: false,
    words: options.words.map((text, index) => ({
      id: `${options.id}-${index + 1}`,
      text,
      sentence: '',
      datasetId: options.id,
      grade: 'Grade 2',
      sourceSlideId: options.sourceSlideId,
      language: 'mandarin',
      tier: 'tier-1',
      activityType: 'dictation',
    })),
  }
}

function stableDataset(dataset: NonNullable<ReturnType<typeof importWeeklyDatasets>['datasets'][number]>) {
  const { importedAt: _importedAt, ...stable } = dataset
  return stable
}

const expectedGrade2Datasets = [
  expectedGrade2Dataset({
    id: 'grade-2__2026-27__2026-08-31__2026-09-04',
    dateRange: '8/31–9/4',
    startDate: '2026-08-31',
    endDate: '2026-09-04',
    sourceSlideId: 'g3fa28218657_0_0',
    words: ['很短', '也', '笑', '学校', '说'],
  }),
  expectedGrade2Dataset({
    id: 'grade-2__2026-27__2026-09-08__2026-09-11',
    dateRange: '9/8–9/11',
    startDate: '2026-09-08',
    endDate: '2026-09-11',
    sourceSlideId: 'g3fa28218657_0_10',
    words: ['美国', '带', '路', '到', '都'],
  }),
  expectedGrade2Dataset({
    id: 'grade-2__2026-27__2026-09-14__2026-09-18',
    dateRange: '9/14–9/18',
    startDate: '2026-09-14',
    endDate: '2026-09-18',
    sourceSlideId: 'g40a01d2cf58_0_0',
    words: ['出生', '但是', '运动', '地方', '不同'],
  }),
  expectedGrade2Dataset({
    id: 'grade-2__2026-27__2026-09-21__2026-09-25',
    dateRange: '9/21–9/25',
    startDate: '2026-09-21',
    endDate: '2026-09-25',
    sourceSlideId: 'g40a01d2cf58_0_10',
    words: ['比如', '部分', '更', '方便', '美好'],
  }),
]

test('the canonical source boundary preserves the complete Grade 2 golden output', () => {
  const fixture = loadPresentationFixture('grade2-presentation.json')
  const batch = importWeeklyDatasets(fixture, [], grade2DeckProfile)

  assert.equal(batch.status, 'ok')
  assert.equal(batch.message, 'Validated 4 weekly datasets; malformed slides were skipped.')
  assert.deepEqual(batch.datasets.map(stableDataset), expectedGrade2Datasets)
  assert.deepEqual(batch.summary, {
    datasetCount: 4,
    slideIds: ['g3fa28218657_0_0', 'g3fa28218657_0_10', 'g40a01d2cf58_0_0', 'g40a01d2cf58_0_10'],
    dateRanges: ['8/31–9/4', '9/8–9/11', '9/14–9/18', '9/21–9/25'],
    wordCounts: [5, 5, 5, 5],
  })
  assert.deepEqual(batch.outcomes.map((outcome) => ({
    status: outcome.status,
    message: outcome.message,
    datasetId: outcome.datasetId,
    sourceDeckId: outcome.sourceDeckId,
    sourceSlideId: outcome.sourceSlideId,
  })), [
    { status: 'imported', message: 'Extracted 5 Tier 1 targets.', datasetId: 'grade-2__2026-27__2026-09-21__2026-09-25', sourceDeckId: grade2DeckProfile.sourceDeckId, sourceSlideId: 'g40a01d2cf58_0_10' },
    { status: 'imported', message: 'Extracted 5 Tier 1 targets.', datasetId: 'grade-2__2026-27__2026-09-14__2026-09-18', sourceDeckId: grade2DeckProfile.sourceDeckId, sourceSlideId: 'g40a01d2cf58_0_0' },
    { status: 'imported', message: 'Extracted 5 Tier 1 targets.', datasetId: 'grade-2__2026-27__2026-09-08__2026-09-11', sourceDeckId: grade2DeckProfile.sourceDeckId, sourceSlideId: 'g3fa28218657_0_10' },
    { status: 'imported', message: 'Extracted 5 Tier 1 targets.', datasetId: 'grade-2__2026-27__2026-08-31__2026-09-04', sourceDeckId: grade2DeckProfile.sourceDeckId, sourceSlideId: 'g3fa28218657_0_0' },
  ])
})

test('the Grade 2 adapter preserves source order, provenance, and all observed tiers', () => {
  const fixture = loadPresentationFixture('grade2-presentation.json')
  const candidates = grade2SlidesSourceAdapter.adapt({ sourceType: 'google-slides', ...fixture })

  assert.deepEqual(candidates.map((candidate) => ({
    datasetId: candidate.datasetId,
    sourceDocumentId: candidate.source.sourceDocumentId,
    sourceUnitId: candidate.source.sourceUnitId,
    tier1: candidate.tier1.map((word) => word.text),
    tier2: candidate.tier2.map((word) => word.text),
    tier3: candidate.tier3.map((word) => word.text),
    status: candidate.status,
  })), [
    { datasetId: 'grade-2__2026-27__2026-09-21__2026-09-25', sourceDocumentId: grade2DeckProfile.sourceDeckId, sourceUnitId: 'g40a01d2cf58_0_10', tier1: ['比如', '部分', '更', '方便', '美好'], tier2: ['城市', '上班', '公园'], tier3: [], status: 'valid' },
    { datasetId: 'grade-2__2026-27__2026-09-14__2026-09-18', sourceDocumentId: grade2DeckProfile.sourceDeckId, sourceUnitId: 'g40a01d2cf58_0_0', tier1: ['出生', '但是', '运动', '地方', '不同'], tier2: ['身体', '手'], tier3: [], status: 'valid' },
    { datasetId: 'grade-2__2026-27__2026-09-08__2026-09-11', sourceDocumentId: grade2DeckProfile.sourceDeckId, sourceUnitId: 'g3fa28218657_0_10', tier1: ['美国', '带', '路', '到', '都'], tier2: ['帮助', '找'], tier3: [], status: 'valid' },
    { datasetId: 'grade-2__2026-27__2026-08-31__2026-09-04', sourceDocumentId: grade2DeckProfile.sourceDeckId, sourceUnitId: 'g3fa28218657_0_0', tier1: ['很短', '也', '笑', '学校', '说'], tier2: ['爱心', '难过'], tier3: [], status: 'valid' },
  ])
  assert.ok(candidates.every(isCanonicalWeeklyDatasetCandidate))
})

test('workshop, malformed, and duplicate Grade 2 outcomes remain compatible', () => {
  const workshop = importWeeklyDatasets(loadPresentationFixture('grade2-writing-workshop.json'), [], grade2DeckProfile)
  assert.equal(workshop.outcomes[0].status, 'writing-workshop')
  assert.deepEqual(stableDataset(workshop.datasets[0]), {
    ...expectedGrade2Dataset({
      id: 'grade-2__2026-27__2026-10-05__2026-10-09',
      dateRange: '10/5–10/9',
      startDate: '2026-10-05',
      endDate: '2026-10-09',
      sourceSlideId: 'synthetic-writing-workshop',
      words: [],
    }),
    description: 'Writing workshop from 10/5–10/9',
    importStatus: 'writing-workshop',
    isWritingWorkshop: true,
  })

  const malformed = importWeeklyDatasets(loadPresentationFixture('grade2-malformed-synthetic.json'), [], grade2DeckProfile)
  assert.equal(malformed.status, 'error')
  assert.equal(malformed.datasets.length, 0)
  assert.deepEqual(malformed.outcomes[0], {
    status: 'error',
    sourceDeckId: grade2DeckProfile.sourceDeckId,
    sourceSlideId: 'synthetic-malformed-slide',
    datasetId: 'grade-2__2026-27__2026-09-28__2026-10-02',
    message: 'The slide has a weekly heading but no confident Tier 1 vocabulary section.',
  })

  const fixture = loadPresentationFixture('grade2-presentation.json')
  const existingIds = expectedGrade2Datasets.map((dataset) => dataset.id)
  const duplicate = importWeeklyDatasets(fixture, existingIds, grade2DeckProfile)
  assert.equal(duplicate.status, 'error')
  assert.equal(duplicate.datasets.length, 0)
  assert.ok(duplicate.outcomes.every((outcome) => outcome.status === 'duplicate'))
  assert.deepEqual(duplicate.outcomes.map(importLogIdFor), [
    'import-grade-2__2026-27__2026-09-21__2026-09-25-g40a01d2cf58_0_10-duplicate',
    'import-grade-2__2026-27__2026-09-14__2026-09-18-g40a01d2cf58_0_0-duplicate',
    'import-grade-2__2026-27__2026-09-08__2026-09-11-g3fa28218657_0_10-duplicate',
    'import-grade-2__2026-27__2026-08-31__2026-09-04-g3fa28218657_0_0-duplicate',
  ])
})

test('Grade 2 Slides normalize all vocabulary tiers before Tier 1 becomes writing practice', () => {
  const slide = {
    objectId: 'canonical-slide',
    text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分\nTier 2: 城市、上班\nTier 3: 社区',
  }
  const [candidate] = grade2SlidesSourceAdapter.adapt({
    sourceType: 'google-slides',
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [slide],
  })
  const imported = parseSlide(slide, grade2DeckProfile)

  assert.equal(candidate.status, 'valid')
  assert.equal(candidate.datasetId, 'grade-2__2026-27__2026-09-21__2026-09-25')
  assert.deepEqual(candidate.tier1.map((item) => item.text), ['比如', '部分'])
  assert.deepEqual(candidate.tier2.map((item) => item.text), ['城市', '上班'])
  assert.deepEqual(candidate.tier3.map((item) => item.text), ['社区'])
  assert.equal(candidate.source.sourceType, 'google-slides')
  assert.equal(candidate.source.sourceUnitId, 'canonical-slide')
  assert.match(candidate.contentFingerprint, /^v1-fnv1a64-/)
  assert.ok(isCanonicalWeeklyDatasetCandidate(candidate))
  assert.deepEqual(imported.dataset?.words.map((word) => word.text), ['比如', '部分'])
})

test('ordered duplicate vocabulary values remain separate stable target occurrences', () => {
  const candidate = candidateFromSlide({
    objectId: 'duplicate-values',
    text: 'Week 9/21-9/25\nMandarin\nTier 1: 需要、需要、开始',
  })

  assert.deepEqual(candidate.tier1.map((item) => item.text), ['需要', '需要', '开始'])
  assert.deepEqual(candidate.tier1.map((item) => item.sourcePosition), [1, 2, 3])
  assert.deepEqual(candidate.tier1.map((item) => item.targetOccurrenceId), [
    `${candidate.datasetId}-1`,
    `${candidate.datasetId}-2`,
    `${candidate.datasetId}-3`,
  ])
  assert.equal(new Set(candidate.tier1.map((item) => item.targetOccurrenceId)).size, 3)
})

test('the source adapter contract also accepts a Google Sheets workbook payload', () => {
  const sheetsAdapter: SourceAdapter<SheetsWorkbookPayload> = {
    id: 'fixture-sheets-adapter',
    version: 1,
    sourceType: 'google-sheets',
    grade: 'Fixture Grade',
    schoolYear: '2026–2027',
    adapt(payload) {
      const sheet = payload.sheets?.[0]
      return [canonicalizeWeeklyDatasetCandidate({
        grade: this.grade,
        schoolYear: this.schoolYear,
        rawDate: sheet?.title || null,
        dateRangeLabel: '9/21–9/25',
        normalizedStartDate: '2026-09-21',
        normalizedEndDate: '2026-09-25',
        assignedWeek: { startDate: '2026-09-21', endDate: '2026-09-25' },
        source: {
          sourceType: payload.sourceType,
          sourceDocumentId: payload.spreadsheetId || '',
          sourceUnitId: String(sheet?.sheetId || ''),
          adapterId: this.id,
        },
        sourceSectionLabel: 'Vocabulary',
        instructionalRole: 'weekly-acquisition',
        tier1: ['甲', '乙', '甲'],
        tier2: ['丙', '丁'],
        tier3: [],
      })]
    },
  }
  const [candidate] = sheetsAdapter.adapt({
    sourceType: 'google-sheets',
    spreadsheetId: 'fixture-workbook',
    sheets: [{ sheetId: 921, title: 'Week 09/21', values: [['Vocabulary', '甲、乙、甲']] }],
  })

  assert.equal(candidate.source.sourceType, 'google-sheets')
  assert.equal(candidate.source.sourceDocumentId, 'fixture-workbook')
  assert.deepEqual(candidate.tier1.map((item) => item.text), ['甲', '乙', '甲'])
  assert.deepEqual(candidate.tier2.map((item) => item.text), ['丙', '丁'])
  assert.ok(isCanonicalWeeklyDatasetCandidate(candidate))
})

test('canonical validation detects content changed after fingerprinting', () => {
  const candidate = candidateFromSlide({ objectId: 'fingerprint-slide', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' })
  const changed = {
    ...candidate,
    tier1: candidate.tier1.map((item, index) => index === 0 ? { ...item, text: '改变' } : item),
  }
  assert.ok(validateWeeklyDatasetCandidate(changed).some((outcome) => outcome.code === 'fingerprint_mismatch'))
})

test('Grade 2 behavior is explicitly versioned without changing its established settings', () => {
  assert.equal(grade2PracticeProfile.version, 1)
  assert.deepEqual(grade2PracticeProfile.timers, { warmup: 10, acquisition: 20, testReview: 10 })
  assert.equal(grade2PracticeProfile.lifecycle.primaryWarmupTrials, 6)
  assert.deepEqual(grade2PracticeProfile.acquisition.introductionSequence, ['true-bm', 'true-bm', 'show-copy', 'target'])
})
