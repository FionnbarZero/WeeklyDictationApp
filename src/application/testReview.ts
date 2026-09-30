import type { SessionAnswer, Word } from '../domain.ts'
import type { TestReviewCompletion } from '../testReview/contracts.ts'

export function writingSessionAnswers<TWord extends Word>(
  completion: TestReviewCompletion<TWord>,
): SessionAnswer[] {
  if (completion.mode !== 'writing') {
    throw new Error('A reading Test Review cannot become Tier 1 writing answers.')
  }
  return completion.assessments.map((assessment) => {
    if (assessment.collectionMethod !== 'timer' && assessment.collectionMethod !== 'skip_timer') {
      throw new Error('A writing Test Review contains an invalid collection method.')
    }
    return {
      word: assessment.target,
      correct: assessment.correct,
      revealMethod: assessment.collectionMethod,
    }
  })
}
