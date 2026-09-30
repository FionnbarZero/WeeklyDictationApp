import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  AdaptiveWarmupProfileRegistry,
  ChildMasteryState,
  MasteryLifecycleAssignment,
  MasteryTermDefinition,
} from '../src/warmup/adaptive/contracts.ts'
import { createMasteryOccurrence, childMasteryStateId } from '../src/warmup/adaptive/identity.ts'
import { grade2Tier1WritingAdaptiveWarmupProfile } from '../src/warmup/adaptive/profiles/grade2.ts'
import { activeRegistryForProfiles } from '../src/warmup/adaptive/profileValidation.ts'
import {
  applyWarmupTransition,
  buildWarmupAnswerTransition,
  buildWarmupFinalizationTransition,
  buildWarmupUnavailableTransition,
  createWarmupVisit,
} from '../src/warmup/visits/reducer.ts'
import { validateWarmupTransition, validateWarmupVisit } from '../src/warmup/visits/validation.ts'
import { warmupTransitionFingerprint } from '../src/warmup/visits/identity.ts'
import { deriveMasteryRotationMonthlyReports } from '../src/warmup/visits/reporting.ts'

const profile = grade2Tier1WritingAdaptiveWarmupProfile
const registry: AdaptiveWarmupProfileRegistry = activeRegistryForProfiles([profile])

function fixture(index: number, bucket: ChildMasteryState['bucket'] = 'recent-entry') {
  const occurrence = createMasteryOccurrence({
    occurrenceId: `word-${index}`,
    wordId: `word-${index}`,
    datasetId: `dataset-${index}`,
    grade: 'Grade 2',
    schoolYear: '2026-27',
    text: `字${index}`,
    activityModule: 'mandarin-tier1-writing',
    tier: 'tier-1',
    language: 'mandarin',
  })
  const term: MasteryTermDefinition = { id: occurrence.masteryTermId, identity: occurrence.identity, occurrences: [occurrence] }
  const state: ChildMasteryState = {
    version: 1,
    id: childMasteryStateId('maya', term.id),
    childId: 'maya',
    masteryTermId: term.id,
    evidence: bucket === 'needs-attention' ? 'support-needed' : bucket === 'mastery-rotation' ? 'demonstrated' : 'unassessed',
    bucket,
    consecutiveCorrect: 0,
    schedulingProfile: { id: profile.id, version: profile.version, sourceOccurrenceId: occurrence.occurrenceId },
    integratedOccurrences: [{
      occurrenceId: occurrence.occurrenceId,
      evidence: 'none',
      eligibilityBasis: { kind: 'verified-mastery', lifecycleProfileId: 'grade2-replacement-v1', finalTestReviewCycle: 1 },
    }],
  }
  const lifecycle: MasteryLifecycleAssignment = {
    occurrenceId: occurrence.occurrenceId,
    status: 'resolved',
    profileId: 'grade2-replacement-v1',
    stage: { kind: 'mastery' },
    finalTestReviewCycle: 1,
  }
  return { occurrence, term, state, lifecycle }
}

function visitFor(fixtures: ReturnType<typeof fixture>[], visitId = 'visit-grade2-1') {
  return createWarmupVisit({
    id: visitId,
    childId: 'maya',
    grade: 'Grade 2',
    schoolYear: '2026-27',
    profile,
    tier: 'tier-1',
    language: 'mandarin',
    selection: {
      visitType: 'standalone',
      profile: { id: profile.id, version: profile.version },
      configuredMaximum: 16,
      entries: fixtures.map((item) => ({ masteryTermId: item.term.id, sourceBucket: item.state.bucket, occurrenceIds: [item.occurrence.occurrenceId] })),
      rotationCycle: 1,
      rotationAdvanced: false,
    },
    promptForEntry: (masteryTermId) => {
      const item = fixtures.find((candidate) => candidate.term.id === masteryTermId)!
      return { wordId: item.occurrence.wordId, datasetId: item.occurrence.datasetId, text: item.occurrence.displayText, sentence: `Sentence ${item.occurrence.displayText}` }
    },
    createdAt: '2026-09-30T16:00:00.000Z',
  })
}

test('a durable Warmup visit materializes a stable unique short queue', () => {
  const fixtures = [fixture(1), fixture(2, 'needs-attention')]
  const visit = visitFor(fixtures)
  assert.equal(visit.assignedQueueSize, 2)
  assert.equal(visit.configuredMaximum, 16)
  assert.equal(visit.nextPosition, 0)
  assert.equal(visit.status, 'in-progress')
  assert.equal(new Set(visit.queue.map((entry) => entry.masteryTermId)).size, 2)
  assert.deepEqual(validateWarmupVisit(visit, registry), { valid: true, errors: [] })
  assert.deepEqual(JSON.parse(JSON.stringify(visit)), visit)
})

test('one answer atomically advances the visit, mastery state, attempt, and graph point', () => {
  const item = fixture(1)
  const visit = visitFor([item])
  const mastery = { revision: 0, state: item.state }
  const transition = buildWarmupAnswerTransition({ visit, mastery, profile, correct: true, revealMethod: 'timer', occurredAt: '2026-09-30T16:01:00.000Z' })
  assert.deepEqual(validateWarmupTransition(transition, visit, mastery, registry), { valid: true, errors: [] })
  const applied = applyWarmupTransition(visit, transition, mastery)
  assert.equal(applied.status, 'applied')
  if (applied.status !== 'applied') return
  assert.equal(applied.visit.status, 'completed')
  assert.equal(applied.visit.nextPosition, 1)
  assert.equal(applied.visit.attemptedCount, 1)
  assert.equal(applied.visit.correctCount, 1)
  assert.equal(applied.visit.percent, 100)
  assert.equal(applied.mastery?.revision, 1)
  assert.equal(applied.mastery?.state.evidence, 'demonstrated')
  assert.equal(applied.mastery?.state.consecutiveCorrect, 1)
  assert.equal(applied.attempt?.sourceBucket, 'recent-entry')
  assert.equal(applied.graphPoint?.status, 'completed')
  assert.equal(applied.graphPoint?.attemptedCount, 1)
})

test('transition receipts make exact retries idempotent and reject stale or conflicting writes', () => {
  const item = fixture(1)
  const visit = visitFor([item])
  const mastery = { revision: 0, state: item.state }
  const transition = buildWarmupAnswerTransition({ visit, mastery, profile, correct: false, revealMethod: 'skip_timer', occurredAt: '2026-09-30T16:01:00.000Z' })
  const applied = applyWarmupTransition(visit, transition, mastery)
  assert.equal(applied.status, 'applied')
  if (applied.status !== 'applied') return
  assert.equal(applyWarmupTransition(applied.visit, transition, applied.mastery, applied.receipt).status, 'idempotent')
  const conflicting = { ...transition, payloadFingerprint: 'warmup-checkpoint-v1-conflict' }
  assert.equal(applyWarmupTransition(applied.visit, conflicting, applied.mastery, applied.receipt).status, 'conflict')
  const secondVisit = visitFor([item], 'visit-grade2-2')
  const staleTransition = buildWarmupAnswerTransition({ visit: secondVisit, mastery, profile, correct: true, revealMethod: 'timer', occurredAt: '2026-09-30T16:02:00.000Z' })
  assert.equal(applyWarmupTransition({ ...secondVisit, revision: 1 }, staleTransition, mastery).status, 'conflict')
})

test('a self-consistent fingerprint cannot authorize an invented Warmup successor', () => {
  const item = fixture(1)
  const visit = visitFor([item])
  const mastery = { revision: 0, state: item.state }
  const original = buildWarmupAnswerTransition({ visit, mastery, profile, correct: true, revealMethod: 'timer', occurredAt: '2026-09-30T16:01:00.000Z' })
  const nextMastery = { ...original.nextMastery!, state: { ...original.nextMastery!.state, consecutiveCorrect: 0 } }
  const withoutFingerprint = { ...original, nextMastery, payloadFingerprint: undefined }
  const { payloadFingerprint: _ignored, ...fingerprintInput } = withoutFingerprint
  const payloadFingerprint = warmupTransitionFingerprint(fingerprintInput)
  const receipt = { ...original.nextVisit.lastAppliedTransition!, payloadFingerprint }
  const invented = {
    ...original,
    payloadFingerprint,
    nextVisit: { ...original.nextVisit, lastAppliedTransition: receipt },
    nextMastery: { ...nextMastery, lastAppliedTransition: { ...receipt, masteryStateId: nextMastery.state.id } },
  }
  const validation = validateWarmupTransition(invented, visit, mastery, registry)
  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((error) => error.includes('deterministic successor')))
})

test('a pending active term becomes unavailable without changing score or queue order', () => {
  const first = fixture(1)
  const second = fixture(2)
  const visit = visitFor([first, second])
  const assignments: MasteryLifecycleAssignment[] = [
    { ...first.lifecycle, stage: { kind: 'acquisition' } },
    second.lifecycle,
  ]
  const transition = buildWarmupUnavailableTransition({ visit, terms: [first.term, second.term], lifecycleAssignments: assignments, occurredAt: '2026-09-30T16:03:00.000Z' })
  assert.ok(transition)
  const applied = applyWarmupTransition(visit, transition!)
  assert.equal(applied.status, 'applied')
  if (applied.status !== 'applied') return
  assert.equal(applied.visit.queue[0].status, 'unavailable')
  assert.equal(applied.visit.queue[1].status, 'pending')
  assert.equal(applied.visit.nextPosition, 1)
  assert.equal(applied.visit.attemptedCount, 0)
  assert.equal(applied.attempt, undefined)
  assert.equal(applied.graphPoint, undefined)
  assert.deepEqual(validateWarmupVisit(applied.visit, registry), { valid: true, errors: [] })
})

test('skip-before-answer creates no graph point while answered exits finalize one partial point', () => {
  const items = [fixture(1), fixture(2)]
  const visit = visitFor(items)
  const skipped = buildWarmupFinalizationTransition({ visit, operation: 'skip', occurredAt: '2026-09-30T16:04:00.000Z' })
  assert.equal(skipped.nextVisit.status, 'skipped')
  assert.equal(skipped.graphPoint, undefined)
  assert.deepEqual(validateWarmupVisit(skipped.nextVisit, registry), { valid: true, errors: [] })

  const mastery = { revision: 0, state: items[0].state }
  const answered = buildWarmupAnswerTransition({ visit, mastery, profile, correct: false, revealMethod: 'timer', occurredAt: '2026-09-30T16:05:00.000Z' })
  const partial = buildWarmupFinalizationTransition({ visit: answered.nextVisit, operation: 'finalize-partial', occurredAt: '2026-09-30T16:06:00.000Z' })
  assert.equal(partial.nextVisit.status, 'partial')
  assert.equal(partial.graphPoint?.status, 'partial')
  assert.equal(partial.graphPoint?.attemptedCount, 1)
  assert.throws(() => buildWarmupFinalizationTransition({ visit, operation: 'finalize-partial', occurredAt: '2026-09-30T16:06:00.000Z' }))
  assert.throws(() => buildWarmupFinalizationTransition({ visit: answered.nextVisit, operation: 'skip', occurredAt: '2026-09-30T16:06:00.000Z' }))
})

test('monthly Mastery Rotation reporting is derived from original attempt buckets and attempted count', () => {
  const item = fixture(1, 'mastery-rotation')
  const visit = visitFor([item])
  const transition = buildWarmupAnswerTransition({ visit, mastery: { revision: 0, state: item.state }, profile, correct: true, revealMethod: 'timer', occurredAt: '2026-09-01T06:30:00.000Z' })
  const attempt = transition.attempt!
  const reports = deriveMasteryRotationMonthlyReports([
    attempt,
    { ...attempt, id: 'second-attempt', transitionId: 'second-transition', correct: false, reviewedAt: '2026-09-01T07:30:00.000Z' },
    { ...attempt, id: 'recent-entry-attempt', transitionId: 'recent-entry-transition', sourceBucket: 'recent-entry', correct: false, reviewedAt: '2026-09-15T16:00:00.000Z' },
  ], new Date('2026-09-30T16:00:00.000Z'))
  assert.deepEqual(reports, [
    { month: '2026-08', correct: 1, attempted: 1, percent: 100, status: 'finalized' },
    { month: '2026-09', correct: 0, attempted: 1, percent: 0, status: 'open' },
  ])
})
