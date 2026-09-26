import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { canonicalizeWeeklyDatasetCandidate, classifyCandidateCollision, isCanonicalWeeklyDatasetCandidate, validateWeeklyDatasetCandidate } from '../src/curriculum/canonical.ts'
import { classifyWeeklyDatasetCandidates } from '../src/curriculum/classification.ts'
import type { SheetsWorkbookPayload, SourceAdapter } from '../src/curriculum/model.ts'
import { SOURCE_REGISTRY, type CurriculumSourceRegistryEntry } from '../src/config.ts'
import { grade2PracticeProfile } from '../src/practice/profiles/grade2.ts'
import {
  candidateFromSlide,
  grade2DeckProfile,
  grade2SlidesSourceAdapter,
  importLatestWeeklyDataset,
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
  assert.equal(duplicate.status, 'ok')
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
  assert.match(candidate.contentFingerprint, /^v2-fnv1a64-/)
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

test('source-neutral classification preserves every Sheets candidate outcome and provenance', () => {
  const sheetsCandidate = (sourceUnitId: string, instructionalRole: 'next-week-preview' | 'current-confirmation', tier1: string[]) => canonicalizeWeeklyDatasetCandidate({
    grade: 'Fixture Grade',
    schoolYear: '2026–2027',
    rawDate: 'Week 6 09/21',
    dateRangeLabel: '9/21–9/25',
    normalizedStartDate: '2026-09-21',
    normalizedEndDate: '2026-09-25',
    assignedWeek: { startDate: '2026-09-21', endDate: '2026-09-25' },
    source: { sourceType: 'google-sheets', sourceDocumentId: 'fixture-workbook', sourceUnitId, adapterId: 'fixture-sheets-adapter' },
    sourceSectionLabel: 'Writing character',
    instructionalRole,
    tier1,
    tier2: ['红色', '蓝色'],
    tier3: [],
  })
  const preview = sheetsCandidate('week-6-preview', 'next-week-preview', ['九', '十', '白'])
  const current = sheetsCandidate('week-6-current-a', 'current-confirmation', ['九', '十', '白'])
  const duplicateCurrent = sheetsCandidate('week-6-current-b', 'current-confirmation', ['九', '十', '白'])
  const collapsed = classifyWeeklyDatasetCandidates([preview, current, duplicateCurrent])

  assert.equal(collapsed.decisions.length, 3)
  assert.deepEqual(collapsed.decisions.map((decision) => decision.status), ['confirmation', 'selected', 'duplicate'])
  assert.deepEqual(collapsed.decisions.map((decision) => decision.candidate.source.sourceUnitId), ['week-6-preview', 'week-6-current-a', 'week-6-current-b'])
  assert.ok(collapsed.decisions.every((decision) => decision.candidate.source.sourceType === 'google-sheets'))
  assert.deepEqual(collapsed.selectedCandidates.map((candidate) => candidate.source.sourceUnitId), ['week-6-current-a'])

  const conflict = sheetsCandidate('week-6-conflict', 'current-confirmation', ['不同', '内容', '词语'])
  const conflicted = classifyWeeklyDatasetCandidates([current, conflict])
  assert.deepEqual(conflicted.decisions.map((decision) => decision.status), ['conflict', 'conflict'])
  assert.equal(conflicted.selectedCandidates.length, 0)
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

test('same-week vocabulary disagreements are conflicts and neither version is imported', () => {
  const batch = importWeeklyDatasets({
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [
      { objectId: 'version-a', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' },
      { objectId: 'version-b', text: 'Week 9/21-9/25\nMandarin\nTier 1: 不同、内容' },
    ],
  }, [], grade2DeckProfile)

  assert.equal(batch.status, 'error')
  assert.equal(batch.datasets.length, 0)
  assert.deepEqual(batch.outcomes.map((outcome) => outcome.status), ['conflict', 'conflict'])
  assert.ok(batch.outcomes.every((outcome) => !outcome.dataset))
})

test('a later conflict invalidates every earlier duplicate for the same week', () => {
  const presentation = {
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [
      { objectId: 'matching-a', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' },
      { objectId: 'matching-b', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' },
      { objectId: 'conflicting-c', text: 'Week 9/21-9/25\nMandarin\nTier 1: 不同、内容' },
    ],
  }
  const batch = importWeeklyDatasets(presentation, [], grade2DeckProfile)
  const latest = importLatestWeeklyDataset(presentation, [], grade2DeckProfile)

  assert.equal(batch.status, 'error')
  assert.equal(batch.datasets.length, 0)
  assert.deepEqual(batch.outcomes.map((outcome) => outcome.status), ['conflict', 'conflict', 'conflict'])
  assert.ok(batch.outcomes.every((outcome) => !outcome.dataset))
  assert.equal(latest.status, 'error')
  assert.equal(latest.dataset, undefined)
})

test('identical same-week candidates choose the same canonical source regardless of slide order', () => {
  const slideA = { objectId: 'source-a', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' }
  const slideB = { objectId: 'source-b', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' }
  const forward = importWeeklyDatasets({ presentationId: grade2DeckProfile.sourceDeckId, slides: [slideA, slideB] }, [], grade2DeckProfile)
  const reversed = importWeeklyDatasets({ presentationId: grade2DeckProfile.sourceDeckId, slides: [slideB, slideA] }, [], grade2DeckProfile)

  assert.equal(forward.datasets[0].sourceSlideId, 'source-a')
  assert.equal(reversed.datasets[0].sourceSlideId, 'source-a')
  assert.deepEqual(forward.datasets[0].words.map((word) => word.text), reversed.datasets[0].words.map((word) => word.text))
})

test('a stored fingerprint distinguishes a true rerun from a changed existing week', () => {
  const original = candidateFromSlide({ objectId: 'stored', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' })
  const presentation = {
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [{ objectId: 'changed', text: 'Week 9/21-9/25\nMandarin\nTier 1: 不同、内容' }],
  }
  const reference = { datasetId: original.datasetId!, contentFingerprint: original.contentFingerprint, candidateStatus: original.status, instructionalRole: original.instructionalRole }
  const batch = importWeeklyDatasets(presentation, [reference], grade2DeckProfile)

  assert.equal(batch.status, 'error')
  assert.equal(batch.datasets.length, 0)
  assert.equal(batch.outcomes[0].status, 'conflict')
  assert.match(batch.outcomes[0].message, /previous valid dataset was preserved/i)
})

test('preview and current roles confirm identical vocabulary without changing its content fingerprint', () => {
  const base = candidateFromSlide({ objectId: 'preview', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' })
  const preview = { ...base, instructionalRole: 'next-week-preview' as const }
  const current = { ...base, source: { ...base.source, sourceUnitId: 'current' }, instructionalRole: 'current-confirmation' as const }
  const changed = { ...candidateFromSlide({ objectId: 'changed', text: 'Week 9/21-9/25\nMandarin\nTier 1: 改变、部分' }), instructionalRole: 'current-confirmation' as const }

  assert.equal(preview.contentFingerprint, current.contentFingerprint)
  assert.equal(classifyCandidateCollision(preview, current), 'confirmation')
  assert.equal(classifyCandidateCollision(preview, changed), 'conflict')
})

test('a current source confirms a stored preview across import runs', () => {
  const current = candidateFromSlide({ objectId: 'current-slide', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' })
  const storedPreview = {
    datasetId: current.datasetId!,
    contentFingerprint: current.contentFingerprint,
    candidateStatus: current.status,
    instructionalRole: 'next-week-preview' as const,
  }
  const batch = importWeeklyDatasets({
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [{ objectId: 'current-slide', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' }],
  }, [storedPreview], grade2DeckProfile)

  assert.equal(batch.status, 'ok')
  assert.equal(batch.datasets.length, 0)
  assert.equal(batch.outcomes[0].status, 'confirmation')
  assert.equal(batch.outcomes[0].refreshExistingMetadata, true)
  assert.equal(batch.outcomes[0].instructionalRole, 'weekly-acquisition')
  assert.match(batch.message, /no vocabulary was rewritten/i)
})

test('a conflicting current source cancels a stored-preview confirmation in the same run', () => {
  const stored = candidateFromSlide({ objectId: 'stored-preview', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' })
  const batch = importWeeklyDatasets({
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [
      { objectId: 'matching-current', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' },
      { objectId: 'conflicting-current', text: 'Week 9/21-9/25\nMandarin\nTier 1: 不同、内容' },
    ],
  }, [{ datasetId: stored.datasetId!, contentFingerprint: stored.contentFingerprint, candidateStatus: stored.status, instructionalRole: 'next-week-preview' }], grade2DeckProfile)

  assert.equal(batch.status, 'error')
  assert.equal(batch.datasets.length, 0)
  assert.deepEqual(batch.outcomes.map((outcome) => outcome.status), ['conflict', 'conflict'])
  assert.ok(batch.outcomes.every((outcome) => !outcome.dataset && !outcome.refreshExistingMetadata))
})

test('shared validation rejects impossible and reversed assigned-week dates', () => {
  const candidateFor = (startDate: string, endDate: string) => canonicalizeWeeklyDatasetCandidate({
    grade: 'Fixture Grade',
    schoolYear: '2026–2027',
    rawDate: `${startDate}–${endDate}`,
    dateRangeLabel: `${startDate}–${endDate}`,
    normalizedStartDate: startDate,
    normalizedEndDate: endDate,
    assignedWeek: { startDate, endDate },
    source: { sourceType: 'google-sheets', sourceDocumentId: 'fixture-workbook', sourceUnitId: 'fixture-tab', adapterId: 'fixture-adapter' },
    sourceSectionLabel: 'Vocabulary',
    instructionalRole: 'weekly-acquisition',
    tier1: ['甲'],
    tier2: [],
    tier3: [],
  })

  const impossible = candidateFor('2026-02-30', '2026-03-02')
  const reversed = candidateFor('2026-09-25', '2026-09-21')
  assert.equal(impossible.status, 'malformed')
  assert.ok(impossible.validationOutcomes.some((outcome) => outcome.code === 'invalid_week_date'))
  assert.equal(reversed.status, 'malformed')
  assert.ok(reversed.validationOutcomes.some((outcome) => outcome.code === 'invalid_week_order'))
})

test('the source registry can represent Sheets without fake deck fields', () => {
  const sheetsEntry: CurriculumSourceRegistryEntry = {
    grade: 'Kindergarten',
    displayName: 'Fixture Sheets Source',
    schoolYear: '2026–2027',
    sourceType: 'google-sheets',
    sourceDocumentId: 'fixture-workbook',
    sourceAdapterId: 'fixture-sheets-adapter',
    practiceProfileId: 'fixture-practice-profile',
    active: false,
  }

  assert.equal(sheetsEntry.sourceType, 'google-sheets')
  assert.ok(SOURCE_REGISTRY.every((entry) => !('sourceDeckId' in entry)))
})
