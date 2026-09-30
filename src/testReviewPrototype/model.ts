import type { TestReviewMode, TestReviewTarget } from '../testReview/contracts.ts'

export type PrototypeTerm = TestReviewTarget

export const GRADE2_TEST_REVIEW_WEEK = {
  grade: 'Grade 2',
  dateRange: '9/21–9/25',
  sourceReference: 'Grade 2 deck · Week 9/21–9/25 · prototype correction',
  writingTerms: ['比如', '部分', '更', '方便', '美好'].map((text, index) => ({
    id: `grade2-0921-writing-${index + 1}`,
    text,
  })),
  readingTerms: ['城市', '上班', '公园', '图书馆', '散步', '漂亮', '各种各样的'].map((text, index) => ({
    id: `grade2-0921-reading-${index + 1}`,
    text,
  })),
} as const

export function termsForPrototypeMode(mode: TestReviewMode): readonly PrototypeTerm[] {
  return mode === 'writing'
    ? GRADE2_TEST_REVIEW_WEEK.writingTerms
    : GRADE2_TEST_REVIEW_WEEK.readingTerms
}
