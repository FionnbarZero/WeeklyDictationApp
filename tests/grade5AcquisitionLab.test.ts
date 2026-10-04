import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { extractGrade5Presentation } from '../src/curriculum/adapters/grade5GoogleSlides.ts'
import type { SlidesPresentationPayload, WeeklyDatasetCandidate } from '../src/curriculum/model.ts'
import {
  answerGrade5AcquisitionLab,
  grade5AcquisitionTargetSet,
  revealGrade5AcquisitionLab,
  startGrade5AcquisitionLab,
  type Grade5AcquisitionLabState,
} from '../src/grade5Lab/acquisitionLab.ts'
import { grade5WritingLabProfile } from '../src/grade5Lab/practiceProfile.ts'

function fixture(): SlidesPresentationPayload {
  return JSON.parse(readFileSync(new URL('./fixtures/grade5-presentation.json', import.meta.url), 'utf8')) as SlidesPresentationPayload
}

function acquisitionCandidate() {
  const extraction = extractGrade5Presentation(fixture())
  const datasetId = extraction.progressionEvidence.at(-1)?.introducedDatasetId
  const candidate = extraction.candidates.find((item) => item.datasetId === datasetId && item.status === 'valid')
  assert.ok(candidate)
  return candidate
}

function answer(state: Grade5AcquisitionLabState, correct: boolean) {
  return answerGrade5AcquisitionLab(revealGrade5AcquisitionLab(state), correct, 'skip_timer', () => 0)
}

test('the Grade 5 lab owns a separate profile while sharing the approved Acquisition v3 contract', () => {
  const strategy = grade5WritingLabProfile.acquisition

  assert.equal(grade5WritingLabProfile.grade, 'Grade 5')
  assert.equal(grade5WritingLabProfile.warmupPreview.preActivityMaximum, 6)
  assert.equal(grade5WritingLabProfile.warmupPreview.preActivityWarmupRequirement, 'required')
  assert.equal(grade5WritingLabProfile.timers.testReview, 10)
  assert.equal(strategy.id, 'grade5-acquisition-v1')
  assert.equal(strategy.version, 1)
  assert.deepEqual(strategy.introductionSequence, ['familiar-dt', 'familiar-dt', 'show-copy', 'target'])
  assert.deepEqual(strategy.expandedSequence, ['target', 'dt', 'target', 'dt', 'dt', 'target', 'dt', 'dt', 'dt', 'target'])
  assert.deepEqual(strategy.correctionSequence, ['show-copy', 'show-copy', 'show-copy', 'target', 'familiar-dt', 'target'])
})

test('validated Tier 1 occurrences become ordered Grade 5 Acquisition targets without Tier 2 or Tier 3 leakage', () => {
  const candidate = acquisitionCandidate()
  const targetSet = grade5AcquisitionTargetSet(candidate)

  assert.equal(targetSet.id, candidate.datasetId)
  assert.deepEqual(targetSet.targets.map((target) => target.text), candidate.tier1.map((word) => word.text))
  assert.deepEqual(targetSet.targets.map((target) => target.id), candidate.tier1.map((word) => word.targetOccurrenceId))
  assert.ok(targetSet.targets.every((target) => target.tier === 'tier-1' && target.activityType === 'dictation'))
  assert.ok(targetSet.targets.every((target) => !candidate.tier2.some((word) => word.text === target.text)))
  assert.ok(targetSet.targets.every((target) => !candidate.tier3.some((word) => word.text === target.text)))
})

test('duplicate source occurrences remain distinct Acquisition targets', () => {
  const candidate = acquisitionCandidate()
  const repeated = candidate.tier1[0]
  const withRepeatedOccurrence: WeeklyDatasetCandidate = {
    ...candidate,
    tier1: [
      repeated,
      { ...repeated, sourcePosition: repeated.sourcePosition + 100, targetOccurrenceId: `${repeated.targetOccurrenceId}-repeat` },
    ],
  }
  const targetSet = grade5AcquisitionTargetSet(withRepeatedOccurrence)

  assert.deepEqual(targetSet.targets.map((target) => target.text), [repeated.text, repeated.text])
  assert.equal(new Set(targetSet.targets.map((target) => target.id)).size, 2)
})

test('the lab runs the shared engine and separates official scores from Familiar-DT diagnostics', () => {
  let state = startGrade5AcquisitionLab(acquisitionCandidate(), () => 0)
  assert.equal(state.flow.prompt?.kind, 'familiar-dt')
  assert.equal(state.flow.strategyId, 'grade5-acquisition-v1')

  state = answer(state, false)
  assert.equal(state.assessments.length, 1)
  assert.equal(state.assessments[0].dtPoolType, 'familiar')
  assert.equal(state.assessments[0].countsTowardWeeklyScore, false)
  assert.equal(state.flow.prompt?.kind, 'familiar-dt')

  state = answer(state, true)
  assert.equal(state.flow.prompt?.kind, 'show-copy')
  state = answer(state, false)
  assert.equal(state.assessments.length, 2, 'show-and-copy completion does not create an assessment')
  assert.equal(state.flow.prompt?.kind, 'target')

  state = answer(state, true)
  assert.equal(state.assessments.length, 3)
  assert.equal(state.assessments.at(-1)?.kind, 'target')
  assert.equal(state.assessments.at(-1)?.countsTowardWeeklyScore, true)
  assert.equal(state.flow.phase, 'expanded-trials')
  assert.equal(state.flow.step, 0)
  assert.equal(state.flow.prompt?.timerSeconds, 10)
})

test('a completed Grade 5 target becomes an Earned DT that counts toward the official score', () => {
  let state = startGrade5AcquisitionLab(acquisitionCandidate(), () => 0)
  while (state.flow.targetIndex === 0) state = answer(state, true)
  while (state.flow.phase === 'introduction') state = answer(state, true)

  state = answerGrade5AcquisitionLab(revealGrade5AcquisitionLab(state), true, 'skip_timer', () => 0.75)
  assert.equal(state.flow.prompt?.kind, 'earned-dt')
  assert.equal(state.flow.prompt?.countsTowardWeeklyScore, true)

  state = answer(state, true)
  assert.equal(state.assessments.at(-1)?.kind, 'earned-dt')
  assert.equal(state.assessments.at(-1)?.countsTowardWeeklyScore, true)
})

test('the Grade 5 lab rejects noncanonical or empty Tier 1 candidates', () => {
  const candidate = acquisitionCandidate()
  assert.throws(() => grade5AcquisitionTargetSet({ ...candidate, datasetId: null }), /valid canonical/i)
  assert.throws(() => grade5AcquisitionTargetSet({ ...candidate, tier1: [] }), /canonical Tier 1/i)
})
