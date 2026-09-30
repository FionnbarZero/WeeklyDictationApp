import { ArrowLeft, Headphones, Volume2, X } from 'lucide-react'
import { SelfAssessmentActions } from '../practice/SelfAssessmentActions.tsx'
import type { TestReviewMode, TestReviewState, TestReviewTarget } from './contracts.ts'
import {
  playRetainedReadingClip,
  type RetainedReadingCapture,
} from './retainedReadingClips.ts'
import { testReviewIsComplete, testReviewScore } from './state.ts'

export type FinalReviewPageProps<TTarget extends TestReviewTarget> = {
  readonly mode: TestReviewMode
  readonly targets: readonly TTarget[]
  readonly captures: readonly RetainedReadingCapture[]
  readonly review: TestReviewState
  readonly onAssess: (targetId: string, correct: boolean) => void
  readonly onPlayReference: (target: TTarget) => Promise<void>
  readonly onExit: () => void
  readonly onSkip?: () => void
  readonly onSubmit: () => void
  readonly exitLabel?: string
  readonly skipLabel?: string
}

async function playReadingComparison<TTarget extends TestReviewTarget>(
  clip: NonNullable<RetainedReadingCapture['clip']>,
  target: TTarget,
  onPlayReference: (target: TTarget) => Promise<void>,
) {
  await playRetainedReadingClip(clip)
  await onPlayReference(target)
}

export function FinalReviewPage<TTarget extends TestReviewTarget>({
  mode,
  targets,
  captures,
  review,
  onAssess,
  onPlayReference,
  onExit,
  onSkip,
  onSubmit,
  exitLabel = 'Exit review',
  skipLabel = 'Skip Test Review',
}: FinalReviewPageProps<TTarget>) {
  const complete = testReviewIsComplete(review)
  const score = testReviewScore(review)
  const capturesByTargetId = new Map(captures.map((capture) => [capture.targetId, capture]))

  return <div className="deferred-final-review">
    <div className="practice-top">
      <button className="back-button" type="button" onClick={onExit}><X size={18} /> {exitLabel}</button>
      <span className="practice-count">Final review<span> · {score.attempted} of {score.total} assessed</span></span>
      {onSkip && <button className="replay-button" type="button" onClick={onSkip}>{skipLabel}</button>}
    </div>
    <header className="deferred-review-header">
      <p className="eyebrow">All responses are now complete</p>
      <h1>Review everything<br /><em>on one final page.</em></h1>
      <p>{mode === 'writing'
        ? 'Compare every revealed word with the child’s paper, then mark each response.'
        : 'Play the child’s recording and the model pronunciation for each word, then mark each response.'}</p>
    </header>
    <section className="deferred-review-list" aria-label="Final response review">
      {targets.map((target, index) => {
        const assessment = review.assessments[target.id] || null
        const capture = capturesByTargetId.get(target.id)
        return <article key={target.id} className={`deferred-review-row ${assessment ? `is-${assessment}` : ''}`}>
          <div className="deferred-review-number">{index + 1}</div>
          <div className="deferred-review-content">
            <p className="answer-label">{mode === 'writing' ? 'The word was' : 'Compare this reading'}</p>
            {mode === 'writing'
              ? <><div className="deferred-review-word" lang="zh-Hans">{target.text}</div><p>Compare this word with the response on paper.</p></>
              : <>
                <div className="deferred-reading-review-target">
                  <div className="deferred-review-word" lang="zh-Hans">{target.text}</div>
                  {capture?.clip && <div className="deferred-compare-control">
                    <button
                      className="deferred-compare-button"
                      type="button"
                      aria-label="Check Yourself"
                      onClick={() => void playReadingComparison(capture.clip!, target, onPlayReference).catch(() => undefined)}
                    ><Headphones size={28} /></button>
                    <span>Check Yourself</span>
                  </div>}
                </div>
                {!capture?.clip && <div className="deferred-inline-actions">
                  <span className="deferred-missing-recording">No recording was captured</span>
                  <button className="replay-button" type="button" onClick={() => void onPlayReference(target).catch(() => undefined)}><Volume2 size={16} /> Hear the word</button>
                </div>}
              </>}
          </div>
          <SelfAssessmentActions
            onIncorrect={() => onAssess(target.id, false)}
            onCorrect={() => onAssess(target.id, true)}
            incorrectLabel="Not yet"
            correctLabel="Yes"
          />
        </article>
      })}
    </section>
    <footer className="deferred-submit-bar">
      <div><strong>{score.correct} correct</strong><span>{complete ? 'Ready to finalize this result.' : `Assess ${score.total - score.attempted} more response${score.total - score.attempted === 1 ? '' : 's'}.`}</span></div>
      <button className="primary-button" type="button" disabled={!complete} onClick={onSubmit}>Submit final review <ArrowLeft size={17} /></button>
    </footer>
  </div>
}
