import type { AppState, Dataset, DatasetLifecycleResolution, WordResult } from '../../domain.ts'
import type {
  AdaptiveWarmupProfileRegistry,
  FinalReviewEvidenceCandidate,
  MasteryDatasetLifecycleAssignment,
  MasteryLifecycleAssignment,
} from '../../warmup/adaptive/contracts.ts'
import { integrateMasteryOccurrenceForChild } from '../../warmup/adaptive/eligibility.ts'
import { createMasteryOccurrence, masteryRotationStateId, upsertMasteryOccurrence } from '../../warmup/adaptive/identity.ts'
import { migrateAdaptiveWarmupStateV2ToV3, type AdaptiveWarmupV3Projection } from '../../warmup/adaptive/migration.ts'
import { grade2Tier1WritingAdaptiveWarmupProfile } from '../../warmup/adaptive/profiles/grade2.ts'
import { activeRegistryForProfiles } from '../../warmup/adaptive/profileValidation.ts'
import { validateAdaptiveWarmupV3Projection } from '../../warmup/adaptive/validation.ts'

export const grade2AdaptiveWarmupRegistry: AdaptiveWarmupProfileRegistry = activeRegistryForProfiles([
  grade2Tier1WritingAdaptiveWarmupProfile,
])

function lifecycleStage(value: DatasetLifecycleResolution['lifecycleByDatasetId'][string]) {
  if (value === 'acquisition') return { kind: 'acquisition' as const }
  if (value === 'test-review') return { kind: 'test-review' as const, cycle: 1 }
  if (value === 'mastered') return { kind: 'mastery' as const }
  if (value === 'no-instruction') return { kind: 'no-instruction' as const }
  return { kind: 'future' as const }
}

export function datasetAssignments(datasets: readonly Dataset[], resolution: DatasetLifecycleResolution): MasteryDatasetLifecycleAssignment[] {
  return datasets.map((dataset) => ({
    datasetId: dataset.id,
    profileId: 'grade-2-replacement-2026-27',
    stage: lifecycleStage(resolution.lifecycleByDatasetId[dataset.id] || 'future'),
    finalTestReviewCycle: 1,
  }))
}

function occurrenceAssignments(datasets: readonly Dataset[], resolution: DatasetLifecycleResolution): MasteryLifecycleAssignment[] {
  const byDataset = new Map(datasetAssignments(datasets, resolution).map((assignment) => [assignment.datasetId, assignment]))
  return datasets.flatMap((dataset) => dataset.words.map((word): MasteryLifecycleAssignment => {
    const assignment = byDataset.get(dataset.id)
    return assignment ? {
      occurrenceId: word.id,
      status: 'resolved',
      profileId: assignment.profileId,
      stage: assignment.stage,
      finalTestReviewCycle: assignment.finalTestReviewCycle,
    } : { occurrenceId: word.id, status: 'unresolved', reason: 'missing' }
  }))
}

export function finalReviewEvidence(results: readonly WordResult[]): FinalReviewEvidenceCandidate[] {
  return results.filter((result) => result.phase === 'test-review').map((result) => ({
    attemptId: result.id,
    childId: result.childId,
    occurrenceId: result.wordId,
    reviewCycle: 1,
    reviewedAt: result.completedAt,
    status: result.completeSourceDatasetReviewed ? 'completed' as const : 'provisional' as const,
    ...(result.completeSourceDatasetReviewed ? { correct: result.correct } : {}),
  }))
}

export function updateProjectionReport(projection: AdaptiveWarmupV3Projection): AdaptiveWarmupV3Projection {
  const occurrenceCount = projection.terms.reduce((total, term) => total + term.occurrences.length, 0)
  const activeCount = projection.lifecycleAssignments.filter((assignment) => assignment.status === 'resolved'
    && ['acquisition', 'test-review', 'legacy-active'].includes(assignment.stage.kind)).length
  return {
    ...projection,
    migrationReport: {
      ...projection.migrationReport,
      migratedTermCount: projection.terms.length,
      migratedChildStateCount: projection.childStates.length,
      migratedOccurrenceCount: occurrenceCount,
      activeOccurrenceCount: activeCount,
      preservedLegacyMonthlyScoreCount: projection.legacyMonthlyRotationScores.length,
      deferredRecordCount: projection.deferredRecords.length,
    },
  }
}

function currentGrade2Occurrence(dataset: Dataset, word: Dataset['words'][number]) {
  return createMasteryOccurrence({
    occurrenceId: word.id,
    wordId: word.id,
    datasetId: dataset.id,
    grade: dataset.grade,
    schoolYear: dataset.schoolYear,
    text: word.text,
    activityModule: 'mandarin-tier1-writing',
    tier: 'tier-1',
    language: 'mandarin',
  })
}

function syncCurriculum(
  projection: AdaptiveWarmupV3Projection,
  datasets: readonly Dataset[],
  resolution: DatasetLifecycleResolution,
) {
  const terms = new Map(projection.terms.map((term) => [term.id, term]))
  for (const dataset of [...datasets].sort((left, right) => left.startDate.localeCompare(right.startDate) || left.id.localeCompare(right.id))) {
    for (const word of dataset.words) {
      const occurrence = currentGrade2Occurrence(dataset, word)
      const upserted = upsertMasteryOccurrence(terms.get(occurrence.masteryTermId), occurrence)
      if (upserted.status === 'collision') throw new Error(upserted.message)
      terms.set(upserted.term.id, upserted.term)
    }
  }
  const currentAssignments = new Map(occurrenceAssignments(datasets, resolution).map((assignment) => [assignment.occurrenceId, assignment]))
  for (const assignment of projection.lifecycleAssignments) if (!currentAssignments.has(assignment.occurrenceId)) currentAssignments.set(assignment.occurrenceId, assignment)
  return updateProjectionReport({
    ...projection,
    terms: [...terms.values()].sort((left, right) => left.id.localeCompare(right.id)),
    lifecycleAssignments: [...currentAssignments.values()].sort((left, right) => left.occurrenceId.localeCompare(right.occurrenceId)),
  })
}

export function integrateChild(
  projection: AdaptiveWarmupV3Projection,
  childId: string,
  datasets: readonly Dataset[],
  results: readonly WordResult[],
) {
  const assignments = new Map(projection.lifecycleAssignments.map((assignment) => [assignment.occurrenceId, assignment]))
  const evidence = finalReviewEvidence(results)
  const datasetOrder = new Map(datasets.map((dataset) => [dataset.id, `${dataset.schoolYear}\u0000${dataset.startDate}\u0000${dataset.id}`]))
  const occurrences = projection.terms.flatMap((term) => term.occurrences.map((occurrence) => ({ term, occurrence })))
    .sort((left, right) => (datasetOrder.get(left.occurrence.datasetId) || left.occurrence.datasetId)
      .localeCompare(datasetOrder.get(right.occurrence.datasetId) || right.occurrence.datasetId)
      || left.occurrence.occurrenceId.localeCompare(right.occurrence.occurrenceId))
  let childStates = [...projection.childStates]
  for (const { occurrence } of occurrences) {
    if (occurrence.grade !== 'Grade 2' || occurrence.identity.activityModule !== grade2Tier1WritingAdaptiveWarmupProfile.activityModule) continue
    const currentIndex = childStates.findIndex((state) => state.childId === childId && state.masteryTermId === occurrence.masteryTermId)
    const integrated = integrateMasteryOccurrenceForChild({
      childId,
      occurrence,
      profile: grade2Tier1WritingAdaptiveWarmupProfile,
      lifecycleAssignment: assignments.get(occurrence.occurrenceId) || { occurrenceId: occurrence.occurrenceId, status: 'unresolved', reason: 'missing' },
      currentState: currentIndex >= 0 ? childStates[currentIndex] : null,
      finalReviewEvidence: evidence,
    })
    if (!integrated.state) continue
    childStates = currentIndex >= 0
      ? childStates.map((state, index) => index === currentIndex ? integrated.state! : state)
      : [...childStates, integrated.state]
  }
  const hasChildModuleState = childStates.some((state) => state.childId === childId
    && projection.terms.find((term) => term.id === state.masteryTermId)?.identity.activityModule === grade2Tier1WritingAdaptiveWarmupProfile.activityModule)
  const rotationId = masteryRotationStateId(childId, grade2Tier1WritingAdaptiveWarmupProfile.activityModule)
  const rotationStates = hasChildModuleState && !projection.rotationStates.some((state) => state.id === rotationId)
    ? [...projection.rotationStates, { version: 1 as const, id: rotationId, childId, activityModule: grade2Tier1WritingAdaptiveWarmupProfile.activityModule, cycle: 1 }]
    : projection.rotationStates
  return updateProjectionReport({ ...projection, childStates: childStates.sort((left, right) => left.id.localeCompare(right.id)), rotationStates: [...rotationStates].sort((left, right) => left.id.localeCompare(right.id)) })
}

export function projectionFromState(
  state: AppState,
  childId: string,
  datasets: readonly Dataset[],
  resolution: DatasetLifecycleResolution,
): { projection?: AdaptiveWarmupV3Projection; reason?: string } {
  let projection = state.adaptiveWarmup
  if (projection) {
    const validation = validateAdaptiveWarmupV3Projection(projection, { profileRegistry: grade2AdaptiveWarmupRegistry })
    if (!validation.valid) return { reason: `Saved Adaptive Warmup state is invalid: ${validation.errors.join(' ')}` }
  } else {
    const migrated = migrateAdaptiveWarmupStateV2ToV3(state, {
      profileRegistry: grade2AdaptiveWarmupRegistry,
      trustedGrade2Tier1DatasetIds: datasets.map((dataset) => dataset.id),
      trustedLegacyFinalReviewDatasetIds: datasets.map((dataset) => dataset.id),
      lifecycleAssignments: datasetAssignments(datasets, resolution),
      finalReviewEvidence: finalReviewEvidence(state.results),
    })
    if (migrated.status === 'failed') return { reason: migrated.report.quarantined.map((issue) => issue.message).join(' ') || 'Adaptive Warmup migration failed.' }
    projection = (migrated.state as { adaptiveWarmup?: AdaptiveWarmupV3Projection }).adaptiveWarmup
    if (!projection) return { reason: 'Adaptive Warmup migration did not produce a projection.' }
  }
  try {
    projection = integrateChild(syncCurriculum(projection, datasets, resolution), childId, datasets, state.results)
  } catch (error) {
    return { reason: error instanceof Error ? error.message : 'Adaptive Warmup curriculum synchronization failed.' }
  }
  const validation = validateAdaptiveWarmupV3Projection(projection, { profileRegistry: grade2AdaptiveWarmupRegistry })
  return validation.valid ? { projection } : { reason: `Adaptive Warmup activation is invalid: ${validation.errors.join(' ')}` }
}
