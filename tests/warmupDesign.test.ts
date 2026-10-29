import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceWarmupDesign,
  newWarmupDesign,
  reopenWarmupDesign,
  validateWarmupDesign,
} from '../src/warmupDesign/model.ts'
import { warmupGrades, warmupSamples } from '../src/warmupDesign/samples.ts'

test('Warmup correction visits each character once and repeated corrections never promote the first failure', () => {
  const lengths = [2, 4]
  let s = newWarmupDesign()
  const move = (a: Parameters<typeof advanceWarmupDesign>[1]) => {
    s = advanceWarmupDesign(s, a, lengths)
  }
  move({ type: 'compare' })
  move({ type: 'answer', correct: false })
  for (let retry = 0; retry < 3; retry++) {
    assert.equal(s.phase, 'trace')
    assert.equal(s.character, 0)
    move({ type: 'character-complete' })
    assert.equal(s.phase, 'trace')
    assert.equal(s.character, 1)
    move({ type: 'character-complete' })
    assert.equal(s.phase, 'memory')
    assert.equal(s.character, 0)
    assert.deepEqual(s.firstAnswers, [false])
    move({ type: 'compare' })
    move({ type: 'answer', correct: retry === 2 })
  }
  assert.equal(s.index, 1)
  assert.equal(s.phase, 'memory')
  move({ type: 'compare' })
  move({ type: 'answer', correct: true })
  assert.equal(s.phase, 'complete')
  assert.deepEqual(s.firstAnswers, [false, true])
  assert.equal(advanceWarmupDesign(s, { type: 'answer', correct: true }, lengths), s)
})

test('Reload repeats only an unfinished response, retaining previous first-attempt results', () => {
  let s = advanceWarmupDesign(newWarmupDesign(), { type: 'compare' }, [2])
  assert.equal(reopenWarmupDesign(s).phase, 'memory')
  s = advanceWarmupDesign(s, { type: 'answer', correct: false }, [2])
  s = advanceWarmupDesign(s, { type: 'character-complete' }, [2])
  assert.deepEqual(reopenWarmupDesign(s), s)
  assert.equal(reopenWarmupDesign(s).character, 1)
  assert.deepEqual(reopenWarmupDesign(s).firstAnswers, [false])
})

test('Malformed or impossible checkpoints fail closed', () => {
  for (const change of [
    { index: 3 },
    { phase: 'complete' },
    { character: 1 },
    { firstAnswers: [true] },
    { phase: 'trace', firstAnswers: [] },
    { revision: -1 },
    { firstAnswers: [false, true] },
  ])
    assert.throws(() => validateWarmupDesign({ ...newWarmupDesign(), ...change }, [2]))
})

test('All explicit samples retain teacher-source identity and complete character guides', () => {
  const counts = new Set<number>()
  for (const grade of warmupGrades)
    for (const sample of warmupSamples(grade)) {
      assert.equal(sample.word.tier, 'tier-1')
      assert.ok(sample.word.datasetId)
      assert.equal(sample.guides.length, [...sample.word.text].length)
      assert.ok(sample.guides.every((guide) => guide.length && guide.every((stroke) => stroke.length >= 2)))
      counts.add(sample.guides.length)
    }
  assert.deepEqual([...counts].sort(), [1, 2, 3, 4])
})
