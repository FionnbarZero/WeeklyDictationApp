export type TestReviewPrototypeMode = 'writing' | 'reading'

export type PrototypeTerm = {
  readonly id: string
  readonly text: string
}

export type PrototypeAssessment = 'correct' | 'incorrect' | null

export type PrototypeReviewState = {
  readonly orderedTermIds: readonly string[]
  readonly assessments: Readonly<Record<string, PrototypeAssessment>>
}

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

export function termsForPrototypeMode(mode: TestReviewPrototypeMode): readonly PrototypeTerm[] {
  return mode === 'writing'
    ? GRADE2_TEST_REVIEW_WEEK.writingTerms
    : GRADE2_TEST_REVIEW_WEEK.readingTerms
}

export function createPrototypeReviewState(terms: readonly PrototypeTerm[]): PrototypeReviewState {
  return {
    orderedTermIds: terms.map((term) => term.id),
    assessments: Object.fromEntries(terms.map((term) => [term.id, null])),
  }
}

export function assessPrototypeTerm(
  state: PrototypeReviewState,
  termId: string,
  assessment: Exclude<PrototypeAssessment, null>,
): PrototypeReviewState {
  if (!state.orderedTermIds.includes(termId)) return state
  return {
    ...state,
    assessments: { ...state.assessments, [termId]: assessment },
  }
}

export function prototypeReviewIsComplete(state: PrototypeReviewState) {
  return state.orderedTermIds.every((termId) => state.assessments[termId] !== null)
}

export function prototypeReviewScore(state: PrototypeReviewState) {
  const attempted = state.orderedTermIds.filter((termId) => state.assessments[termId] !== null).length
  const correct = state.orderedTermIds.filter((termId) => state.assessments[termId] === 'correct').length
  return { attempted, correct, total: state.orderedTermIds.length }
}
