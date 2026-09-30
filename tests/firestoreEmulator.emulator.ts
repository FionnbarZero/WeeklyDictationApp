import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'
import { grade2Tier1WritingAdaptiveWarmupProfile } from '../src/warmup/adaptive/profiles/grade2.ts'
import { childMasteryStateId, createMasteryOccurrence, masteryRotationStateId } from '../src/warmup/adaptive/identity.ts'
import { buildWarmupAnswerTransition, createWarmupVisit } from '../src/warmup/visits/reducer.ts'
import type { ChildMasteryState } from '../src/warmup/adaptive/contracts.ts'
import { encodeChangedCloudWarmupQueueEntry, encodeCloudWarmupVisit } from '../src/persistence/warmup/cloudCodec.ts'

let environment: RulesTestEnvironment

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'weekly-dictation-test',
    firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
  })
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore()
    await setDoc(doc(database, 'users/parent'), { familyId: 'family-parent', role: 'parent' })
    await setDoc(doc(database, 'families/family-parent'), { ownerParentId: 'parent' })
    await setDoc(doc(database, 'families/family-parent/children/maya'), { id: 'maya', active: true })
    await setDoc(doc(database, 'families/family-parent/children/maya/sessions/session-1'), {
      id: 'session-1', childId: 'maya', familyId: 'family-parent', status: 'in_progress', primaryPhase: 'acquisition',
    })
    await setDoc(doc(database, 'datasets/dataset-1'), { id: 'dataset-1' })
    await setDoc(doc(database, 'datasets/dataset-1/words/word-1'), { id: 'word-1' })
    await setDoc(doc(database, 'users/intruder'), { familyId: 'family-intruder', role: 'parent' })
    await setDoc(doc(database, 'families/family-intruder'), { ownerParentId: 'intruder' })
  })
})

after(async () => {
  await environment?.cleanup()
})

function receipt(transitionId: string, expectedRevision: number) {
  return {
    progressionId: 'progression-1',
    transitionId,
    payloadFingerprint: `fingerprint-${transitionId}`,
    operation: 'answer',
    promptId: `prompt-${expectedRevision}`,
    expectedRevision,
    appliedRevision: expectedRevision + 1,
    appliedAt: `2026-09-29T16:00:0${expectedRevision + 1}.000Z`,
  }
}

function progression(revision: number, transitionId: string) {
  const applied = receipt(transitionId, revision - 1)
  return {
    schemaVersion: 1,
    contractId: 'acquisition-persistence-v1',
    id: 'progression-1',
    childId: 'maya',
    datasetId: 'dataset-1',
    grade: 'Grade 2',
    schoolYear: '2026-27',
    activityModule: 'mandarin-tier1-writing',
    tier: 'tier-1',
    lifecycleStageAtLastCheckpoint: { kind: 'acquisition' },
    applicationVersion: 'test',
    strategyId: 'grade-2-acquisition-v3',
    strategyVersion: 3,
    strategyFingerprint: 'strategy-fingerprint',
    targetSetFingerprint: 'target-fingerprint',
    targetOccurrenceIds: ['word-1'],
    revision,
    status: 'in-progress',
    flow: { datasetId: 'dataset-1' },
    lastAppliedTransition: applied,
    createdAt: '2026-09-29T16:00:00.000Z',
    updatedAt: applied.appliedAt,
  }
}

function atomicCheckpointBatch(uid: 'parent' | 'intruder', revision: number, transitionId: string, options: { attempt?: boolean; dtObservation?: boolean; changedDataset?: boolean; invalidStatus?: boolean; receiptPathId?: string } = {}) {
  const database = environment.authenticatedContext(uid).firestore()
  const batch = writeBatch(database)
  const next = progression(revision, transitionId)
  if (options.changedDataset) next.datasetId = 'other-dataset'
  if (options.invalidStatus) next.status = 'finished'
  batch.set(doc(database, 'families/family-parent/children/maya/acquisitionProgressions/progression-1'), next)
  batch.set(doc(database, `families/family-parent/children/maya/acquisitionTransitions/${options.receiptPathId || transitionId}`), receipt(transitionId, revision - 1))
  if (options.attempt) batch.set(doc(database, `families/family-parent/children/maya/sessions/session-1/attempts/attempt-${revision}`), {
    id: `attempt-${revision}`,
    sessionId: 'session-1',
    wordId: 'word-1',
    sourceDatasetId: 'dataset-1',
    phase: 'acquisition',
    correct: true,
    reviewedAt: receipt(transitionId, revision - 1).appliedAt,
    completionStatus: 'complete',
    transitionId,
  })
  if (options.dtObservation) batch.set(doc(database, `families/family-parent/children/maya/dtObservations/observation-${revision}`), {
    id: `observation-${revision}`,
    childId: 'maya',
    sessionId: 'session-1',
    datasetId: 'dataset-1',
    wordId: 'word-1',
    text: '需要',
    poolType: 'earned',
    correct: true,
    revealMethod: 'timer',
    reviewedAt: receipt(transitionId, revision - 1).appliedAt,
    transitionId,
  })
  return batch
}

const warmupMasteryTermId = createMasteryOccurrence({
  occurrenceId: 'word-1',
  datasetId: 'dataset-1',
  grade: 'Grade 2',
  schoolYear: '2026-27',
  text: '需要',
  activityModule: 'mandarin-tier1-writing',
  tier: 'tier-1',
  language: 'mandarin',
}).masteryTermId
const warmupMasteryState: ChildMasteryState = {
  version: 1,
  id: childMasteryStateId('maya', warmupMasteryTermId),
  childId: 'maya',
  masteryTermId: warmupMasteryTermId,
  evidence: 'unassessed',
  bucket: 'recent-entry',
  consecutiveCorrect: 0,
  schedulingProfile: { id: grade2Tier1WritingAdaptiveWarmupProfile.id, version: grade2Tier1WritingAdaptiveWarmupProfile.version, sourceOccurrenceId: 'word-1' },
  integratedOccurrences: [{ occurrenceId: 'word-1', evidence: 'none', eligibilityBasis: { kind: 'verified-mastery', lifecycleProfileId: 'grade2-replacement-2026-27', finalTestReviewCycle: 1 } }],
}
const warmupVisit = createWarmupVisit({
  id: 'warmup-visit-1',
  childId: 'maya',
  grade: 'Grade 2',
  schoolYear: '2026-27',
  profile: grade2Tier1WritingAdaptiveWarmupProfile,
  tier: 'tier-1',
  language: 'mandarin',
  selection: {
    visitType: 'standalone',
    profile: { id: grade2Tier1WritingAdaptiveWarmupProfile.id, version: grade2Tier1WritingAdaptiveWarmupProfile.version },
    configuredMaximum: 16,
    entries: [{ masteryTermId: warmupMasteryTermId, sourceBucket: 'recent-entry', occurrenceIds: ['word-1'] }],
    rotationCycle: 1,
    rotationAdvanced: false,
  },
  promptForEntry: () => ({ wordId: 'word-1', datasetId: 'dataset-1', text: '需要', sentence: '我需要帮助。' }),
  createdAt: '2026-09-30T16:00:00.000Z',
})
const warmupTransition = buildWarmupAnswerTransition({
  visit: warmupVisit,
  mastery: { revision: 0, state: warmupMasteryState },
  profile: grade2Tier1WritingAdaptiveWarmupProfile,
  correct: true,
  revealMethod: 'timer',
  occurredAt: '2026-09-30T16:01:00.000Z',
})
const encodedWarmupVisit = encodeCloudWarmupVisit(warmupVisit)

function warmupTransitionBatch(uid: 'parent' | 'intruder', transition = warmupTransition) {
  const database = environment.authenticatedContext(uid).firestore()
  const batch = writeBatch(database)
  const encoded = encodeCloudWarmupVisit(transition.nextVisit)
  batch.set(doc(database, `families/family-parent/children/maya/warmupVisits/${transition.visitId}`), encoded.visit)
  batch.set(doc(database, `families/family-parent/children/maya/warmupTransitions/${transition.transitionId}`), transition.nextVisit.lastAppliedTransition!)
  if (transition.queueEntryId) batch.set(doc(database, `families/family-parent/children/maya/warmupQueueEntries/${transition.queueEntryId}`), encodeChangedCloudWarmupQueueEntry(transition.nextVisit, transition.queueEntryId))
  if (transition.nextMastery) batch.set(doc(database, `families/family-parent/children/maya/warmupMastery/${transition.nextMastery.state.id}`), transition.nextMastery)
  if (transition.attempt) batch.set(doc(database, `families/family-parent/children/maya/warmupAttempts/${transition.attempt.id}`), transition.attempt)
  if (transition.graphPoint) batch.set(doc(database, `families/family-parent/children/maya/warmupGraphPoints/${transition.graphPoint.id}`), transition.graphPoint)
  return batch
}

test('an owner can atomically create a progression and immutable receipt', async () => {
  await assertSucceeds(atomicCheckpointBatch('parent', 1, 'transition-1').commit())
})

test('the next revision, scored attempt, and DT observation require the same atomic receipt', async () => {
  await assertSucceeds(atomicCheckpointBatch('parent', 2, 'transition-2', { attempt: true, dtObservation: true }).commit())
  const database = environment.authenticatedContext('parent').firestore()
  await assertFails(setDoc(doc(database, 'families/family-parent/children/maya/sessions/session-1/attempts/unreceipted'), {
    id: 'unreceipted', sessionId: 'session-1', wordId: 'word-1', sourceDatasetId: 'dataset-1', phase: 'acquisition',
    correct: true, reviewedAt: '2026-09-29T16:00:03.000Z', completionStatus: 'complete', transitionId: 'missing-transition',
  }))
  await assertFails(setDoc(doc(database, 'families/family-parent/children/maya/dtObservations/unreceipted'), {
    id: 'unreceipted', childId: 'maya', sessionId: 'session-1', datasetId: 'dataset-1', wordId: 'word-1', text: '需要',
    poolType: 'earned', correct: true, revealMethod: 'timer', reviewedAt: '2026-09-29T16:00:03.000Z', transitionId: 'missing-transition',
  }))
})

test('malformed IDs, statuses, stale revisions, immutable identity, and cross-family access fail', async () => {
  await assertFails(atomicCheckpointBatch('parent', 2, 'stale-transition').commit())
  await assertFails(atomicCheckpointBatch('parent', 3, 'changed-identity', { changedDataset: true }).commit())
  await assertFails(atomicCheckpointBatch('parent', 3, 'invalid-status', { invalidStatus: true }).commit())
  await assertFails(atomicCheckpointBatch('parent', 3, 'path-id-mismatch', { receiptPathId: 'different-path-id' }).commit())
  const owner = environment.authenticatedContext('parent').firestore()
  await assertFails(setDoc(doc(owner, 'families/family-parent/children/maya/acquisitionTransitions/transition-1'), receipt('transition-1', 0)))
  await assertFails(atomicCheckpointBatch('intruder', 3, 'intruder-transition').commit())
  const intruder = environment.authenticatedContext('intruder').firestore()
  await assertFails(getDoc(doc(intruder, 'families/family-parent/children/maya/acquisitionProgressions/progression-1')))
  assert.ok(true)
})

test('an owner can seed a versioned Warmup visit, mastery state, and rotation', async () => {
  const database = environment.authenticatedContext('parent').firestore()
  const batch = writeBatch(database)
  batch.set(doc(database, `families/family-parent/children/maya/warmupVisits/${warmupVisit.id}`), encodedWarmupVisit.visit)
  for (const entry of encodedWarmupVisit.queueEntries) batch.set(doc(database, `families/family-parent/children/maya/warmupQueueEntries/${entry.id}`), entry)
  batch.set(doc(database, `families/family-parent/children/maya/warmupMastery/${warmupMasteryState.id}`), { revision: 0, state: warmupMasteryState })
  const rotationId = masteryRotationStateId('maya', 'mandarin-tier1-writing')
  batch.set(doc(database, `families/family-parent/children/maya/warmupRotations/${rotationId}`), { version: 1, id: rotationId, childId: 'maya', activityModule: 'mandarin-tier1-writing', cycle: 1 })
  await assertSucceeds(batch.commit())
})

test('one Warmup batch atomically advances visit and mastery while creating its receipt, attempt, and graph point', async () => {
  await assertSucceeds(warmupTransitionBatch('parent').commit())
  const database = environment.authenticatedContext('parent').firestore()
  assert.equal((await getDoc(doc(database, `families/family-parent/children/maya/warmupVisits/${warmupVisit.id}`))).data()?.revision, 1)
  assert.equal((await getDoc(doc(database, `families/family-parent/children/maya/warmupMastery/${warmupMasteryState.id}`))).data()?.revision, 1)
})

test('Warmup rules reject duplicate, stale, malformed-ID, and cross-family operations', async () => {
  await assertFails(warmupTransitionBatch('parent').commit())
  const owner = environment.authenticatedContext('parent').firestore()
  await assertFails(setDoc(doc(owner, 'families/family-parent/children/maya/warmupAttempts/wrong-id'), { ...warmupTransition.attempt, id: 'different-id' }))
  const detachedAttemptId = 'warmup-attempt-v1-0000000000000000'
  await assertFails(setDoc(doc(owner, `families/family-parent/children/maya/warmupAttempts/${detachedAttemptId}`), { ...warmupTransition.attempt, id: detachedAttemptId }))
  const detachedGraphId = 'warmup-graph-v1-0000000000000000'
  await assertFails(setDoc(doc(owner, `families/family-parent/children/maya/warmupGraphPoints/${detachedGraphId}`), { ...warmupTransition.graphPoint, id: detachedGraphId }))
  const impossibleMasteryId = childMasteryStateId('maya', 'impossible-term')
  await assertFails(setDoc(doc(owner, `families/family-parent/children/maya/warmupMastery/${impossibleMasteryId}`), {
    revision: 0,
    state: { ...warmupMasteryState, id: impossibleMasteryId, masteryTermId: 'impossible-term', evidence: 'unassessed', bucket: 'recent-entry', consecutiveCorrect: 1 },
  }))
  await assertFails(warmupTransitionBatch('intruder').commit())
  const intruder = environment.authenticatedContext('intruder').firestore()
  await assertFails(getDoc(doc(intruder, `families/family-parent/children/maya/warmupVisits/${warmupVisit.id}`)))
})
