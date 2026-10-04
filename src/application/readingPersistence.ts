import type { AppState } from '../domain.ts'
import type { Tier2ReadingPracticeSummary, Tier2ReadingProgressRecord } from '../readingPractice/contracts.ts'
import {
  TIER2_READING_PROGRESS_CONTRACT_ID,
  TIER2_READING_PROGRESS_SCHEMA_VERSION,
} from '../readingPractice/contracts.ts'
import type { Tier2ReadingPathway, Tier2ReadingProfile } from '../tier2/contracts.ts'
import { tier2ReadingPathwayTargets } from '../tier2/pathway.ts'

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

const READING_RECORDING_DATA_KEYS = new Set([
  'audio',
  'blob',
  'bytes',
  'dataUrl',
  'dispose',
  'mimeType',
  'recording',
  'recordingUrl',
  'size',
  'url',
])

export function tier2ReadingMetadataOnly(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(tier2ReadingMetadataOnly)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !READING_RECORDING_DATA_KEYS.has(key))
      .map(([key, child]) => [key, tier2ReadingMetadataOnly(child)]),
  )
}

export function tier2ReadingProgressMatchesPathway(
  progress: Tier2ReadingProgressRecord,
  childId: string,
  schoolYear: string,
  profile: Tier2ReadingProfile,
  pathway: Tier2ReadingPathway,
) {
  return (
    progress.childId === childId &&
    progress.schoolYear === schoolYear &&
    progress.grade === profile.grade &&
    progress.profileId === profile.id &&
    progress.profileVersion === profile.version &&
    progress.activityModule === profile.activityModule &&
    progress.pathwayKind === pathway.kind &&
    progress.reviewCycle === pathway.cycle &&
    progress.reviewGroupId === pathway.reviewGroupId &&
    sameStrings(
      progress.cohortIds,
      pathway.cohorts.map((cohort) => cohort.datasetId),
    ) &&
    sameStrings(
      progress.targetOccurrenceIds,
      tier2ReadingPathwayTargets(pathway).map((target) => target.id),
    )
  )
}

export function isTier2ReadingProgressRecord(value: unknown): value is Tier2ReadingProgressRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    record.schemaVersion === TIER2_READING_PROGRESS_SCHEMA_VERSION &&
    record.contractId === TIER2_READING_PROGRESS_CONTRACT_ID &&
    typeof record.id === 'string' &&
    typeof record.childId === 'string' &&
    typeof record.grade === 'string' &&
    typeof record.schoolYear === 'string' &&
    record.activityModule === 'mandarin-tier2-reading' &&
    typeof record.profileId === 'string' &&
    typeof record.profileVersion === 'number' &&
    ['acquisition', 'test-review', 'mastery'].includes(String(record.pathwayKind)) &&
    (!('reviewCycle' in record) ||
      (typeof record.reviewCycle === 'number' && Number.isInteger(record.reviewCycle) && record.reviewCycle > 0)) &&
    (!('reviewGroupId' in record) || typeof record.reviewGroupId === 'string') &&
    Array.isArray(record.cohortIds) &&
    record.cohortIds.length > 0 &&
    record.cohortIds.every((id) => typeof id === 'string') &&
    Array.isArray(record.targetOccurrenceIds) &&
    record.targetOccurrenceIds.length > 0 &&
    record.targetOccurrenceIds.every((id) => typeof id === 'string') &&
    typeof record.revision === 'number' &&
    Number.isInteger(record.revision) &&
    record.revision > 0 &&
    (record.status === 'in-progress' || record.status === 'completed') &&
    Boolean(record.run && typeof record.run === 'object' && !Array.isArray(record.run)) &&
    typeof record.startedAt === 'string' &&
    typeof record.updatedAt === 'string' &&
    (record.status !== 'completed' || (typeof record.completedAt === 'string' && Boolean(record.summary)))
  )
}

export function activeTier2ReadingProgress(
  state: AppState,
  childId: string,
  schoolYear: string,
  profile: Tier2ReadingProfile,
  pathway: Tier2ReadingPathway,
) {
  return (state.tier2ReadingProgressV1 || [])
    .filter(
      (progress) =>
        progress.status === 'in-progress' &&
        tier2ReadingProgressMatchesPathway(progress, childId, schoolYear, profile, pathway),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.revision - left.revision)[0]
}

export function checkpointTier2ReadingProgress(state: AppState, progress: Tier2ReadingProgressRecord): AppState {
  if (!isTier2ReadingProgressRecord(progress)) throw new Error('Tier 2 reading progress failed validation.')
  const records = state.tier2ReadingProgressV1 || []
  const current = records.find((record) => record.id === progress.id)
  if (current && current.childId !== progress.childId)
    throw new Error('Tier 2 reading progress cannot change child ownership.')
  if (current && current.revision > progress.revision) return state
  if (current && current.revision === progress.revision) {
    if (JSON.stringify(current) !== JSON.stringify(progress)) {
      throw new Error('Tier 2 reading progress revision conflicts with different content.')
    }
    return state
  }
  return {
    ...state,
    tier2ReadingProgressV1: current
      ? records.map((record) => (record.id === progress.id ? progress : record))
      : [...records, progress],
  }
}

export function completeTier2ReadingProgress(
  state: AppState,
  progress: Tier2ReadingProgressRecord,
  summary: Tier2ReadingPracticeSummary,
  completedAt: string,
) {
  return checkpointTier2ReadingProgress(state, completedTier2ReadingProgress(progress, summary, completedAt))
}

export function completedTier2ReadingProgress(
  progress: Tier2ReadingProgressRecord,
  summary: Tier2ReadingPracticeSummary,
  completedAt: string,
) {
  if (progress.status === 'completed') return progress
  return {
    ...progress,
    revision: progress.revision + 1,
    status: 'completed' as const,
    summary,
    completedAt,
    updatedAt: completedAt,
  }
}

export function mergeTier2ReadingProgress(
  local: readonly Tier2ReadingProgressRecord[],
  cloud: readonly Tier2ReadingProgressRecord[],
) {
  const merged = new Map<string, Tier2ReadingProgressRecord>()
  for (const candidate of [...local, ...cloud]) {
    if (!isTier2ReadingProgressRecord(candidate)) continue
    const current = merged.get(candidate.id)
    if (!current || candidate.revision > current.revision) {
      merged.set(candidate.id, candidate)
      continue
    }
    if (
      candidate.revision === current.revision &&
      JSON.stringify(tier2ReadingMetadataOnly(candidate)) !== JSON.stringify(tier2ReadingMetadataOnly(current))
    ) {
      throw new Error('Tier 2 reading progress has conflicting content for the same revision.')
    }
  }
  return [...merged.values()].sort(
    (left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id),
  )
}
