import {
  NEEDS_ATTENTION_RECOVERY_CORRECT,
  type AdaptiveWarmupProfile,
  type AppliedLegacyWarmupAttempt,
  type ChildMasteryState,
  type FinalReviewEvidenceCandidate,
  type LegacyMasteryCheckpoint,
  type MasteryLifecycleAssignment,
  type MasteryOccurrence,
  type MasteryTermDefinition,
  type OccurrenceIntegrationRecord,
  type WarmupSchedulingBucket,
} from './contracts.ts'
import { integrateMasteryOccurrenceForChild, isOccurrenceMasteryEligible, selectLatestFinalReviewEvidence } from './eligibility.ts'
import { childMasteryStateId } from './identity.ts'
import { applyAdaptiveWarmupAssessment } from './transitions.ts'

export type LegacyMasterySnapshot = {
  sourceRecordId: string
  childId: string
  occurrence: MasteryOccurrence
  profile: AdaptiveWarmupProfile
  curriculumOrder: string
  evidence: ChildMasteryState['evidence']
  bucket: WarmupSchedulingBucket
  consecutiveCorrect: number
  reliableIncorrect: boolean
  rotationEligibleFromCycle?: number
  lastConsumedRotationCycle?: number
  checkpointThrough?: string
  lastReviewedAt?: string
  lastIncorrectAt?: string
}

export type WarmupReplayAttempt = {
  attemptId: string
  childId: string
  occurrenceId: string
  reviewedAt: string
  correct: boolean
  payloadFingerprint: string
}

export type ReplayOccurrence = {
  occurrence: MasteryOccurrence
  assignment: MasteryLifecycleAssignment
  profile: AdaptiveWarmupProfile
  curriculumOrder: string
  eligibleAt?: string
}

type ReconstructionEvent =
  | { kind: 'integration'; entry: ReplayOccurrence; eventAt?: string; orderKey: string }
  | { kind: 'warmup'; attempt: WarmupReplayAttempt; entry: ReplayOccurrence; eventAt: string; orderKey: string }

function validTimestamp(value: string | undefined): value is string {
  return Boolean(value) && Number.isFinite(Date.parse(value!))
}

function latestTimestamp(values: Array<string | undefined>) {
  const ordered = values.filter(validTimestamp)
    .sort((left, right) => Date.parse(left) - Date.parse(right) || left.localeCompare(right))
  return ordered[ordered.length - 1]
}

function schedulingProfile(profile: AdaptiveWarmupProfile, sourceOccurrenceId: string) {
  return { id: profile.id, version: profile.version, sourceOccurrenceId }
}

function collapseSnapshots(
  childId: string,
  masteryTermId: string,
  snapshots: readonly LegacyMasterySnapshot[],
  currentCycle: number,
): ChildMasteryState {
  const priority: Record<WarmupSchedulingBucket, number> = { 'mastery-rotation': 1, 'recent-entry': 2, 'needs-attention': 3 }
  let bucket = snapshots.reduce((current, snapshot) => priority[snapshot.bucket] > priority[current] ? snapshot.bucket : current, 'mastery-rotation' as WarmupSchedulingBucket)
  const buckets = new Set(snapshots.map((snapshot) => snapshot.bucket))
  const streaks = new Set(snapshots.map((snapshot) => snapshot.consecutiveCorrect))
  const resetStreak = snapshots.some((snapshot) => snapshot.reliableIncorrect) || buckets.size !== 1 || streaks.size !== 1
  let evidence: ChildMasteryState['evidence'] = bucket === 'needs-attention' || snapshots.some((snapshot) => snapshot.evidence === 'support-needed')
    ? 'support-needed'
    : snapshots.some((snapshot) => snapshot.evidence === 'demonstrated') ? 'demonstrated' : 'unassessed'
  const orderedSnapshots = [...snapshots].sort((left, right) => left.curriculumOrder.localeCompare(right.curriculumOrder) || left.occurrence.occurrenceId.localeCompare(right.occurrence.occurrenceId))
  const latest = orderedSnapshots[orderedSnapshots.length - 1]
  const winning = snapshots.filter((snapshot) => snapshot.bucket === bucket)
  const eligible = winning.map((snapshot) => snapshot.rotationEligibleFromCycle).filter((value): value is number => typeof value === 'number')
  const consumed = winning.map((snapshot) => snapshot.lastConsumedRotationCycle).filter((value): value is number => typeof value === 'number')
  const commonStreak = [...streaks][0]
  let consecutiveCorrect = bucket === 'mastery-rotation'
    || evidence === 'unassessed'
    || resetStreak
    || (bucket === 'needs-attention' && commonStreak >= NEEDS_ATTENTION_RECOVERY_CORRECT)
    ? 0
    : commonStreak
  let rotationEligibleFromCycle = bucket === 'mastery-rotation' && eligible.length > 0 ? Math.min(...eligible) : undefined
  let lastConsumedRotationCycle = bucket === 'mastery-rotation' && consumed.length > 0 ? Math.max(...consumed) : undefined
  if (bucket === 'recent-entry' && evidence === 'demonstrated' && consecutiveCorrect >= latest.profile.recentEntryPromotionCorrect) {
    bucket = 'mastery-rotation'
    evidence = 'demonstrated'
    consecutiveCorrect = 0
    rotationEligibleFromCycle = latest.profile.rotationPolicy.promotedTermEligibility === 'next-cycle' ? currentCycle + 1 : currentCycle
    lastConsumedRotationCycle = undefined
  }
  const through = latestTimestamp(snapshots.map((snapshot) => snapshot.checkpointThrough))
  const checkpoint: LegacyMasteryCheckpoint = through
    ? { kind: 'timestamp', through, sourceRecordIds: snapshots.map((snapshot) => snapshot.sourceRecordId).sort() }
    : { kind: 'unknown-cutoff', sourceRecordIds: snapshots.map((snapshot) => snapshot.sourceRecordId).sort() }
  return {
    version: 1,
    id: childMasteryStateId(childId, masteryTermId),
    childId,
    masteryTermId,
    evidence,
    bucket,
    consecutiveCorrect,
    schedulingProfile: schedulingProfile(latest.profile, latest.occurrence.occurrenceId),
    integratedOccurrences: [],
    legacyCheckpoint: checkpoint,
    appliedLegacyWarmupAttempts: [],
    ...(rotationEligibleFromCycle !== undefined ? { rotationEligibleFromCycle } : {}),
    ...(lastConsumedRotationCycle !== undefined ? { lastConsumedRotationCycle } : {}),
    ...(latestTimestamp(snapshots.map((snapshot) => snapshot.lastReviewedAt)) ? { lastReviewedAt: latestTimestamp(snapshots.map((snapshot) => snapshot.lastReviewedAt)) } : {}),
    ...(latestTimestamp(snapshots.map((snapshot) => snapshot.lastIncorrectAt)) ? { lastIncorrectAt: latestTimestamp(snapshots.map((snapshot) => snapshot.lastIncorrectAt)) } : {}),
  }
}

function integrationRecord(entry: ReplayOccurrence, evidence?: FinalReviewEvidenceCandidate): OccurrenceIntegrationRecord {
  if (entry.assignment.status !== 'resolved') throw new Error('Only resolved mastery occurrences can be attached to migrated history.')
  const completed = evidence?.status === 'completed' && typeof evidence.correct === 'boolean'
  return {
    occurrenceId: entry.occurrence.occurrenceId,
    evidence: completed ? (evidence.correct ? 'correct' : 'incorrect') : 'none',
    eligibilityBasis: {
      kind: 'verified-mastery',
      lifecycleProfileId: entry.assignment.profileId,
      finalTestReviewCycle: entry.assignment.finalTestReviewCycle,
    },
    ...(evidence ? { sourceAttemptId: evidence.attemptId, sourceReviewedAt: evidence.reviewedAt } : {}),
  }
}

function attachHistoricalOccurrence(state: ChildMasteryState, entry: ReplayOccurrence, evidence?: FinalReviewEvidenceCandidate) {
  if (state.integratedOccurrences.some((record) => record.occurrenceId === entry.occurrence.occurrenceId)) return state
  return { ...state, integratedOccurrences: [...state.integratedOccurrences, integrationRecord(entry, evidence)] }
}

function integrationAfterCheckpoint(
  eventAt: string | undefined,
  curriculumOrder: string,
  checkpoint: LegacyMasteryCheckpoint | undefined,
  checkpointCurriculumOrder: string,
  hasFinalReviewEvidence: boolean,
) {
  if (!checkpoint) return true
  if (checkpoint.kind === 'timestamp' && checkpoint.through) {
    if (eventAt) return Date.parse(eventAt) > Date.parse(checkpoint.through)
    return curriculumOrder > checkpointCurriculumOrder
  }
  // A dated final-review result is an authoritative curriculum event even when
  // the legacy snapshot has no usable timestamp. Otherwise, only a later
  // curriculum occurrence can safely supersede an unknown-cutoff snapshot.
  return hasFinalReviewEvidence || curriculumOrder > checkpointCurriculumOrder
}

function warmupAfterCheckpoint(
  reviewedAt: string,
  curriculumOrder: string,
  checkpoint: LegacyMasteryCheckpoint | undefined,
  checkpointCurriculumOrder: string,
  resetEvents: readonly { eventAt?: string; curriculumOrder: string }[],
) {
  if (!checkpoint) return true
  if (checkpoint.kind === 'timestamp' && checkpoint.through) {
    return Date.parse(reviewedAt) > Date.parse(checkpoint.through)
  }
  // With an undated snapshot, retained Warmup attempts may already be folded
  // into its streak. Replay only attempts proven to follow a reconstructed
  // final-review/reintroduction reset; this avoids both double counting and
  // erasing later evidence.
  return resetEvents.some((reset) => reset.eventAt
    ? Date.parse(reviewedAt) > Date.parse(reset.eventAt)
    : curriculumOrder > checkpointCurriculumOrder)
}

function eventKey(eventAt: string | undefined, kindOrder: number, stableId: string, curriculumOrder: string) {
  if (eventAt) return `1\u0000${String(Date.parse(eventAt)).padStart(16, '0')}\u0000${kindOrder}\u0000${stableId}`
  return `0\u0000${curriculumOrder}\u0000${kindOrder}\u0000${stableId}`
}

export function reconstructChildMasteryStates(input: {
  terms: readonly MasteryTermDefinition[]
  occurrences: readonly ReplayOccurrence[]
  legacySnapshots: readonly LegacyMasterySnapshot[]
  finalReviewEvidence: readonly FinalReviewEvidenceCandidate[]
  warmupAttempts: readonly WarmupReplayAttempt[]
  rotationCycleFor: (childId: string, activityModule: string) => number
}) {
  const termById = new Map(input.terms.map((term) => [term.id, term]))
  const occurrenceById = new Map(input.occurrences.map((entry) => [entry.occurrence.occurrenceId, entry]))
  const snapshotGroups = new Map<string, LegacyMasterySnapshot[]>()
  for (const snapshot of input.legacySnapshots) {
    const key = `${snapshot.childId}\u0000${snapshot.occurrence.masteryTermId}`
    snapshotGroups.set(key, [...(snapshotGroups.get(key) || []), snapshot])
  }
  const stateKeys = new Set(snapshotGroups.keys())
  for (const evidence of input.finalReviewEvidence) {
    if (evidence.status === 'provisional') continue
    const entry = occurrenceById.get(evidence.occurrenceId)
    if (entry && selectLatestFinalReviewEvidence(entry.occurrence, entry.assignment, evidence.childId, input.finalReviewEvidence)) {
      stateKeys.add(`${evidence.childId}\u0000${entry.occurrence.masteryTermId}`)
    }
  }
  for (const attempt of input.warmupAttempts) {
    const entry = occurrenceById.get(attempt.occurrenceId)
    if (entry) stateKeys.add(`${attempt.childId}\u0000${entry.occurrence.masteryTermId}`)
  }

  const states: ChildMasteryState[] = []
  for (const key of [...stateKeys].sort()) {
    const separator = key.indexOf('\u0000')
    const childId = key.slice(0, separator)
    const masteryTermId = key.slice(separator + 1)
    const term = termById.get(masteryTermId)
    if (!term) continue
    const snapshots = snapshotGroups.get(key) || []
    const currentCycle = input.rotationCycleFor(childId, term.identity.activityModule)
    let state = snapshots.length > 0 ? collapseSnapshots(childId, masteryTermId, snapshots, currentCycle) : null
    const checkpoint = state?.legacyCheckpoint
    const checkpointCurriculumOrder = snapshots.reduce((latest, snapshot) => snapshot.curriculumOrder > latest ? snapshot.curriculumOrder : latest, '')
    const orderedOccurrences = term.occurrences.map((occurrence) => occurrenceById.get(occurrence.occurrenceId))
      .filter((entry): entry is ReplayOccurrence => Boolean(entry) && isOccurrenceMasteryEligible(entry!.occurrence, entry!.assignment))
      .sort((left, right) => left.curriculumOrder.localeCompare(right.curriculumOrder) || left.occurrence.occurrenceId.localeCompare(right.occurrence.occurrenceId))
    const events: ReconstructionEvent[] = []
    const resetEvents: Array<{ eventAt?: string; curriculumOrder: string }> = []

    for (const entry of orderedOccurrences) {
      const selectedFinal = selectLatestFinalReviewEvidence(entry.occurrence, entry.assignment, childId, input.finalReviewEvidence)
      const eventAt = selectedFinal?.reviewedAt || entry.eligibleAt
      if (state && !integrationAfterCheckpoint(eventAt, entry.curriculumOrder, checkpoint, checkpointCurriculumOrder, Boolean(selectedFinal))) {
        state = attachHistoricalOccurrence(state, entry, selectedFinal)
        continue
      }
      resetEvents.push({ eventAt, curriculumOrder: entry.curriculumOrder })
      events.push({
        kind: 'integration',
        entry,
        eventAt,
        orderKey: eventKey(eventAt, 0, entry.occurrence.occurrenceId, entry.curriculumOrder),
      })
    }

    for (const attempt of input.warmupAttempts) {
      if (attempt.childId !== childId) continue
      const entry = occurrenceById.get(attempt.occurrenceId)
      if (!entry || entry.occurrence.masteryTermId !== masteryTermId) continue
      if (!warmupAfterCheckpoint(attempt.reviewedAt, entry.curriculumOrder, checkpoint, checkpointCurriculumOrder, resetEvents)) continue
      events.push({
        kind: 'warmup',
        attempt,
        entry,
        eventAt: attempt.reviewedAt,
        orderKey: eventKey(attempt.reviewedAt, 1, attempt.attemptId, entry.curriculumOrder),
      })
    }

    for (const event of events.sort((left, right) => left.orderKey.localeCompare(right.orderKey))) {
      if (event.kind === 'integration') {
        const integrated = integrateMasteryOccurrenceForChild({
          childId,
          occurrence: event.entry.occurrence,
          lifecycleAssignment: event.entry.assignment,
          profile: event.entry.profile,
          currentState: state,
          finalReviewEvidence: input.finalReviewEvidence,
        })
        state = integrated.state
        continue
      }
      if (!state || !state.integratedOccurrences.some((record) => record.occurrenceId === event.entry.occurrence.occurrenceId)) {
        const integrated = integrateMasteryOccurrenceForChild({
          childId,
          occurrence: event.entry.occurrence,
          lifecycleAssignment: event.entry.assignment,
          profile: event.entry.profile,
          currentState: state,
          finalReviewEvidence: input.finalReviewEvidence,
        })
        state = integrated.state
      }
      if (!state) continue
      const owningEntry = input.occurrences.find((candidate) => candidate.profile.id === state!.schedulingProfile.id
        && candidate.profile.version === state!.schedulingProfile.version)
      if (!owningEntry) continue
      state = applyAdaptiveWarmupAssessment(
        state,
        { outcome: event.attempt.correct ? 'correct' : 'incorrect', reviewedAt: event.attempt.reviewedAt },
        currentCycle,
        owningEntry.profile,
      )
      const applied: AppliedLegacyWarmupAttempt = {
        attemptId: event.attempt.attemptId,
        reviewedAt: event.attempt.reviewedAt,
        correct: event.attempt.correct,
        payloadFingerprint: event.attempt.payloadFingerprint,
      }
      state = {
        ...state,
        appliedLegacyWarmupAttempts: [...(state.appliedLegacyWarmupAttempts || []), applied],
      }
    }
    if (state && state.integratedOccurrences.length > 0) {
      states.push({
        ...state,
        integratedOccurrences: [...state.integratedOccurrences].sort((left, right) => left.occurrenceId.localeCompare(right.occurrenceId)),
        appliedLegacyWarmupAttempts: [...(state.appliedLegacyWarmupAttempts || [])].sort((left, right) => left.attemptId.localeCompare(right.attemptId)),
      })
    }
  }
  return states.sort((left, right) => left.childId.localeCompare(right.childId) || left.masteryTermId.localeCompare(right.masteryTermId))
}
