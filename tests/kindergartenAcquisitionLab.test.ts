import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { startAcquisition, revealAcquisition } from '../src/acquisition/engine.ts'
import { transitionAcquisition } from '../src/acquisition/transition.ts'
import type { AcquisitionStrategy, AcquisitionTargetSet } from '../src/acquisition/contracts.ts'
import { grade2AcquisitionStrategy } from '../src/acquisition/strategies/grade2.ts'
import { kindergartenAcquisitionStrategy } from '../src/acquisition/strategies/kindergarten.ts'
import type { SheetsWorkbookPayload, WeeklyDatasetCandidate } from '../src/curriculum/model.ts'
import { inspectKindergartenWorkbook } from '../src/kindergartenSheetsImporter.ts'
import {
  answerKindergartenAcquisitionLab,
  kindergartenAcquisitionTargetSet,
  kindergartenCandidateIsUsableInLab,
  kindergartenWritingDatasetForLab,
  revealKindergartenAcquisitionLab,
  startKindergartenAcquisitionLab,
} from '../src/kindergartenLab/acquisitionLab.ts'
import { kindergartenWritingLabProfile } from '../src/kindergartenLab/practiceProfile.ts'
import { kindergartenUnitReviewForLab } from '../src/kindergartenLab/unitReview.ts'
import { practiceProfileForGrade } from '../src/practice/profiles/registry.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/kindergarten-workbook.json', import.meta.url), 'utf8')) as Omit<SheetsWorkbookPayload, 'sourceType'>
const candidates = inspectKindergartenWorkbook(fixture)

function week6() {
  const candidate = candidates.find((item) => item.rawDate === 'Week 6 09/21')
  assert.ok(candidate)
  return candidate
}

function semanticTrace(strategy: AcquisitionStrategy) {
  const targetSet: AcquisitionTargetSet = {
    id: 'fixture-week',
    targets: [{ id: 'fixture-target', text: '白', sentence: '', datasetId: 'fixture-week', language: 'mandarin', tier: 'tier-1', activityType: 'dictation' }],
  }
  let flow = startAcquisition(targetSet, strategy, () => 0)
  const trace: Array<Record<string, unknown>> = []
  for (let index = 0; index < 24 && flow.prompt; index += 1) {
    trace.push({
      kind: flow.prompt.kind,
      text: flow.prompt.word.text,
      timerSeconds: flow.prompt.timerSeconds,
      phase: flow.prompt.phase,
      countsTowardWeeklyScore: flow.prompt.countsTowardWeeklyScore,
      mode: flow.mode,
    })
    flow = transitionAcquisition(revealAcquisition(flow), targetSet, strategy, { correct: true, revealMethod: 'skip_timer' }, () => 0).nextFlow
  }
  return trace
}

test('Kindergarten owns a distinct strategy with behavior equivalent to Grade 2 today', () => {
  assert.notStrictEqual(kindergartenAcquisitionStrategy, grade2AcquisitionStrategy)
  assert.notStrictEqual(kindergartenAcquisitionStrategy.familiarDtTargets, grade2AcquisitionStrategy.familiarDtTargets)
  assert.notStrictEqual(kindergartenAcquisitionStrategy.familiarDtTargets[0], grade2AcquisitionStrategy.familiarDtTargets[0])
  assert.equal(kindergartenAcquisitionStrategy.id, 'kindergarten-acquisition-v1')
  assert.equal(kindergartenAcquisitionStrategy.version, 1)
  assert.deepEqual(kindergartenAcquisitionStrategy.timers, grade2AcquisitionStrategy.timers)
  assert.deepEqual(kindergartenAcquisitionStrategy.introductionSequence, grade2AcquisitionStrategy.introductionSequence)
  assert.deepEqual(kindergartenAcquisitionStrategy.expandedSequence, grade2AcquisitionStrategy.expandedSequence)
  assert.deepEqual(kindergartenAcquisitionStrategy.correctionSequence, grade2AcquisitionStrategy.correctionSequence)
  assert.deepEqual(kindergartenAcquisitionStrategy.familiarDtTargets.map((target) => target.text), grade2AcquisitionStrategy.familiarDtTargets.map((target) => target.text))
  assert.deepEqual(semanticTrace(kindergartenAcquisitionStrategy), semanticTrace(grade2AcquisitionStrategy))
})

test('the Kindergarten profile is lab-owned and absent from the production registry', () => {
  assert.equal(kindergartenWritingLabProfile.grade, 'Kindergarten')
  assert.equal(kindergartenWritingLabProfile.warmup, 'not-connected')
  assert.strictEqual(kindergartenWritingLabProfile.acquisition, kindergartenAcquisitionStrategy)
  assert.equal(practiceProfileForGrade('Kindergarten'), null)
})

test('only a source-inspected vocabulary tab blocked solely by activation policy can enter the lab', () => {
  const candidate = week6()
  assert.equal(candidate.status, 'malformed')
  assert.equal(kindergartenCandidateIsUsableInLab(candidate), true)

  const targetSet = kindergartenAcquisitionTargetSet(candidate)
  const dataset = kindergartenWritingDatasetForLab(candidate)
  assert.match(targetSet.id, /^__kindergarten-lab__/)
  assert.equal(dataset.id, targetSet.id)
  assert.deepEqual(targetSet.targets.map((target) => target.text), ['九', '十', '白'])
  assert.ok(targetSet.targets.every((target) => target.tier === 'tier-1' && target.activityType === 'dictation'))
  assert.ok(targetSet.targets.every((target) => !candidate.tier2.some((tier2) => tier2.text === target.text)))

  const extraBlocker: WeeklyDatasetCandidate = {
    ...candidate,
    validationOutcomes: [...candidate.validationOutcomes, { code: 'unexpected_problem', severity: 'error', message: 'Fixture problem.' }],
  }
  assert.equal(kindergartenCandidateIsUsableInLab(extraBlocker), false)
  assert.equal(kindergartenCandidateIsUsableInLab({ ...candidate, tier1: [] }), false)
})

test('the Kindergarten lab runs the shared engine and keeps Familiar-DT diagnostics separate', () => {
  let state = startKindergartenAcquisitionLab(week6(), () => 0)
  assert.equal(state.flow.strategyId, 'kindergarten-acquisition-v1')
  assert.equal(state.flow.prompt?.kind, 'familiar-dt')
  assert.match(state.flow.prompt?.word.id || '', /^kindergarten-familiar-dt-\d+$/)
  assert.doesNotMatch(state.flow.prompt?.word.id || '', /^familiar-dt-/)

  state = answerKindergartenAcquisitionLab(revealKindergartenAcquisitionLab(state), false, 'skip_timer', () => 0)
  assert.equal(state.assessments.length, 1)
  assert.equal(state.assessments[0].dtPoolType, 'familiar')
  assert.equal(state.assessments[0].countsTowardWeeklyScore, false)
})

test('the explicit Unit 1 lab fixture accumulates Tier 1 and preserves Tier 2 separately', () => {
  const review = kindergartenUnitReviewForLab(candidates)
  assert.equal(review.label, 'Unit 1')
  assert.equal(review.sourceWeekCount, 4)
  assert.deepEqual(review.tier1Words, ['一', '二', '三', '人', '四', '五', '六', '心', '七', '八', '水', '九', '十', '白'])
  assert.deepEqual(review.tier2Words, ['爸爸', '妈妈', '小', '我', '开心', '有', '没有', '红色', '蓝色'])
  assert.equal(review.dataset.id, '__kindergarten-unit-1-review-lab__')
  assert.equal(review.dataset.startDate, '2026-08-31')
  assert.equal(review.dataset.endDate, '2026-09-27')
  assert.ok(review.dataset.words.every((word) => word.tier === 'tier-1' && word.activityType === 'dictation'))
  assert.ok(review.tier2Words.every((word) => !review.dataset.words.some((target) => target.text === word)))
})
