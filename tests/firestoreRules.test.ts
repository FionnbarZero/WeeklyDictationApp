import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')

test('DT observation rules accept canonical Familiar writes and migration-era legacy writes', () => {
  const poolTypeRule = rules.match(/request\.resource\.data\.poolType in \[([^\]]+)\]/)?.[1] || ''
  assert.match(poolTypeRule, /'familiar'/)
  assert.match(poolTypeRule, /'earned'/)
  assert.match(poolTypeRule, /'established'/)
})

test('versioned Acquisition writes require monotonic revisions and immutable transition receipts', () => {
  assert.match(rules, /request\.resource\.data\.contractId == 'acquisition-persistence-v1'/)
  assert.match(rules, /request\.resource\.data\.revision == resource\.data\.revision \+ 1/)
  assert.match(rules, /match \/acquisitionTransitions\/\{transitionId\}/)
  assert.match(rules, /validAcquisitionReceiptShape\(request\.resource\.data\.progressionId, transitionId\)/)
  assert.match(rules, /getAfter\([^\n]+acquisitionProgressions/)
  assert.match(rules, /allow update, delete: if false;/)
})

test('transition-linked attempts and DT observations are immutable and require the receipt in the atomic write', () => {
  assert.match(rules, /function validOptionalAcquisitionTransition/)
  assert.match(rules, /getAfter\([^\n]+acquisitionTransitions/)
  assert.match(rules, /request\.resource\.data == resource\.data/)
})

test('Test Review cycle metadata is allowed only as a positive integer on Test Review records', () => {
  const cycleGuards = rules.match(/request\.resource\.data\.reviewCycle is int/g) || []
  assert.equal(cycleGuards.length, 3, 'sessions, attempts, and scores each require a cycle guard')
  assert.match(rules, /request\.resource\.data\.phase == 'test-review'[\s\S]+request\.resource\.data\.reviewCycle > 0/)
  assert.match(rules, /request\.resource\.data\.primaryPhase == 'test-review'[\s\S]+request\.resource\.data\.reviewCycle > 0/)
  assert.match(rules, /associatedPrimaryActivity\.phase == 'test-review'[\s\S]+associatedPrimaryActivity\.reviewCycle > 0/)
})

test('Adaptive Warmup rules require owned, revisioned, atomic, immutable records', () => {
  assert.match(rules, /match \/warmupVisits\/\{visitId\}/)
  assert.match(rules, /request\.resource\.data\.contractId == 'adaptive-warmup-visit-v1'/)
  assert.match(rules, /match \/warmupQueueEntries\/\{entryId\}/)
  assert.match(rules, /request\.resource\.data\.contractId == 'adaptive-warmup-queue-entry-v1'/)
  assert.match(rules, /validWarmupQueueEntryCreate\(familyId, childId, entryId\)/)
  assert.match(rules, /validWarmupQueueEntryUpdate\(familyId, childId, entryId\)/)
  assert.match(rules, /lastAppliedTransitionId/)
  assert.match(rules, /diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\['status', 'attemptId', 'unavailableReason', 'lastAppliedTransitionId'\]\)/)
  assert.match(rules, /receipt\.queueEntryId == entryId/)
  assert.match(rules, /validWarmupQueueEntryIds\(request\.resource\.data\.queueEntryIds\)/)
  assert.doesNotMatch(rules, /validWarmupQueueTransition|request\.resource\.data\.queue is list/)
  assert.match(rules, /request\.resource\.data\.revision == resource\.data\.revision \+ 1/)
  assert.match(rules, /match \/warmupMastery\/\{masteryStateId\}/)
  assert.match(rules, /match \/warmupTransitions\/\{transitionId\}/)
  assert.match(rules, /getAfter\([^\n]+warmupVisits/)
  assert.match(rules, /getAfter\([^\n]+warmupMastery/)
  assert.match(rules, /match \/warmupAttempts\/\{attemptId\}/)
  assert.match(rules, /match \/warmupGraphPoints\/\{pointId\}/)
  assert.match(rules, /match \/warmupRotations\/\{rotationId\}/)
})
