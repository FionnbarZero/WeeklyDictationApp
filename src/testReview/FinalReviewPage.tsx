import { ArrowLeft, Headphones, Volume2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { SelfAssessmentActions } from '../practice/SelfAssessmentActions.tsx'
import { emptyWritingPadState, type WritingPadState } from '../skywriting/model.ts'
import { SkyWritingAcquisition } from '../skywriting/skywritingacquisition.tsx'
import type { TestReviewMode, TestReviewState, TestReviewTarget } from './contracts.ts'
import { playRetainedReadingClip, type RetainedReadingCapture } from './retainedReadingClips.ts'
import { testReviewIsComplete, testReviewScore } from './state.ts'

export type FinalReviewPageProps<TTarget extends TestReviewTarget> = {
  readonly mode: TestReviewMode
  readonly targets: readonly TTarget[]
  readonly captures: readonly RetainedReadingCapture[]
  readonly writingByTargetId: Readonly<Record<string, WritingPadState>>
  readonly review: TestReviewState
  readonly onAssess: (targetId: string, correct: boolean) => void
  readonly onPlayReference: (target: TTarget) => Promise<void>
  readonly onRequestDiscard: () => void
  readonly onSubmit: () => void
  readonly exitLabel?: string
}

type ReadingComparisonStatus = 'idle' | 'playing-child' | 'playing-model' | 'complete' | 'error'

function comparisonStatusText(status: ReadingComparisonStatus) {
  if (status === 'playing-child') return 'Playing the child’s reading…'
  if (status === 'playing-model') return 'Playing the correct pronunciation…'
  if (status === 'complete') return 'Comparison complete. Choose Yes or Not yet.'
  if (status === 'error') return 'Playback did not finish. Tap the headphones to try again.'
  return 'Listen before scoring'
}

export function FinalReviewPage<TTarget extends TestReviewTarget>({
  mode,
  targets,
  captures,
  writingByTargetId,
  review,
  onAssess,
  onPlayReference,
  onRequestDiscard,
  onSubmit,
  exitLabel = 'Exit without saving',
}: FinalReviewPageProps<TTarget>) {
  const [comparisonByTargetId, setComparisonByTargetId] = useState<Readonly<Record<string, ReadingComparisonStatus>>>(
    {},
  )
  const comparisonActiveRef = useRef(false)
  const complete = testReviewIsComplete(review)
  const score = testReviewScore(review)
  const capturesByTargetId = new Map(captures.map((capture) => [capture.targetId, capture]))

  function setComparisonStatus(targetId: string, status: ReadingComparisonStatus) {
    setComparisonByTargetId((current) => ({ ...current, [targetId]: status }))
  }

  async function playReadingComparison(clip: NonNullable<RetainedReadingCapture['clip']>, target: TTarget) {
    if (comparisonActiveRef.current) return
    comparisonActiveRef.current = true
    try {
      setComparisonStatus(target.id, 'playing-child')
      await playRetainedReadingClip(clip)
      setComparisonStatus(target.id, 'playing-model')
      await onPlayReference(target)
      setComparisonStatus(target.id, 'complete')
    } catch {
      setComparisonStatus(target.id, 'error')
    } finally {
      comparisonActiveRef.current = false
    }
  }

  return <div className="deferred-final-review">
    <div className="practice-top">
      <button className="back-button" type="button" onClick={onRequestDiscard}><X size={18} /> {exitLabel}</button>
      <span className="practice-count">Final review<span> · {score.attempted} of {score.total} assessed</span></span>
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
        const comparisonStatus = comparisonByTargetId[target.id] || 'idle'
        const comparisonIsPlaying = comparisonStatus === 'playing-child' || comparisonStatus === 'playing-model'
        const mustCompareBeforeScoring = mode === 'reading' && Boolean(capture?.clip)
        return <article key={target.id} className={`deferred-review-row deferred-${mode}-review-row ${assessment ? `is-${assessment}` : ''}`}>
          <div className="deferred-review-number">{index + 1}</div>
          <div className="deferred-review-content">
            <p className="answer-label">{mode === 'writing' ? 'The word was' : 'Compare this reading'}</p>
            {mode === 'writing'
              ? <>
                <p>Compare the saved on-screen response with the correct word.</p>
                <SkyWritingAcquisition
                  word={target.text}
                  phase="review"
                  traceTarget={false}
                  padState={writingByTargetId[target.id] || emptyWritingPadState}
                />
              </>
              : <>
                <div className="deferred-reading-review-target">
                  <div className="deferred-review-word" lang="zh-Hans">{target.text}</div>
                  {capture?.clip && <div className="deferred-compare-control">
                    <button
                      className="deferred-compare-button"
                      type="button"
                      aria-label={`Play my reading, then the correct pronunciation for ${target.text}`}
                      disabled={comparisonIsPlaying}
                      onClick={() => void playReadingComparison(capture.clip!, target)}
                    ><Headphones size={28} /></button>
                    <span aria-live="polite">{comparisonStatusText(comparisonStatus)}</span>
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
            disabled={mustCompareBeforeScoring && comparisonStatus !== 'complete'}
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
