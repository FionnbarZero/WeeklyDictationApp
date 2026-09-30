import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assessPrototypeTerm,
  createPrototypeReviewState,
  GRADE2_TEST_REVIEW_WEEK,
  prototypeReviewIsComplete,
  prototypeReviewScore,
  termsForPrototypeMode,
} from '../src/testReviewPrototype/model.ts'

test('the Grade 2 one-week prototype uses the complete corrected writing and reading cohorts', () => {
  assert.deepEqual(GRADE2_TEST_REVIEW_WEEK.writingTerms.map((term) => term.text), ['比如', '部分', '更', '方便', '美好'])
  assert.deepEqual(GRADE2_TEST_REVIEW_WEEK.readingTerms.map((term) => term.text), ['城市', '上班', '公园', '图书馆', '散步', '漂亮', '各种各样的'])
  assert.equal(termsForPrototypeMode('writing').length, 5)
  assert.equal(termsForPrototypeMode('reading').length, 7)
})

test('the final review cannot complete until every collected term is assessed', () => {
  const terms = termsForPrototypeMode('writing')
  let review = createPrototypeReviewState(terms)
  assert.equal(prototypeReviewIsComplete(review), false)
  assert.deepEqual(prototypeReviewScore(review), { attempted: 0, correct: 0, total: 5 })

  terms.forEach((term, index) => {
    review = assessPrototypeTerm(review, term.id, index === 1 ? 'incorrect' : 'correct')
  })

  assert.equal(prototypeReviewIsComplete(review), true)
  assert.deepEqual(prototypeReviewScore(review), { attempted: 5, correct: 4, total: 5 })
})

test('final-review assessments can be changed before submission without changing order', () => {
  const terms = termsForPrototypeMode('reading')
  const initial = createPrototypeReviewState(terms)
  const incorrect = assessPrototypeTerm(initial, terms[0].id, 'incorrect')
  const corrected = assessPrototypeTerm(incorrect, terms[0].id, 'correct')

  assert.deepEqual(corrected.orderedTermIds, initial.orderedTermIds)
  assert.equal(corrected.assessments[terms[0].id], 'correct')
  assert.deepEqual(prototypeReviewScore(corrected), { attempted: 1, correct: 1, total: 7 })
})
