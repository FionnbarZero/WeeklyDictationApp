import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  ESTABLISHED_DT_WORDS,
  answerAcquisitionPrompt,
  revealAcquisitionPrompt,
  resumeAcquisitionFlow,
  startAcquisitionFlow,
  type AcquisitionFlow,
  type Dataset,
} from '../src/domain.ts'

type GoldenTrace = {
  id?: string
  kind?: string
  phase: string
  step: number
  timer?: number
  targetIndex: number
  wordId?: string
}

type GoldenFixture = {
  startedFlowSha256: string
  mismatchedResumeSha256: string
  emptyUnsupportedSha256: string
  establishedTargetsSha256: string
  establishedTargetIds: string[]
  trace: GoldenTrace[]
  belowHalfKind: string
  atHalfKind: string
  atHalfWordId: string
  functionLengths: number[]
}

const golden = JSON.parse(readFileSync(new URL('./fixtures/acquisition-engine-golden.json', import.meta.url), 'utf8')) as GoldenFixture

const dataset: Dataset = {
  id: 'golden-set',
  dateRange: '9/21–9/25',
  startDate: '2026-09-21',
  endDate: '2026-09-25',
  grade: 'Grade 2',
  schoolYear: '2026–2027',
  description: 'Golden Acquisition dataset',
  words: [
    {
      id: 'golden-word-1',
      text: '比如',
      sentence: '比如，我喜欢阅读。',
      datasetId: 'golden-set',
      grade: 'Grade 2',
      sourceSlideId: 'golden-slide',
      language: 'mandarin',
      tier: 'tier-1',
      activityType: 'dictation',
      audio: { storagePath: 'audio/golden-word-1.mp3', voice: 'test' },
    },
    {
      id: 'golden-word-2',
      text: '部分',
      sentence: '',
      datasetId: 'golden-set',
      grade: 'Grade 2',
      sourceSlideId: 'golden-slide',
      language: 'mandarin',
      tier: 'tier-1',
      activityType: 'dictation',
    },
  ],
}

function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function answer(flow: AcquisitionFlow, correct = true, random: () => number = () => 0) {
  return answerAcquisitionPrompt(revealAcquisitionPrompt(flow), dataset, 'Grade 2', correct, random)
}

function traceFrom(flow: AcquisitionFlow, count: number) {
  const trace: GoldenTrace[] = []
  let current = flow
  for (let index = 0; index < count && !current.complete; index += 1) {
    trace.push({
      id: current.prompt?.id,
      kind: current.prompt?.kind,
      phase: current.phase,
      step: current.step,
      timer: current.prompt?.timerSeconds,
      targetIndex: current.targetIndex,
      wordId: current.prompt?.word.id,
    })
    current = answer(current)
  }
  return trace
}

test('the pre-extraction Grade 2 Acquisition JSON and prompt trace stay fixed', () => {
  const started = startAcquisitionFlow(dataset, 'Grade 2', () => 0)
  assert.equal(hashJson(started), golden.startedFlowSha256)
  assert.equal(hashJson(ESTABLISHED_DT_WORDS), golden.establishedTargetsSha256)
  assert.deepEqual(ESTABLISHED_DT_WORDS.map((word) => word.id), golden.establishedTargetIds)
  assert.deepEqual(traceFrom(started, golden.trace.length), golden.trace)
})

test('the extraction preserves no-op, mismatch, empty-set, and public signature behavior', () => {
  const started = startAcquisitionFlow(dataset, 'Grade 2', () => 0)
  assert.equal(answerAcquisitionPrompt(started, dataset, 'Grade 2', true, () => 0), started)
  const noPrompt = { ...started, prompt: null }
  assert.equal(revealAcquisitionPrompt(noPrompt), noPrompt)

  const mismatchedDataset: Dataset = {
    ...dataset,
    id: 'other-set',
    words: dataset.words.map((word) => ({ ...word, datasetId: 'other-set' })),
  }
  assert.equal(hashJson(resumeAcquisitionFlow(started, mismatchedDataset, 'Grade 2', () => 0)), golden.mismatchedResumeSha256)
  assert.equal(hashJson(startAcquisitionFlow({ ...dataset, id: 'empty-set', words: [] }, 'Unsupported Grade', () => 0)), golden.emptyUnsupportedSha256)
  assert.deepEqual(
    [startAcquisitionFlow.length, resumeAcquisitionFlow.length, revealAcquisitionPrompt.length, answerAcquisitionPrompt.length],
    golden.functionLengths,
  )
  assert.deepEqual(startAcquisitionFlow(dataset, undefined, () => 0), startAcquisitionFlow(dataset, dataset.grade, () => 0))
})

test('the extraction preserves the exact 50/50 DT boundary', () => {
  let flow = startAcquisitionFlow(dataset, 'Grade 2', () => 0)
  while (flow.targetIndex === 0) flow = answer(flow)
  for (let index = 0; index < 4; index += 1) flow = answer(flow)
  flow = answer(flow)

  const belowHalf = answer(flow, true, () => 0.499999)
  const atHalf = answer(flow, true, () => 0.5)
  assert.equal(belowHalf.prompt?.kind, golden.belowHalfKind)
  assert.equal(atHalf.prompt?.kind, golden.atHalfKind)
  assert.equal(atHalf.prompt?.word.id, golden.atHalfWordId)
})

test('show-copy and Established-DT correctness remain irrelevant to progression', () => {
  const started = startAcquisitionFlow(dataset, 'Grade 2', () => 0)
  assert.deepEqual(answer(started, true), answer(started, false))

  let showCopy = answer(started)
  showCopy = answer(showCopy)
  assert.equal(showCopy.prompt?.kind, 'show-copy')
  assert.deepEqual(answer(showCopy, true), answer(showCopy, false))
})
