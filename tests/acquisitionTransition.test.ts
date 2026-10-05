import assert from 'node:assert/strict'
import test from 'node:test'
import {
  answerAcquisitionPrompt,
  revealAcquisitionPrompt,
  startAcquisitionFlow,
  transitionAcquisitionPrompt,
  type AcquisitionFlow,
  type Dataset,
  type RevealMethod,
} from '../src/domain.ts'

const dataset: Dataset = {
  id: 'transition-set',
  dateRange: '9/21–9/25',
  startDate: '2026-09-21',
  endDate: '2026-09-25',
  grade: 'Grade 2',
  schoolYear: '2026–2027',
  description: 'Acquisition transition fixture',
  words: [
    { id: 'transition-word-1', text: '比如', sentence: '比如，我喜欢阅读。', datasetId: 'transition-set', grade: 'Grade 2', sourceSlideId: 'transition-slide', language: 'mandarin', tier: 'tier-1', activityType: 'dictation', audio: { storagePath: 'audio/transition-word-1.mp3', voice: 'test' } },
    { id: 'transition-word-2', text: '部分', sentence: '', datasetId: 'transition-set', grade: 'Grade 2', sourceSlideId: 'transition-slide', language: 'mandarin', tier: 'tier-1', activityType: 'dictation' },
  ],
}

function review(
  flow: AcquisitionFlow,
  correct = true,
  random: () => number = () => 0,
  revealMethod: RevealMethod = 'timer',
) {
  return transitionAcquisitionPrompt(revealAcquisitionPrompt(flow), dataset, 'Grade 2', correct, revealMethod, random)
}

function advance(flow: AcquisitionFlow, correct = true, random: () => number = () => 0) {
  return review(flow, correct, random).nextFlow
}

test('missing and unrevealed prompts produce no assessment or flow change', () => {
  const started = startAcquisitionFlow(dataset, 'Grade 2', () => 0)
  const unrevealed = transitionAcquisitionPrompt(started, dataset, 'Grade 2', true, 'timer', () => 0)
  assert.equal(unrevealed.nextFlow, started)
  assert.equal(unrevealed.assessment, undefined)

  const noPrompt = { ...started, prompt: null }
  const missing = transitionAcquisitionPrompt(noPrompt, dataset, 'Grade 2', true, 'timer', () => 0)
  assert.equal(missing.nextFlow, noPrompt)
  assert.equal(missing.assessment, undefined)
})

test('an assessment describes the answered prompt rather than the next prompt', () => {
  const started = startAcquisitionFlow(dataset, 'Grade 2', () => 0)
  const answeredPrompt = started.prompt!
  const transition = review(started, false, () => 0, 'skip_timer')

  assert.equal(transition.assessment?.promptId, answeredPrompt.id)
  assert.equal(transition.assessment?.targetOccurrenceId, answeredPrompt.word.id)
  assert.equal(transition.assessment?.target, answeredPrompt.word)
  assert.equal(transition.assessment?.kind, 'familiar-dt')
  assert.equal(transition.assessment?.correct, false)
  assert.equal(transition.assessment?.countsTowardWeeklyScore, false)
  assert.equal(transition.assessment?.dtPoolType, 'familiar')
  assert.equal(transition.assessment?.revealMethod, 'skip_timer')
  assert.notEqual(transition.nextFlow.prompt?.id, answeredPrompt.id)
})

test('show-copy advances without producing an assessment', () => {
  let flow = startAcquisitionFlow(dataset, 'Grade 2', () => 0)
  flow = advance(flow)
  flow = advance(flow)
  assert.equal(flow.prompt?.kind, 'show-copy')

  const transition = review(flow, false)
  assert.equal(transition.assessment, undefined)
  assert.equal(transition.nextFlow.prompt?.kind, 'target')
})

test('weekly hidden targets remain weekly-scored through Correction', () => {
  let flow = startAcquisitionFlow(dataset, 'Grade 2', () => 0)
  flow = advance(flow)
  flow = advance(flow)
  flow = advance(flow)
  assert.equal(flow.prompt?.kind, 'target')

  const transition = review(flow, false)
  assert.equal(transition.assessment?.kind, 'target')
  assert.equal(transition.assessment?.target, flow.prompt?.word)
  assert.equal(transition.assessment?.countsTowardWeeklyScore, true)
  assert.equal(transition.assessment?.dtPoolType, undefined)
  assert.equal(transition.nextFlow.phase, 'correction')

  flow = advance(transition.nextFlow)
  flow = advance(flow)
  flow = advance(flow)
  assert.equal(flow.phase, 'correction')
  assert.equal(flow.prompt?.kind, 'target')
  const correctionAssessment = review(flow, true)
  assert.equal(correctionAssessment.assessment?.kind, 'target')
  assert.equal(correctionAssessment.assessment?.countsTowardWeeklyScore, true)
  assert.equal(correctionAssessment.assessment?.dtPoolType, undefined)
})

test('Earned-DT trials and their Correction targets count toward the official Acquisition score', () => {
  let flow = startAcquisitionFlow(dataset, 'Grade 2', () => 0)
  while (flow.targetIndex === 0) flow = advance(flow)
  while (flow.phase === 'introduction') flow = advance(flow)
  flow = advance(flow, true, () => 0.75)
  flow = advance(flow, true, () => 0.75)
  assert.equal(flow.prompt?.kind, 'earned-dt')

  const earnedAssessment = review(flow, false)
  assert.equal(earnedAssessment.assessment?.kind, 'earned-dt')
  assert.equal(earnedAssessment.assessment?.countsTowardWeeklyScore, true)
  assert.equal(earnedAssessment.assessment?.dtPoolType, 'earned')
  flow = earnedAssessment.nextFlow

  flow = advance(flow)
  flow = advance(flow)
  flow = advance(flow)
  assert.equal(flow.phase, 'correction')
  assert.equal(flow.prompt?.kind, 'target')

  const correctionAssessment = review(flow, true)
  assert.equal(correctionAssessment.assessment?.kind, 'target')
  assert.equal(correctionAssessment.assessment?.target, flow.prompt?.word)
  assert.equal(correctionAssessment.assessment?.countsTowardWeeklyScore, true)
  assert.equal(correctionAssessment.assessment?.dtPoolType, 'earned')
})

test('the compatibility answer API still returns exactly the transition next flow', () => {
  const flow = revealAcquisitionPrompt(startAcquisitionFlow(dataset, 'Grade 2', () => 0))
  const compatibility = answerAcquisitionPrompt(flow, dataset, 'Grade 2', true, () => 0.25)
  const transition = transitionAcquisitionPrompt(flow, dataset, 'Grade 2', true, 'timer', () => 0.25)
  assert.deepEqual(compatibility, transition.nextFlow)
})
