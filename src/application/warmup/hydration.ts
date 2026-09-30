import type { AppState, Dataset, DatasetLifecycleResolution } from '../../domain.ts'
import type { MasteryRotationState } from '../../warmup/adaptive/contracts.ts'
import { grade2Tier1WritingAdaptiveWarmupProfile } from '../../warmup/adaptive/profiles/grade2.ts'
import { validateAdaptiveWarmupV3Projection } from '../../warmup/adaptive/validation.ts'
import type { VersionedChildMasteryState, WarmupAttempt, WarmupGraphPoint, WarmupTransitionReceipt, WarmupVisit } from '../../warmup/visits/contracts.ts'
import { graphPointForVisit, validateVersionedChildMasteryState, validateWarmupVisit, warmupAttemptForVisit, warmupReceiptForVisit } from '../../warmup/visits/validation.ts'
import { grade2AdaptiveWarmupRegistry, integrateChild, projectionFromState } from './modelAdapter.ts'

export type CloudWarmupHydrationInput = {
  state: AppState
  childId: string
  grade: string
  schoolYear: string
  datasets: readonly Dataset[]
  lifecycleResolution: DatasetLifecycleResolution
  mastery: readonly VersionedChildMasteryState[]
  visits: readonly WarmupVisit[]
  receipts: readonly WarmupTransitionReceipt[]
  attempts: readonly WarmupAttempt[]
  graphPoints: readonly WarmupGraphPoint[]
  rotations: readonly MasteryRotationState[]
  sourceIssues?: readonly {
    collection: 'visits' | 'queue-entries'
    recordId: string
    reason: string
    raw: unknown
  }[]
  hydratedAt: string
}

export function hydrateAdaptiveWarmupCloud(input: CloudWarmupHydrationInput): AppState {
  if (input.grade !== 'Grade 2') return input.state
  const prepared = projectionFromState(input.state, input.childId, input.datasets, input.lifecycleResolution)
  if (!prepared.projection) throw new Error(prepared.reason || 'Adaptive Warmup could not be activated for cloud hydration.')
  const issues: NonNullable<AppState['warmupCloudQuarantineV1']> = []
  const quarantine = (collection: NonNullable<AppState['warmupCloudQuarantineV1']>[number]['collection'], recordId: string, reason: string, raw: unknown) => {
    issues.push({ id: `warmup-cloud-${collection}-${recordId}`, childId: input.childId, collection, recordId, reason, quarantinedAt: input.hydratedAt, raw })
  }
  for (const issue of input.sourceIssues || []) quarantine(issue.collection, issue.recordId, issue.reason, issue.raw)
  const termsById = new Map(prepared.projection.terms.map((term) => [term.id, term]))
  const masteryGroups = new Map<string, VersionedChildMasteryState[]>()
  input.mastery.forEach((item, index) => {
    const id = item?.state?.id || `unknown-${index}`
    masteryGroups.set(id, [...(masteryGroups.get(id) || []), item])
  })
  const validMastery: VersionedChildMasteryState[] = []
  let projection = prepared.projection
  for (const [id, records] of [...masteryGroups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (records.length !== 1) {
      quarantine('mastery', id, 'The cloud mastery identity is duplicated.', records)
      continue
    }
    const item = records[0]
    const validation = validateVersionedChildMasteryState(item, grade2AdaptiveWarmupRegistry)
    const term = item?.state ? termsById.get(item.state.masteryTermId) : undefined
    if (!validation.valid
      || item.state.childId !== input.childId
      || !term
      || term.identity.activityModule !== grade2Tier1WritingAdaptiveWarmupProfile.activityModule) {
      quarantine('mastery', id, validation.errors.join(' ') || 'The cloud mastery identity is invalid or belongs to another scope.', item)
      continue
    }
    const childStates = projection.childStates.some((state) => state.id === id)
      ? projection.childStates.map((state) => state.id === id ? item.state : state)
      : [...projection.childStates, item.state]
    const candidate = integrateChild({ ...projection, childStates }, input.childId, input.datasets, input.state.results)
    const candidateValidation = validateAdaptiveWarmupV3Projection(candidate, { profileRegistry: grade2AdaptiveWarmupRegistry })
    if (!candidateValidation.valid) {
      quarantine('mastery', id, `The cloud mastery record conflicts with the canonical curriculum graph: ${candidateValidation.errors.join(' ')}`, item)
      continue
    }
    projection = candidate
    validMastery.push({ ...item, state: candidate.childStates.find((state) => state.id === id)! })
  }
  const validRotations = input.rotations.filter((rotation) => {
    const valid = rotation.version === 1 && rotation.childId === input.childId && rotation.activityModule === grade2Tier1WritingAdaptiveWarmupProfile.activityModule && Number.isInteger(rotation.cycle) && rotation.cycle > 0
    if (!valid) quarantine('rotations', rotation.id || 'unknown', 'The cloud rotation state is malformed or belongs to another scope.', rotation)
    return valid
  })
  if (validRotations.length > 1) {
    for (const rotation of validRotations) quarantine('rotations', rotation.id, 'More than one cloud rotation state owns the same module.', rotation)
  } else if (validRotations[0]) {
    const candidate = { ...projection, rotationStates: projection.rotationStates.map((rotation) => rotation.id === validRotations[0].id ? validRotations[0] : rotation) }
    const candidateValidation = validateAdaptiveWarmupV3Projection(candidate, { profileRegistry: grade2AdaptiveWarmupRegistry })
    if (candidateValidation.valid) projection = candidate
    else quarantine('rotations', validRotations[0].id, `The cloud rotation state conflicts with its mastery states: ${candidateValidation.errors.join(' ')}`, validRotations[0])
  }
  projection = integrateChild(projection, input.childId, input.datasets, input.state.results)
  const finalProjectionValidation = validateAdaptiveWarmupV3Projection(projection, { profileRegistry: grade2AdaptiveWarmupRegistry })
  if (!finalProjectionValidation.valid) throw new Error(`Cloud Adaptive Warmup hydration produced an invalid projection: ${finalProjectionValidation.errors.join(' ')}`)
  const validCloudMasteryStateIds = new Set(validMastery.map((item) => item.state.id))
  const seenVisits = new Set<string>()
  const visits = input.visits.filter((visit) => {
    const validation = validateWarmupVisit(visit, grade2AdaptiveWarmupRegistry)
    const queueMatchesProjection = visit.queue.every((entry) => {
      const term = termsById.get(entry.masteryTermId)
      const mastery = projection.childStates.find((state) => state.childId === visit.childId && state.masteryTermId === entry.masteryTermId)
      const occurrenceIds = new Set(term?.occurrences.map((occurrence) => occurrence.occurrenceId) || [])
      const promptWord = input.datasets.find((dataset) => dataset.id === entry.prompt.datasetId)?.words.find((word) => word.id === entry.prompt.wordId)
      const promptOccurrence = term?.occurrences.find((occurrence) => occurrence.datasetId === entry.prompt.datasetId
        && occurrence.wordId === entry.prompt.wordId
        && entry.occurrenceIds.includes(occurrence.occurrenceId))
      return Boolean(term
        && mastery
        && validCloudMasteryStateIds.has(mastery.id)
        && term.identity.activityModule === visit.activityModule
        && term.identity.tier === visit.tier
        && term.identity.language === visit.language
        && entry.occurrenceIds.length > 0
        && entry.occurrenceIds.every((occurrenceId) => occurrenceIds.has(occurrenceId))
        && promptOccurrence
        && promptWord
        && promptWord.text === entry.prompt.text
        && promptWord.sentence === entry.prompt.sentence)
    })
    const valid = validation.valid && visit.childId === input.childId && queueMatchesProjection && !seenVisits.has(visit.id)
    if (!valid) quarantine('visits', visit.id || 'unknown', validation.errors.join(' ') || 'The cloud visit is duplicated, belongs to another child, or conflicts with canonical mastery data.', visit)
    else seenVisits.add(visit.id)
    return valid
  })
  const visitsById = new Map(visits.map((visit) => [visit.id, visit]))
  const receiptIds = new Set<string>()
  const receipts = input.receipts.filter((receipt) => {
    const visit = visitsById.get(receipt.visitId)
    const valid = Boolean(visit && warmupReceiptForVisit(receipt, visit) && !receiptIds.has(receipt.transitionId))
    if (!valid) quarantine('transitions', receipt.transitionId || 'unknown', 'The cloud Warmup receipt is malformed, duplicated, or references an unavailable visit.', receipt)
    else receiptIds.add(receipt.transitionId)
    return valid
  })
  const receiptsById = new Map(receipts.map((receipt) => [receipt.transitionId, receipt]))
  const attemptIds = new Set<string>()
  const attempts = input.attempts.filter((attempt) => {
    const visit = visitsById.get(attempt.visitId)
    const receipt = receiptsById.get(attempt.transitionId)
    const valid = Boolean(visit && warmupAttemptForVisit(attempt, visit) && receipt?.operation === 'answer' && receipt.attemptId === attempt.id && !attemptIds.has(attempt.id))
    if (!valid) quarantine('attempts', attempt.id || 'unknown', 'The cloud Warmup attempt is malformed, duplicated, or lacks its visit and receipt.', attempt)
    else attemptIds.add(attempt.id)
    return valid
  })
  const graphIds = new Set<string>()
  const graphPoints = input.graphPoints.filter((point) => {
    const visit = visitsById.get(point.visitId)
    const latestReceipt = visit?.lastAppliedTransition ? receiptsById.get(visit.lastAppliedTransition.transitionId) : undefined
    const valid = Boolean(visit && graphPointForVisit(point, visit) && latestReceipt?.graphPointId === point.id && !graphIds.has(point.id))
    if (!valid) quarantine('graph-points', point.id || 'unknown', 'The cloud Warmup graph point is malformed, duplicated, or inconsistent with its visit.', point)
    else graphIds.add(point.id)
    return valid
  })
  return {
    ...input.state,
    adaptiveWarmup: projection,
    warmupVisitsV1: visits,
    warmupTransitionReceiptsV1: receipts,
    warmupAttemptsV1: attempts,
    warmupGraphPointsV1: graphPoints,
    warmupMasteryRevisionsV1: Object.fromEntries(validMastery.map((item) => [item.state.id, item.revision])),
    warmupCloudQuarantineV1: issues,
    warmupPendingTransitionsV1: [],
  }
}
