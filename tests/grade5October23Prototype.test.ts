import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createWritingLesson,
  GRADE5_WRITING_POLICY,
  writingCharacterGuides,
} from '../src/application/writingAcquisition/lesson.ts'
import {
  ASSESSMENT_ID,
  readingPathway,
  readingTargets,
  shurikenPairs,
  sushiRounds,
  TARGETS,
  writingDataset,
  writingTargets,
} from '../src/grade5Oct23Prototype/content.ts'

test('October 23 uses the same eight complete targets and one identity for reading and writing', () => {
  const expected = ['或者', '了解', '完', '兴奋的', '告诉', '沟通', '快速地', '有意思']
  assert.deepEqual(
    TARGETS.map((t) => t.text),
    expected,
  )
  assert.deepEqual(
    writingTargets.map((t) => t.text),
    expected,
  )
  assert.deepEqual(
    readingTargets.map((t) => t.text),
    expected,
  )
  assert.deepEqual(
    writingTargets.map((t) => t.id),
    readingTargets.map((t) => t.id),
  )
  assert.ok([...writingTargets, ...readingTargets].every((t) => t.datasetId === ASSESSMENT_ID))
  assert.equal(readingPathway.cohorts.length, 1)
})
test('every word and every character can enter the existing Grade 5 five-step teacher', () => {
  const lesson = createWritingLesson(writingDataset, GRADE5_WRITING_POLICY)
  assert.equal(lesson.targets.length, 8)
  for (const target of TARGETS) assert.equal(writingCharacterGuides(target.text).length, [...target.text].length)
})
test('Shuriken contains only the eight exact page-two meanings with no duplicate mode copies', () => {
  assert.equal(shurikenPairs.length, 8)
  assert.deepEqual(
    shurikenPairs.map((p) => p.left.label),
    TARGETS.map((t) => t.text),
  )
  assert.deepEqual(
    shurikenPairs.map((p) => p.right.label),
    TARGETS.map((t) => t.meaning),
  )
  assert.equal(new Set(shurikenPairs.map((p) => p.targetId)).size, 8)
})
test('Sushi tokens reconstruct each exact teacher sentence and retain its target', () => {
  assert.equal(sushiRounds.length, 8)
  for (const [index, round] of sushiRounds.entries()) {
    assert.equal(round.targetText, TARGETS[index].sentence)
    assert.equal(
      round.correctTokenIds.map((id) => round.tokens.find((t) => t.id === id)!.label).join(''),
      TARGETS[index].sentence,
    )
    assert.ok(round.targetText.includes(TARGETS[index].text))
    assert.notDeepEqual(
      round.tokens.map((t) => t.id),
      round.correctTokenIds,
    )
  }
})
