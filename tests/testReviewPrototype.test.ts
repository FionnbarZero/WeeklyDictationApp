import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GRADE2_TEST_REVIEW_WEEK,
  termsForPrototypeMode,
} from '../src/testReviewPrototype/model.ts'
import {
  assessTestReviewTarget,
  createTestReviewState,
  testReviewIsComplete,
  testReviewScore,
} from '../src/testReview/state.ts'

test('the Grade 2 one-week prototype uses the complete corrected writing and reading cohorts', () => {
  assert.deepEqual(GRADE2_TEST_REVIEW_WEEK.writingTerms.map((term) => term.text), ['比如', '部分', '更', '方便', '美好'])
  assert.deepEqual(GRADE2_TEST_REVIEW_WEEK.readingTerms.map((term) => term.text), ['城市', '上班', '公园', '图书馆', '散步', '漂亮', '各种各样的'])
  assert.equal(termsForPrototypeMode('writing').length, 5)
  assert.equal(termsForPrototypeMode('reading').length, 7)
})

test('the final review cannot complete until every collected term is assessed', () => {
  const terms = termsForPrototypeMode('writing')
  let review = createTestReviewState(terms)
  assert.equal(testReviewIsComplete(review), false)
  assert.deepEqual(testReviewScore(review), { attempted: 0, correct: 0, total: 5 })

  terms.forEach((term, index) => {
    review = assessTestReviewTarget(review, term.id, index === 1 ? 'incorrect' : 'correct')
  })

  assert.equal(testReviewIsComplete(review), true)
  assert.deepEqual(testReviewScore(review), { attempted: 5, correct: 4, total: 5 })
})

test('final-review assessments can be changed before submission without changing order', () => {
  const terms = termsForPrototypeMode('reading')
  const initial = createTestReviewState(terms)
  const incorrect = assessTestReviewTarget(initial, terms[0].id, 'incorrect')
  const corrected = assessTestReviewTarget(incorrect, terms[0].id, 'correct')

  assert.deepEqual(corrected.orderedTargetIds, initial.orderedTargetIds)
  assert.equal(corrected.assessments[terms[0].id], 'correct')
  assert.deepEqual(testReviewScore(corrected), { attempted: 1, correct: 1, total: 7 })
})
