import {
  type AdaptiveWarmupProfile,
  type AdaptiveWarmupProfileRegistry,
  type ChildMasteryState,
  type FinalReviewEvidenceCandidate,
  type MasteryDatasetLifecycleAssignment,
  type MasteryLifecycleAssignment,
  type MasteryOccurrence,
  type MasteryOccurrenceStage,
  type MasteryRotationState,
  type MasteryTermDefinition,
  type MasteryVocabularyTier,
  type MasteryLanguage,
  type WarmupSchedulingBucket,
} from './contracts.ts'
import { isOccurrenceMasteryEligible, selectLatestFinalReviewEvidence } from './eligibility.ts'
import {
  MASTERY_NORMALIZER_VERSION,
  createMasteryOccurrence,
  deterministicMasteryTermId,
  masteryIdentitiesEqual,
  masteryOccurrencesEqual,
  masteryRotationStateId,
  upsertMasteryOccurrence,
  type MasteryTermIdFactory,
} from './identity.ts'
import {
  reconstructChildMasteryStates,
  type LegacyMasterySnapshot,
  type ReplayOccurrence,
  type WarmupReplayAttempt,
} from './migrationReplay.ts'
import { profileForOccurrence, validateAdaptiveWarmupProfileRegistry } from './profileValidation.ts'
import { validateAdaptiveWarmupV3Projection } from './validation.ts'

type JsonRecord = Record<string, unknown>

export type AdaptiveWarmupMigrationIssueCode =
  | 'invalid-top-level-state'
  | 'unsupported-source-version'
  | 'invalid-top-level-collection'
  | 'malformed-dataset'
  | 'conflicting-duplicate-dataset'
  | 'malformed-word'
  | 'word-dataset-mismatch'
  | 'conflicting-duplicate-word'
  | 'global-occurrence-id-collision'
  | 'malformed-child-word-state'
  | 'unresolved-dataset'
  | 'unresolved-word'
  | 'unresolved-mastery-metadata'
  | 'conflicting-trusted-metadata'
  | 'unresolved-lifecycle-assignment'
  | 'conflicting-lifecycle-assignment'
  | 'invalid-lifecycle-assignment'
  | 'mastery-id-collision'
  | 'occurrence-identity-mismatch'
  | 'malformed-final-review-evidence'
  | 'conflicting-final-review-evidence'
  | 'malformed-warmup-evidence'
  | 'conflicting-warmup-evidence'
  | 'unresolved-adaptive-profile'
  | 'invalid-adaptive-profile-registry'
  | 'invalid-v3-projection'
  | 'generated-invalid-v3-projection'

export type AdaptiveWarmupMigrationIssue = {
  code: AdaptiveWarmupMigrationIssueCode
  message: string
  collection?: 'datasets' | 'words' | 'childWordStates' | 'results' | 'lifecycleAssignments' | 'finalReviewEvidence'
  recordId?: string
  raw?: unknown
}

export type AdaptiveWarmupMigrationReport = {
  sourceVersion: number | null
  targetVersion: 3
  migratedTermCount: number
  migratedChildStateCount: number
  migratedOccurrenceCount: number
  activeOccurrenceCount: number
  preservedLegacyMonthlyScoreCount: number
  deferredRecordCount: number
  quarantined: AdaptiveWarmupMigrationIssue[]
}

export type AdaptiveWarmupDeferredRecord = {
  id: string
  reason: 'missing-profile'
  collection: 'childWordStates' | 'finalReviewEvidence' | 'results'
  childId: string
  occurrenceId: string
  grade: string
  activityModule: string
  rawFingerprint: string
  raw: unknown
}

export type AdaptiveWarmupV3Projection = {
  schemaVersion: 3
  migrationStatus: 'complete' | 'partial'
  normalizerVersion: typeof MASTERY_NORMALIZER_VERSION
  terms: MasteryTermDefinition[]
  lifecycleAssignments: MasteryLifecycleAssignment[]
  childStates: ChildMasteryState[]
  rotationStates: MasteryRotationState[]
  legacyMonthlyRotationScores: unknown[]
  deferredRecords: AdaptiveWarmupDeferredRecord[]
  migrationReport: AdaptiveWarmupMigrationReport
}

export type AdaptiveWarmupMigrationResult = {
  status: 'migrated' | 'partially-migrated' | 'already-migrated' | 'failed'
  state: unknown
  report: AdaptiveWarmupMigrationReport
}

export type AdaptiveWarmupMigrationOptions = {
  profileRegistry: AdaptiveWarmupProfileRegistry
  trustedGrade2Tier1DatasetIds?: readonly string[]
  lifecycleAssignments?: readonly MasteryDatasetLifecycleAssignment[]
  finalReviewEvidence?: readonly FinalReviewEvidenceCandidate[]
  trustedLegacyFinalReviewDatasetIds?: readonly string[]
  masteryTermIdFactory?: MasteryTermIdFactory
}

type LegacyChildWordState = {
  childId: string
  wordId: string
  datasetId: string
  category: 'acquisition' | 'recent-review' | 'errored-word' | 'random-rotation'
  correctStreak: number
  lastReviewedAt?: string
  lastIncorrectAt?: string
  randomCycleId?: number
  randomCycleReviewed?: boolean
}

type ResolvedMetadata = {
  language: MasteryLanguage
  tier: MasteryVocabularyTier
  activityType: 'dictation' | 'reading' | 'spelling'
  activityModule: string
}

type OccurrenceCandidate = {
  occurrence: MasteryOccurrence
  datasetId: string
  wordId: string
  curriculumOrder: string
  eligibleAt?: string
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

function stableSerialize(value: unknown) {
  return JSON.stringify(stableValue(value))
}

function canonicalDatasetValue(dataset: JsonRecord) {
  return stableSerialize({ ...dataset, words: Array.isArray(dataset.words) ? [...dataset.words].sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right))) : dataset.words })
}

function sortIssues(issues: AdaptiveWarmupMigrationIssue[]) {
  return [...issues].sort((left, right) => [left.code, left.collection || '', left.recordId || '', left.message, stableSerialize(left.raw)].join('\u0000')
    .localeCompare([right.code, right.collection || '', right.recordId || '', right.message, stableSerialize(right.raw)].join('\u0000')))
}

function validStage(value: unknown): value is MasteryOccurrenceStage {
  if (!isRecord(value) || !nonEmptyString(value.kind)) return false
  if (value.kind === 'test-review') return Number.isInteger(value.cycle) && Number(value.cycle) > 0
  return ['future', 'acquisition', 'mastery', 'no-instruction', 'malformed', 'legacy-active'].includes(value.kind)
}

function validDatasetLifecycle(value: unknown): value is MasteryDatasetLifecycleAssignment {
  return isRecord(value)
    && nonEmptyString(value.datasetId)
    && nonEmptyString(value.profileId)
    && validStage(value.stage)
    && Number.isInteger(value.finalTestReviewCycle)
    && Number(value.finalTestReviewCycle) > 0
    && (value.stage.kind !== 'test-review' || value.stage.cycle <= Number(value.finalTestReviewCycle))
}

function moduleFor(language: MasteryLanguage, tier: MasteryVocabularyTier, activityType: 'dictation' | 'reading' | 'spelling') {
  const skill = activityType === 'dictation' ? 'writing' : activityType
  return `${language}-${tier.replace('-', '')}-${skill}`
}

function resolveMetadata(dataset: JsonRecord, word: JsonRecord, trustedDatasetIds: ReadonlySet<string>): { metadata?: ResolvedMetadata; code?: AdaptiveWarmupMigrationIssueCode; message?: string } {
  const trustedGrade2 = dataset.grade === 'Grade 2' && nonEmptyString(dataset.id) && trustedDatasetIds.has(dataset.id)
  const language = word.language
  const tier = word.tier
  const activityType = word.activityType
  if (trustedGrade2) {
    if ((language !== undefined && language !== 'mandarin')
      || (tier !== undefined && tier !== 'tier-1')
      || (activityType !== undefined && activityType !== 'dictation')) {
      return { code: 'conflicting-trusted-metadata', message: 'Trusted Grade 2 Tier 1 writing data contains conflicting module metadata.' }
    }
    return { metadata: { language: 'mandarin', tier: 'tier-1', activityType: 'dictation', activityModule: 'mandarin-tier1-writing' } }
  }
  if (!['mandarin', 'english'].includes(String(language))
    || !['tier-1', 'tier-2', 'tier-3'].includes(String(tier))
    || !['dictation', 'reading', 'spelling'].includes(String(activityType))) {
    return { code: 'unresolved-mastery-metadata', message: 'Module, tier, and language could not be resolved from trusted canonical metadata.' }
  }
  const resolvedLanguage = language as MasteryLanguage
  const resolvedTier = tier as MasteryVocabularyTier
  const resolvedActivity = activityType as ResolvedMetadata['activityType']
  return { metadata: { language: resolvedLanguage, tier: resolvedTier, activityType: resolvedActivity, activityModule: moduleFor(resolvedLanguage, resolvedTier, resolvedActivity) } }
}

function parseLegacyState(value: unknown): LegacyChildWordState | null {
  if (!isRecord(value)
    || !nonEmptyString(value.childId)
    || !nonEmptyString(value.wordId)
    || !nonEmptyString(value.datasetId)
    || !['acquisition', 'recent-review', 'errored-word', 'random-rotation'].includes(String(value.category))
    || !Number.isInteger(value.correctStreak)
    || Number(value.correctStreak) < 0
    || (value.lastReviewedAt !== undefined && !validTimestamp(value.lastReviewedAt))
    || (value.lastIncorrectAt !== undefined && !validTimestamp(value.lastIncorrectAt))
    || (value.randomCycleId !== undefined && (!Number.isInteger(value.randomCycleId) || Number(value.randomCycleId) < 1))
    || (value.randomCycleReviewed !== undefined && typeof value.randomCycleReviewed !== 'boolean')) return null
  const lastIncorrectAt = validTimestamp(value.lastIncorrectAt) ? value.lastIncorrectAt : undefined
  const lastReviewedAt = latestTimestamp([
    validTimestamp(value.lastReviewedAt) ? value.lastReviewedAt : undefined,
    lastIncorrectAt,
  ])
  return {
    childId: value.childId,
    wordId: value.wordId,
    datasetId: value.datasetId,
    category: value.category as LegacyChildWordState['category'],
    correctStreak: Number(value.correctStreak),
    ...(lastReviewedAt ? { lastReviewedAt } : {}),
    ...(lastIncorrectAt ? { lastIncorrectAt } : {}),
    ...(typeof value.randomCycleId === 'number' ? { randomCycleId: value.randomCycleId } : {}),
    ...(typeof value.randomCycleReviewed === 'boolean' ? { randomCycleReviewed: value.randomCycleReviewed } : {}),
  }
}

function parseFinalReviewEvidence(value: unknown): FinalReviewEvidenceCandidate | null {
  if (!isRecord(value)
    || !nonEmptyString(value.attemptId)
    || !nonEmptyString(value.childId)
    || !nonEmptyString(value.occurrenceId)
    || !Number.isInteger(value.reviewCycle)
    || Number(value.reviewCycle) < 1
    || !validTimestamp(value.reviewedAt)
    || !['completed', 'provisional', 'abandoned', 'skipped', 'unanswered'].includes(String(value.status))
    || (value.status === 'completed' && typeof value.correct !== 'boolean')
    || (value.correct !== undefined && typeof value.correct !== 'boolean')) return null
  return value as FinalReviewEvidenceCandidate
}

function canonicalExplicitFinalReviewEvidence(values: readonly unknown[], occurrenceIds: ReadonlySet<string>, report: AdaptiveWarmupMigrationReport) {
  const groups = new Map<string, unknown[]>()
  for (const value of [...values].sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)))) {
    if (!isRecord(value) || !nonEmptyString(value.attemptId)) {
      report.quarantined.push({ code: 'malformed-final-review-evidence', message: 'Final Test Review evidence has no stable attempt ID.', collection: 'finalReviewEvidence', raw: value })
      continue
    }
    groups.set(value.attemptId, [...(groups.get(value.attemptId) || []), value])
  }
  const evidence: FinalReviewEvidenceCandidate[] = []
  for (const [attemptId, group] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const distinct = new Map(group.map((value) => [stableSerialize(value), value]))
    if (distinct.size !== 1) {
      report.quarantined.push({ code: 'conflicting-final-review-evidence', message: `Final Test Review attempt ${attemptId} has conflicting raw payloads.`, collection: 'finalReviewEvidence', recordId: attemptId, raw: group })
      continue
    }
    const rawEvidence = [...distinct.values()][0]
    const parsed = parseFinalReviewEvidence(rawEvidence)
    if (!parsed || !occurrenceIds.has(parsed.occurrenceId)) {
      report.quarantined.push({ code: 'malformed-final-review-evidence', message: 'Final Test Review evidence is malformed or references an unknown occurrence.', collection: 'finalReviewEvidence', recordId: attemptId, raw: rawEvidence })
      continue
    }
    evidence.push(parsed)
  }
  return evidence
}

function crossSourceAttemptConflicts(
  legacyResults: readonly unknown[],
  explicitEvidence: readonly unknown[],
  trustedDatasetIds: ReadonlySet<string>,
  occurrenceByProvenance: ReadonlyMap<string, MasteryOccurrence>,
  assignmentsByOccurrence: ReadonlyMap<string, MasteryLifecycleAssignment>,
  report: AdaptiveWarmupMigrationReport,
) {
  const legacyById = new Map<string, unknown[]>()
  for (const value of legacyResults) {
    if (!isRecord(value) || !nonEmptyString(value.id)) continue
    legacyById.set(value.id, [...(legacyById.get(value.id) || []), value])
  }
  const explicitById = new Map<string, unknown[]>()
  for (const value of explicitEvidence) {
    if (!isRecord(value) || !nonEmptyString(value.attemptId)) continue
    explicitById.set(value.attemptId, [...(explicitById.get(value.attemptId) || []), value])
  }
  const conflicts = new Set<string>()
  for (const attemptId of [...legacyById.keys()].filter((id) => explicitById.has(id)).sort()) {
    const rawLegacy = legacyById.get(attemptId) || []
    const rawExplicit = explicitById.get(attemptId) || []
    const normalized: FinalReviewEvidenceCandidate[] = []
    let malformed = false
    for (const value of rawLegacy) {
      if (!isRecord(value)
        || value.phase !== 'test-review'
        || value.scored !== true
        || value.completeSourceDatasetReviewed !== true
        || !nonEmptyString(value.id)
        || !nonEmptyString(value.childId)
        || !nonEmptyString(value.datasetId)
        || !nonEmptyString(value.wordId)
        || typeof value.correct !== 'boolean'
        || !validTimestamp(value.completedAt)
        || !trustedDatasetIds.has(value.datasetId)) {
        malformed = true
        continue
      }
      const occurrence = occurrenceByProvenance.get(`${value.datasetId}\u0000${value.wordId}`)
      const assignment = occurrence ? assignmentsByOccurrence.get(occurrence.occurrenceId) : undefined
      if (!occurrence || occurrence.grade !== 'Grade 2' || !assignment || assignment.status !== 'resolved' || assignment.finalTestReviewCycle !== 1) {
        malformed = true
        continue
      }
      normalized.push({
        attemptId: value.id,
        childId: value.childId,
        occurrenceId: occurrence.occurrenceId,
        reviewCycle: assignment.finalTestReviewCycle,
        reviewedAt: value.completedAt,
        status: 'completed',
        correct: value.correct,
      })
    }
    for (const value of rawExplicit) {
      const parsed = parseFinalReviewEvidence(value)
      if (!parsed) malformed = true
      else normalized.push(parsed)
    }
    const signatures = new Set(normalized.map((value) => stableSerialize(value)))
    if (!malformed && signatures.size === 1) continue
    conflicts.add(attemptId)
    report.quarantined.push({
      code: 'conflicting-final-review-evidence',
      message: `Attempt ${attemptId} has conflicting or malformed payloads across legacy and explicit evidence sources; the complete ID is quarantined before filtering.`,
      collection: 'finalReviewEvidence',
      recordId: attemptId,
      raw: [...rawLegacy, ...rawExplicit],
    })
  }
  return conflicts
}

function canonicalRawResults(results: readonly unknown[], report: AdaptiveWarmupMigrationReport) {
  const grouped = new Map<string, unknown[]>()
  for (const value of [...results].sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)))) {
    if (!isRecord(value) || !nonEmptyString(value.id)) continue
    grouped.set(value.id, [...(grouped.get(value.id) || []), value])
  }
  const canonical: unknown[] = results.filter((value) => !isRecord(value) || !nonEmptyString(value.id))
  for (const [attemptId, group] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const distinct = new Map(group.map((value) => [stableSerialize(value), value]))
    if (distinct.size !== 1) {
      const finalReview = group.some((value) => isRecord(value) && value.phase === 'test-review')
      report.quarantined.push({
        code: finalReview ? 'conflicting-final-review-evidence' : 'conflicting-warmup-evidence',
        message: `Legacy attempt ${attemptId} has conflicting raw payloads.`,
        collection: 'results',
        recordId: attemptId,
        raw: group,
      })
      continue
    }
    canonical.push([...distinct.values()][0])
  }
  return canonical.sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)))
}

function canonicalWarmupResults(results: readonly unknown[], report: AdaptiveWarmupMigrationReport) {
  const canonical: JsonRecord[] = []
  for (const value of results) {
    if (!isRecord(value) || value.phase !== 'warmup' || value.scored !== true) continue
    const attemptId = nonEmptyString(value.id) ? value.id : undefined
    if (!attemptId) {
      report.quarantined.push({ code: 'malformed-warmup-evidence', message: 'A scored legacy Warmup attempt has no stable attempt ID.', collection: 'results', raw: value })
      continue
    }
    if (!isRecord(value)
      || !nonEmptyString(value.childId)
      || !nonEmptyString(value.datasetId)
      || !nonEmptyString(value.wordId)
      || typeof value.correct !== 'boolean'
      || !validTimestamp(value.completedAt)) {
      report.quarantined.push({ code: 'malformed-warmup-evidence', message: `Legacy Warmup attempt ${attemptId} is malformed.`, collection: 'results', recordId: attemptId, raw: value })
      continue
    }
    canonical.push(value)
  }
  return canonical
}

function latestWarmupResult(results: readonly JsonRecord[], state: LegacyChildWordState) {
  const ordered = results.filter((value): value is JsonRecord => isRecord(value)
    && value.childId === state.childId
    && value.datasetId === state.datasetId
    && value.wordId === state.wordId
    && value.phase === 'warmup'
    && value.scored === true
    && typeof value.correct === 'boolean'
    && nonEmptyString(value.id)
    && validTimestamp(value.completedAt))
    .sort((left, right) => Date.parse(String(left.completedAt)) - Date.parse(String(right.completedAt)) || String(left.id).localeCompare(String(right.id)))
  return ordered[ordered.length - 1]
}

function latestTimestamp(values: Array<string | undefined>) {
  const ordered = values.filter((value): value is string => validTimestamp(value))
    .sort((left, right) => Date.parse(left) - Date.parse(right) || left.localeCompare(right))
  return ordered[ordered.length - 1]
}

function emptyReport(sourceVersion: number | null): AdaptiveWarmupMigrationReport {
  return { sourceVersion, targetVersion: 3, migratedTermCount: 0, migratedChildStateCount: 0, migratedOccurrenceCount: 0, activeOccurrenceCount: 0, preservedLegacyMonthlyScoreCount: 0, deferredRecordCount: 0, quarantined: [] }
}

function fatal(raw: unknown, sourceVersion: number | null, code: AdaptiveWarmupMigrationIssueCode, message: string): AdaptiveWarmupMigrationResult {
  const report = emptyReport(sourceVersion)
  report.quarantined.push({ code, message, raw })
  return { status: 'failed', state: raw, report }
}

function datasetLifecycleMap(values: readonly MasteryDatasetLifecycleAssignment[], issues: AdaptiveWarmupMigrationIssue[]) {
  const grouped = new Map<string, unknown[]>()
  for (const value of [...values].sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)))) {
    const key = isRecord(value) && nonEmptyString(value.datasetId) ? value.datasetId : `invalid:${stableSerialize(value)}`
    grouped.set(key, [...(grouped.get(key) || []), value])
  }
  const resolved = new Map<string, MasteryDatasetLifecycleAssignment>()
  const invalid = new Map<string, 'invalid' | 'conflicting'>()
  for (const [datasetId, group] of grouped) {
    if (datasetId.startsWith('invalid:') || !group.every(validDatasetLifecycle)) {
      issues.push({ code: 'invalid-lifecycle-assignment', message: `Lifecycle assignment ${datasetId} is invalid.`, collection: 'lifecycleAssignments', recordId: datasetId, raw: group })
      if (!datasetId.startsWith('invalid:')) invalid.set(datasetId, 'invalid')
      continue
    }
    const distinct = new Map(group.map((value) => [stableSerialize(value), value as MasteryDatasetLifecycleAssignment]))
    if (distinct.size !== 1) {
      issues.push({ code: 'conflicting-lifecycle-assignment', message: `Dataset ${datasetId} has conflicting lifecycle assignments.`, collection: 'lifecycleAssignments', recordId: datasetId, raw: group })
      invalid.set(datasetId, 'conflicting')
      continue
    }
    resolved.set(datasetId, [...distinct.values()][0])
  }
  return { resolved, invalid }
}

function buildCanonicalOccurrences(rawDatasets: readonly unknown[], options: AdaptiveWarmupMigrationOptions, report: AdaptiveWarmupMigrationReport) {
  const idFactory = options.masteryTermIdFactory || deterministicMasteryTermId
  const trustedDatasetIds = new Set(options.trustedGrade2Tier1DatasetIds || [])
  const datasetGroups = new Map<string, unknown[]>()
  for (const rawDataset of [...rawDatasets].sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)))) {
    if (!isRecord(rawDataset) || !nonEmptyString(rawDataset.id)) {
      report.quarantined.push({ code: 'malformed-dataset', message: 'A canonical dataset is malformed or has no identity.', collection: 'datasets', raw: rawDataset })
      continue
    }
    datasetGroups.set(rawDataset.id, [...(datasetGroups.get(rawDataset.id) || []), rawDataset])
  }
  const canonicalDatasets: JsonRecord[] = []
  for (const [datasetId, group] of [...datasetGroups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const distinct = new Map(group.map((value) => [canonicalDatasetValue(value as JsonRecord), value as JsonRecord]))
    if (distinct.size !== 1) {
      report.quarantined.push({ code: 'conflicting-duplicate-dataset', message: `Dataset ${datasetId} has conflicting canonical definitions.`, collection: 'datasets', recordId: datasetId, raw: group })
      continue
    }
    const dataset = [...distinct.values()][0]
    if (!nonEmptyString(dataset.grade) || !nonEmptyString(dataset.schoolYear) || !Array.isArray(dataset.words)) {
      report.quarantined.push({ code: 'malformed-dataset', message: `Dataset ${datasetId} lacks grade, school year, or words.`, collection: 'datasets', recordId: datasetId, raw: dataset })
      continue
    }
    canonicalDatasets.push(dataset)
  }

  const candidates: OccurrenceCandidate[] = []
  for (const dataset of canonicalDatasets.sort((left, right) => String(left.id).localeCompare(String(right.id)))) {
    const wordGroups = new Map<string, unknown[]>()
    for (const rawWord of [...(dataset.words as unknown[])].sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)))) {
      if (!isRecord(rawWord) || !nonEmptyString(rawWord.id)) {
        report.quarantined.push({ code: 'malformed-word', message: `Dataset ${dataset.id} contains a malformed word.`, collection: 'words', recordId: String(dataset.id), raw: rawWord })
        continue
      }
      wordGroups.set(rawWord.id, [...(wordGroups.get(rawWord.id) || []), rawWord])
    }
    for (const [wordId, group] of [...wordGroups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const distinct = new Map(group.map((value) => [stableSerialize(value), value as JsonRecord]))
      if (distinct.size !== 1) {
        report.quarantined.push({ code: 'conflicting-duplicate-word', message: `Word ${wordId} has conflicting definitions in dataset ${dataset.id}.`, collection: 'words', recordId: wordId, raw: group })
        continue
      }
      const word = [...distinct.values()][0]
      if (!nonEmptyString(word.text)) {
        report.quarantined.push({ code: 'malformed-word', message: `Word ${wordId} has no display text.`, collection: 'words', recordId: wordId, raw: word })
        continue
      }
      if (word.datasetId !== dataset.id) {
        report.quarantined.push({ code: 'word-dataset-mismatch', message: `Word ${wordId} does not point back to dataset ${dataset.id}.`, collection: 'words', recordId: wordId, raw: word })
        continue
      }
      const metadata = resolveMetadata(dataset, word, trustedDatasetIds)
      if (!metadata.metadata) {
        report.quarantined.push({ code: metadata.code || 'unresolved-mastery-metadata', message: metadata.message || 'Mastery metadata is unresolved.', collection: 'words', recordId: wordId, raw: word })
        continue
      }
      const occurrence = createMasteryOccurrence({
        occurrenceId: wordId,
        wordId,
        datasetId: String(dataset.id),
        grade: String(dataset.grade),
        schoolYear: String(dataset.schoolYear),
        text: word.text,
        activityModule: metadata.metadata.activityModule,
        tier: metadata.metadata.tier,
        language: metadata.metadata.language,
      }, idFactory)
      const curriculumOrder = [
        String(dataset.schoolYear),
        nonEmptyString(dataset.startDate) ? dataset.startDate : '',
        nonEmptyString(dataset.endDate) ? dataset.endDate : '',
        String(dataset.id),
        wordId,
      ].join('\u0000')
      const eligibleDate = nonEmptyString(dataset.endDate) ? dataset.endDate : nonEmptyString(dataset.startDate) ? dataset.startDate : undefined
      candidates.push({
        occurrence,
        datasetId: occurrence.datasetId,
        wordId,
        curriculumOrder,
        ...(eligibleDate && Number.isFinite(Date.parse(`${eligibleDate}T00:00:00.000Z`)) ? { eligibleAt: `${eligibleDate}T00:00:00.000Z` } : {}),
      })
    }
  }

  const globallyUnique: OccurrenceCandidate[] = []
  const occurrenceGroups = new Map<string, OccurrenceCandidate[]>()
  for (const candidate of candidates) occurrenceGroups.set(candidate.occurrence.occurrenceId, [...(occurrenceGroups.get(candidate.occurrence.occurrenceId) || []), candidate])
  for (const [occurrenceId, group] of [...occurrenceGroups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (!group.every((candidate) => masteryOccurrencesEqual(group[0].occurrence, candidate.occurrence))) {
      report.quarantined.push({ code: 'global-occurrence-id-collision', message: `Occurrence ${occurrenceId} is reused with conflicting immutable provenance.`, collection: 'words', recordId: occurrenceId, raw: group.map((item) => item.occurrence) })
      continue
    }
    globallyUnique.push(group[0])
  }

  const termGroups = new Map<string, OccurrenceCandidate[]>()
  for (const candidate of globallyUnique) termGroups.set(candidate.occurrence.masteryTermId, [...(termGroups.get(candidate.occurrence.masteryTermId) || []), candidate])
  const terms: MasteryTermDefinition[] = []
  const acceptedOccurrences: OccurrenceCandidate[] = []
  for (const [termId, group] of [...termGroups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (!group.every((candidate) => masteryIdentitiesEqual(group[0].occurrence.identity, candidate.occurrence.identity))) {
      report.quarantined.push({ code: 'mastery-id-collision', message: `Mastery term ${termId} resolves to conflicting identity tuples.`, collection: 'words', recordId: termId, raw: group.map((item) => item.occurrence) })
      continue
    }
    let term: MasteryTermDefinition | undefined
    for (const candidate of group.sort((left, right) => left.occurrence.occurrenceId.localeCompare(right.occurrence.occurrenceId))) {
      const result = upsertMasteryOccurrence(term, candidate.occurrence)
      if (result.status === 'collision') {
        report.quarantined.push({ code: result.code, message: result.message, collection: 'words', recordId: candidate.occurrence.occurrenceId, raw: candidate.occurrence })
        continue
      }
      term = result.term
      acceptedOccurrences.push(candidate)
    }
    if (term) terms.push({ ...term, occurrences: [...term.occurrences].sort((left, right) => left.occurrenceId.localeCompare(right.occurrenceId)) })
  }
  return { terms: terms.sort((left, right) => left.id.localeCompare(right.id)), occurrences: acceptedOccurrences.sort((left, right) => left.occurrence.occurrenceId.localeCompare(right.occurrence.occurrenceId)) }
}

function lifecycleForOccurrences(occurrences: readonly OccurrenceCandidate[], options: AdaptiveWarmupMigrationOptions, report: AdaptiveWarmupMigrationReport) {
  const configured = datasetLifecycleMap(options.lifecycleAssignments || [], report.quarantined)
  const reportedMissing = new Set<string>()
  return occurrences.map(({ occurrence, datasetId }): MasteryLifecycleAssignment => {
    const assignment = configured.resolved.get(datasetId)
    if (assignment) return { occurrenceId: occurrence.occurrenceId, status: 'resolved', profileId: assignment.profileId, stage: assignment.stage, finalTestReviewCycle: assignment.finalTestReviewCycle }
    const invalidReason = configured.invalid.get(datasetId)
    if (!invalidReason && !reportedMissing.has(datasetId)) {
      report.quarantined.push({ code: 'unresolved-lifecycle-assignment', message: `Dataset ${datasetId} has no authoritative lifecycle assignment; its terms remain suppressed.`, collection: 'lifecycleAssignments', recordId: datasetId })
      reportedMissing.add(datasetId)
    }
    return { occurrenceId: occurrence.occurrenceId, status: 'unresolved', reason: invalidReason || 'missing' }
  }).sort((left, right) => left.occurrenceId.localeCompare(right.occurrenceId))
}

function trustedFinalReviewEvidence(rawResults: readonly unknown[], trustedDatasetIds: ReadonlySet<string>, occurrenceByProvenance: ReadonlyMap<string, MasteryOccurrence>, assignmentsByOccurrence: ReadonlyMap<string, MasteryLifecycleAssignment>, report: AdaptiveWarmupMigrationReport) {
  const evidence: FinalReviewEvidenceCandidate[] = []
  for (const value of rawResults) {
    if (!isRecord(value) || value.phase !== 'test-review' || !trustedDatasetIds.has(String(value.datasetId))) continue
    const occurrence = occurrenceByProvenance.get(`${value.datasetId}\u0000${value.wordId}`)
    const assignment = occurrence ? assignmentsByOccurrence.get(occurrence.occurrenceId) : undefined
    if (!occurrence || !assignment || assignment.status !== 'resolved') continue
    if (occurrence.grade !== 'Grade 2' || assignment.finalTestReviewCycle !== 1) {
      report.quarantined.push({ code: 'malformed-final-review-evidence', message: 'Legacy test-review results can be treated as final evidence only for explicitly trusted single-review Grade 2 datasets.', collection: 'results', recordId: nonEmptyString(value.id) ? value.id : undefined, raw: value })
      continue
    }
    if (value.scored !== true || value.completeSourceDatasetReviewed !== true) continue
    if (typeof value.correct !== 'boolean' || !nonEmptyString(value.id) || !nonEmptyString(value.childId) || !validTimestamp(value.completedAt)) {
      report.quarantined.push({ code: 'malformed-final-review-evidence', message: 'A trusted completed legacy Test Review result is malformed.', collection: 'results', recordId: nonEmptyString(value.id) ? value.id : undefined, raw: value })
      continue
    }
    evidence.push({ attemptId: value.id, childId: value.childId, occurrenceId: occurrence.occurrenceId, reviewCycle: assignment.finalTestReviewCycle, reviewedAt: value.completedAt, status: 'completed', correct: value.correct })
  }
  return evidence
}

export function migrateAdaptiveWarmupStateV2ToV3(raw: unknown, options?: AdaptiveWarmupMigrationOptions): AdaptiveWarmupMigrationResult {
  if (!isRecord(raw)) return fatal(raw, null, 'invalid-top-level-state', 'The stored application state is not an object.')
  const sourceVersion = typeof raw.version === 'number' ? raw.version : null
  if (!options || !options.profileRegistry) {
    return fatal(raw, sourceVersion, 'invalid-adaptive-profile-registry', 'Adaptive Warmup migration and validation require an explicit profile registry.')
  }
  const profileValidation = validateAdaptiveWarmupProfileRegistry(options.profileRegistry)
  if (!profileValidation.valid) {
    return fatal(raw, sourceVersion, 'invalid-adaptive-profile-registry', `The Adaptive Warmup profile registry is invalid: ${profileValidation.errors.join(' ')}`)
  }
  if (raw.version === 3) {
    const validation = validateAdaptiveWarmupV3Projection(raw.adaptiveWarmup, { idFactory: options.masteryTermIdFactory, profileRegistry: options.profileRegistry })
    if (!validation.valid || !isRecord(raw.adaptiveWarmup) || !isRecord(raw.adaptiveWarmup.migrationReport)) {
      return fatal(raw, 3, 'invalid-v3-projection', `Stored Adaptive Warmup version 3 state is invalid: ${validation.errors.join(' ')}`)
    }
    if (raw.adaptiveWarmup.migrationStatus === 'partial') {
      const retrySource: JsonRecord = { ...raw, version: 2 }
      delete retrySource.adaptiveWarmup
      return migrateAdaptiveWarmupStateV2ToV3(retrySource, options)
    }
    return { status: 'already-migrated', state: raw, report: raw.adaptiveWarmup.migrationReport as unknown as AdaptiveWarmupMigrationReport }
  }
  if (raw.version !== 2) return fatal(raw, sourceVersion, 'unsupported-source-version', 'Only raw state version 2 can be projected into Adaptive Warmup state version 3.')
  if (!Array.isArray(raw.datasets) || !Array.isArray(raw.results) || ('childWordStates' in raw && !Array.isArray(raw.childWordStates))) {
    return fatal(raw, 2, 'invalid-top-level-collection', 'Version 2 datasets and results must be arrays; childWordStates must be absent or an array.')
  }

  const report = emptyReport(2)
  const deferredRecords: AdaptiveWarmupDeferredRecord[] = []
  const childWordStates = Array.isArray(raw.childWordStates) ? raw.childWordStates : []
  const inventory = buildCanonicalOccurrences(raw.datasets, options, report)
  const lifecycleAssignments = lifecycleForOccurrences(inventory.occurrences, options, report)
  const assignmentsByOccurrence = new Map(lifecycleAssignments.map((assignment) => [assignment.occurrenceId, assignment]))
  const occurrenceByProvenance = new Map(inventory.occurrences.map((candidate) => [`${candidate.datasetId}\u0000${candidate.wordId}`, candidate.occurrence]))
  const occurrenceById = new Map(inventory.occurrences.map((candidate) => [candidate.occurrence.occurrenceId, candidate.occurrence]))
  const termsById = new Map(inventory.terms.map((term) => [term.id, term]))
  const crossSourceConflicts = crossSourceAttemptConflicts(
    raw.results,
    options.finalReviewEvidence || [],
    new Set(options.trustedLegacyFinalReviewDatasetIds || []),
    occurrenceByProvenance,
    assignmentsByOccurrence,
    report,
  )
  const canonicalResults = canonicalRawResults(raw.results.filter((value) => !isRecord(value) || !nonEmptyString(value.id) || !crossSourceConflicts.has(value.id)), report)
  const warmupResults = canonicalWarmupResults(canonicalResults, report)

  const finalEvidence = canonicalExplicitFinalReviewEvidence(
    (options.finalReviewEvidence || []).filter((value) => !isRecord(value) || !nonEmptyString(value.attemptId) || !crossSourceConflicts.has(value.attemptId)),
    new Set(occurrenceById.keys()),
    report,
  )
  finalEvidence.push(...trustedFinalReviewEvidence(canonicalResults, new Set(options.trustedLegacyFinalReviewDatasetIds || []), occurrenceByProvenance, assignmentsByOccurrence, report))
  const evidenceByAttemptId = new Map<string, FinalReviewEvidenceCandidate[]>()
  for (const evidence of finalEvidence) evidenceByAttemptId.set(evidence.attemptId, [...(evidenceByAttemptId.get(evidence.attemptId) || []), evidence])
  const deduplicatedFinalEvidence: FinalReviewEvidenceCandidate[] = []
  for (const [attemptId, group] of [...evidenceByAttemptId.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const distinct = new Map(group.map((evidence) => [stableSerialize(evidence), evidence]))
    if (distinct.size !== 1) {
      report.quarantined.push({ code: 'conflicting-final-review-evidence', message: `Final Test Review attempt ${attemptId} has conflicting payloads.`, collection: 'finalReviewEvidence', recordId: attemptId, raw: group })
      continue
    }
    deduplicatedFinalEvidence.push([...distinct.values()][0])
  }
  deduplicatedFinalEvidence.sort((left, right) => left.childId.localeCompare(right.childId) || left.occurrenceId.localeCompare(right.occurrenceId) || Date.parse(left.reviewedAt) - Date.parse(right.reviewedAt) || left.attemptId.localeCompare(right.attemptId))

  const legacyCycles = isRecord(raw.rotationCycles) ? raw.rotationCycles : {}
  const legacyCycleByChildModule = new Map<string, number>()
  const resolvedLegacy: Array<{ sourceRecordId: string; legacy: LegacyChildWordState; occurrence: MasteryOccurrence; profile: AdaptiveWarmupProfile; curriculumOrder: string }> = []
  for (const value of [...childWordStates].sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)))) {
    const legacy = parseLegacyState(value)
    const recordId = isRecord(value) && nonEmptyString(value.id) ? value.id : undefined
    if (!legacy) {
      report.quarantined.push({ code: 'malformed-child-word-state', message: 'The legacy child word state is malformed.', collection: 'childWordStates', recordId, raw: value })
      continue
    }
    const occurrence = occurrenceByProvenance.get(`${legacy.datasetId}\u0000${legacy.wordId}`)
    if (!occurrence) {
      const datasetKnown = inventory.occurrences.some((candidate) => candidate.datasetId === legacy.datasetId)
      report.quarantined.push({ code: datasetKnown ? 'unresolved-word' : 'unresolved-dataset', message: `${datasetKnown ? `Word ${legacy.wordId}` : `Dataset ${legacy.datasetId}`} is unavailable; the orphaned legacy record remains untouched.`, collection: 'childWordStates', recordId, raw: value })
      continue
    }
    const assignment = assignmentsByOccurrence.get(occurrence.occurrenceId)
    if (!assignment || !isOccurrenceMasteryEligible(occurrence, assignment)) continue
    const profile = profileForOccurrence(occurrence, options.profileRegistry)
    if (!profile) {
      deferredRecords.push({
        id: `deferred-child-state::${legacy.childId}::${occurrence.occurrenceId}`,
        reason: 'missing-profile',
        collection: 'childWordStates',
        childId: legacy.childId,
        occurrenceId: occurrence.occurrenceId,
        grade: occurrence.grade,
        activityModule: occurrence.identity.activityModule,
        rawFingerprint: stableSerialize(value),
        raw: value,
      })
      continue
    }
    const moduleKey = `${legacy.childId}\u0000${occurrence.identity.activityModule}`
    if (legacy.randomCycleId !== undefined) {
      legacyCycleByChildModule.set(moduleKey, Math.max(legacyCycleByChildModule.get(moduleKey) || 1, legacy.randomCycleId))
    }
    const candidate = inventory.occurrences.find((entry) => entry.occurrence.occurrenceId === occurrence.occurrenceId)
    resolvedLegacy.push({
      sourceRecordId: recordId || `legacy-state::${legacy.childId}::${occurrence.occurrenceId}`,
      legacy,
      occurrence,
      profile,
      curriculumOrder: candidate?.curriculumOrder || occurrence.occurrenceId,
    })
  }

  const rotationCycleFor = (childId: string, activityModule: string) => {
    const cycleValue = legacyCycles[childId]
    const storedCycle = Number.isInteger(cycleValue) && Number(cycleValue) > 0 ? Number(cycleValue) : 1
    return Math.max(storedCycle, legacyCycleByChildModule.get(`${childId}\u0000${activityModule}`) || 1)
  }

  const legacySnapshots: LegacyMasterySnapshot[] = resolvedLegacy.map(({ sourceRecordId, legacy, occurrence, profile, curriculumOrder }) => {
    const assignment = assignmentsByOccurrence.get(occurrence.occurrenceId)
    const selectedFinal = assignment ? selectLatestFinalReviewEvidence(occurrence, assignment, legacy.childId, deduplicatedFinalEvidence) : undefined
    const latestWarmup = selectedFinal ? undefined : latestWarmupResult(warmupResults, legacy)
    const latestWarmupAt = latestWarmup && validTimestamp(latestWarmup.completedAt) ? latestWarmup.completedAt : undefined
    const reliableIncorrect = latestWarmup?.correct === false
    const reliableSnapshotCorrect = legacy.correctStreak > 0 && validTimestamp(legacy.lastReviewedAt)
    const legacyBucket: WarmupSchedulingBucket = legacy.category === 'errored-word'
      ? 'needs-attention'
      : legacy.category === 'random-rotation' ? 'mastery-rotation' : 'recent-entry'
    const bucket: WarmupSchedulingBucket = reliableIncorrect ? 'needs-attention' : legacyBucket
    const evidence: ChildMasteryState['evidence'] = bucket === 'needs-attention'
      ? 'support-needed'
      : latestWarmup?.correct === true || reliableSnapshotCorrect ? 'demonstrated' : 'unassessed'
    const currentCycle = rotationCycleFor(legacy.childId, occurrence.identity.activityModule)
    return {
      sourceRecordId,
      childId: legacy.childId,
      occurrence,
      profile,
      curriculumOrder,
      evidence,
      bucket,
      consecutiveCorrect: reliableIncorrect || legacy.category === 'acquisition' ? 0 : legacy.correctStreak,
      reliableIncorrect,
      ...(bucket === 'mastery-rotation' ? { rotationEligibleFromCycle: legacy.randomCycleId || currentCycle } : {}),
      ...(bucket === 'mastery-rotation' && legacy.randomCycleReviewed ? { lastConsumedRotationCycle: legacy.randomCycleId || currentCycle } : {}),
      ...(legacy.lastReviewedAt ? { checkpointThrough: legacy.lastReviewedAt } : {}),
      ...(latestTimestamp([legacy.lastReviewedAt, latestWarmupAt]) ? { lastReviewedAt: latestTimestamp([legacy.lastReviewedAt, latestWarmupAt]) } : {}),
      ...(latestTimestamp([legacy.lastIncorrectAt, reliableIncorrect ? latestWarmupAt : undefined]) ? { lastIncorrectAt: latestTimestamp([legacy.lastIncorrectAt, reliableIncorrect ? latestWarmupAt : undefined]) } : {}),
    }
  })

  const warmupAttempts: WarmupReplayAttempt[] = warmupResults.flatMap((result) => {
    const occurrence = occurrenceByProvenance.get(`${result.datasetId}\u0000${result.wordId}`)
    if (!occurrence) {
      report.quarantined.push({
        code: 'unresolved-word',
        message: `Warmup attempt ${String(result.id)} references unavailable curriculum provenance.`,
        collection: 'results',
        recordId: nonEmptyString(result.id) ? result.id : undefined,
        raw: result,
      })
      return []
    }
    if (!nonEmptyString(result.id) || !nonEmptyString(result.childId) || !validTimestamp(result.completedAt) || typeof result.correct !== 'boolean') return []
    return [{
      attemptId: result.id,
      childId: result.childId,
      occurrenceId: occurrence.occurrenceId,
      reviewedAt: result.completedAt,
      correct: result.correct,
      payloadFingerprint: stableSerialize({
        attemptId: result.id,
        childId: result.childId,
        occurrenceId: occurrence.occurrenceId,
        reviewedAt: result.completedAt,
        correct: result.correct,
        phase: 'warmup',
      }),
    }]
  }).sort((left, right) => Date.parse(left.reviewedAt) - Date.parse(right.reviewedAt) || left.attemptId.localeCompare(right.attemptId))

  for (const attempt of warmupAttempts) {
    const occurrence = occurrenceById.get(attempt.occurrenceId)
    if (!occurrence || profileForOccurrence(occurrence, options.profileRegistry)) continue
    deferredRecords.push({
      id: `deferred-warmup-evidence::${attempt.childId}::${attempt.attemptId}`,
      reason: 'missing-profile',
      collection: 'results',
      childId: attempt.childId,
      occurrenceId: occurrence.occurrenceId,
      grade: occurrence.grade,
      activityModule: occurrence.identity.activityModule,
      rawFingerprint: attempt.payloadFingerprint,
      raw: attempt,
    })
  }

  const replayOccurrences: ReplayOccurrence[] = inventory.occurrences.flatMap((candidate) => {
    const assignment = assignmentsByOccurrence.get(candidate.occurrence.occurrenceId)
    const profile = profileForOccurrence(candidate.occurrence, options.profileRegistry)
    return assignment && profile ? [{
      occurrence: candidate.occurrence,
      assignment,
      profile,
      curriculumOrder: candidate.curriculumOrder,
      ...(candidate.eligibleAt ? { eligibleAt: candidate.eligibleAt } : {}),
    }] : []
  })
  for (const evidence of deduplicatedFinalEvidence) {
    const occurrence = occurrenceById.get(evidence.occurrenceId)
    if (!occurrence || profileForOccurrence(occurrence, options.profileRegistry)) continue
    deferredRecords.push({
      id: `deferred-final-evidence::${evidence.childId}::${evidence.attemptId}`,
      reason: 'missing-profile',
      collection: 'finalReviewEvidence',
      childId: evidence.childId,
      occurrenceId: occurrence.occurrenceId,
      grade: occurrence.grade,
      activityModule: occurrence.identity.activityModule,
      rawFingerprint: stableSerialize(evidence),
      raw: evidence,
    })
  }
  const childStates = reconstructChildMasteryStates({
    terms: inventory.terms,
    occurrences: replayOccurrences,
    legacySnapshots,
    finalReviewEvidence: deduplicatedFinalEvidence,
    warmupAttempts,
    rotationCycleFor,
  })
  const moduleKeys = new Set(childStates.map((state) => `${state.childId}\u0000${termsById.get(state.masteryTermId)?.identity.activityModule || ''}`))
  const rotationStates = [...moduleKeys].filter((key) => !key.endsWith('\u0000')).map((key): MasteryRotationState => {
    const separator = key.indexOf('\u0000')
    const childId = key.slice(0, separator)
    const activityModule = key.slice(separator + 1)
    const cycle = rotationCycleFor(childId, activityModule)
    return { version: 1, id: masteryRotationStateId(childId, activityModule), childId, activityModule, cycle }
  }).sort((left, right) => left.id.localeCompare(right.id))

  const legacyMonthlyRotationScores = Array.isArray(raw.monthlyRotationScores)
    ? [...raw.monthlyRotationScores].sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right))) : []
  report.migratedTermCount = inventory.terms.length
  report.migratedChildStateCount = childStates.length
  report.migratedOccurrenceCount = inventory.occurrences.length
  report.activeOccurrenceCount = lifecycleAssignments.filter((assignment) => assignment.status === 'resolved' && (assignment.stage.kind === 'acquisition' || assignment.stage.kind === 'test-review' || assignment.stage.kind === 'legacy-active')).length
  report.preservedLegacyMonthlyScoreCount = legacyMonthlyRotationScores.length
  report.deferredRecordCount = deferredRecords.length
  report.quarantined = sortIssues(report.quarantined)
  const adaptiveWarmup: AdaptiveWarmupV3Projection = {
    schemaVersion: 3,
    migrationStatus: deferredRecords.length > 0 ? 'partial' : 'complete',
    normalizerVersion: MASTERY_NORMALIZER_VERSION,
    terms: inventory.terms,
    lifecycleAssignments,
    childStates,
    rotationStates,
    legacyMonthlyRotationScores,
    deferredRecords: [...deferredRecords].sort((left, right) => left.id.localeCompare(right.id)),
    migrationReport: report,
  }
  const validation = validateAdaptiveWarmupV3Projection(adaptiveWarmup, { idFactory: options.masteryTermIdFactory, profileRegistry: options.profileRegistry })
  if (!validation.valid) return fatal(raw, 2, 'generated-invalid-v3-projection', `Generated Adaptive Warmup state is invalid: ${validation.errors.join(' ')}`)
  return { status: deferredRecords.length > 0 ? 'partially-migrated' : 'migrated', state: { ...raw, version: 3, adaptiveWarmup }, report }
}
