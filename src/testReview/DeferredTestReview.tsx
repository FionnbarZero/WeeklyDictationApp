import { useEffect, useRef, useState } from 'react'
import { Headphones, X } from 'lucide-react'
import type {
  TestReviewCompletion,
  TestReviewCollectionMethod,
  TestReviewMode,
  TestReviewState,
  TestReviewTarget,
} from './contracts.ts'
import { FinalReviewPage } from './FinalReviewPage.tsx'
import { ReadingResponseCollector } from './ReadingResponseCollector.tsx'
import {
  releaseRetainedReadingCaptures,
  type RetainedReadingCapture,
} from './retainedReadingClips.ts'
import {
  assessTestReviewTarget,
  completeTestReview,
  createTestReviewState,
} from './state.ts'
import { WritingResponseCollector } from './WritingResponseCollector.tsx'
import './testReview.css'

export type DeferredTestReviewProps<TTarget extends TestReviewTarget> = {
  readonly mode: TestReviewMode
  readonly targets: readonly TTarget[]
  readonly activityLabel: string
  readonly writingTimerSeconds: number
  readonly onPlayReference: (target: TTarget) => Promise<void>
  readonly onExit: () => void
  readonly onSkip?: () => void
  readonly onComplete: (completion: TestReviewCompletion<TTarget>) => void
  readonly exitLabel?: string
  readonly skipLabel?: string
  readonly sessionNote?: string
}

export function DeferredTestReview<TTarget extends TestReviewTarget>({
  mode,
  targets,
  activityLabel,
  writingTimerSeconds,
  onPlayReference,
  onExit,
  onSkip,
  onComplete,
  exitLabel = 'Exit test',
  skipLabel = 'Skip Test Review',
  sessionNote = 'No answers are scored during collection.',
}: DeferredTestReviewProps<TTarget>) {
  const [phase, setPhase] = useState<'collect' | 'review'>('collect')
  const [index, setIndex] = useState(0)
  const [review, setReview] = useState<TestReviewState>(() => createTestReviewState(targets))
  const [captures, setCaptures] = useState<RetainedReadingCapture[]>([])
  const capturesRef = useRef<RetainedReadingCapture[]>([])
  const collectionMethodsRef = useRef<Record<string, TestReviewCollectionMethod>>({})
  const submittedRef = useRef(false)
  const activeTarget = targets[index]

  function replaceCaptures(next: RetainedReadingCapture[]) {
    capturesRef.current = next
    setCaptures(next)
  }

  function releaseCaptures() {
    releaseRetainedReadingCaptures(capturesRef.current)
    capturesRef.current = []
    setCaptures([])
  }

  function finishCollection() {
    window.speechSynthesis?.cancel()
    setPhase('review')
  }

  function advanceWriting(method: 'timer' | 'skip_timer') {
    if (!activeTarget) return
    collectionMethodsRef.current[activeTarget.id] = method
    if (index + 1 >= targets.length) finishCollection()
    else setIndex((current) => current + 1)
  }

  function collectReading(capture: RetainedReadingCapture) {
    collectionMethodsRef.current[capture.targetId] = capture.clip ? 'recording-comparison' : 'recording-unavailable'
    replaceCaptures([...capturesRef.current, capture])
    if (index + 1 >= targets.length) finishCollection()
    else setIndex((current) => current + 1)
  }

  function exit() {
    window.speechSynthesis?.cancel()
    releaseCaptures()
    onExit()
  }

  function skip() {
    window.speechSynthesis?.cancel()
    releaseCaptures()
    onSkip?.()
  }

  function submit() {
    if (submittedRef.current) return
    const completion = completeTestReview(mode, targets, review, collectionMethodsRef.current)
    submittedRef.current = true
    releaseCaptures()
    onComplete(completion)
  }

  useEffect(() => () => {
    window.speechSynthesis?.cancel()
    releaseRetainedReadingCaptures(capturesRef.current)
  }, [])

  useEffect(() => {
    if (phase === 'collect' && mode === 'writing' && activeTarget) {
      void onPlayReference(activeTarget).catch(() => undefined)
    }
  }, [phase, mode, activeTarget, onPlayReference])

  if (targets.length === 0 || (!activeTarget && phase === 'collect')) {
    return <div className="deferred-test-review deferred-empty-review">
      <p className="error-banner">This Test Review has no available targets.</p>
      <button className="back-button" type="button" onClick={exit}><X size={18} /> {exitLabel}</button>
    </div>
  }

  if (phase === 'review') return <div className="deferred-test-review">
    <FinalReviewPage
      mode={mode}
      targets={targets}
      captures={captures}
      review={review}
      onAssess={(targetId, correct) => setReview((current) => assessTestReviewTarget(current, targetId, correct ? 'correct' : 'incorrect'))}
      onPlayReference={onPlayReference}
      onExit={exit}
      onSkip={onSkip ? skip : undefined}
      onSubmit={submit}
      exitLabel={exitLabel}
      skipLabel={skipLabel}
    />
  </div>

  const progress = Math.round((index / targets.length) * 100)
  return <div className="deferred-test-review deferred-collection-review">
    <div className="practice-top">
      <button className="back-button" type="button" onClick={exit}><X size={18} /> {exitLabel}</button>
      <span className="practice-count">{mode === 'writing' ? 'Writing' : 'Reading'} responses<span> · {index + 1} of {targets.length}</span></span>
      {onSkip && <button className="replay-button" type="button" onClick={skip}>{skipLabel}</button>}
    </div>
    <div className="practice-progress"><span style={{ width: `${progress}%` }} /></div>
    <section className="prompt-card deferred-collection-card">
      <div className="prompt-meta"><span className="set-chip chip-test-review">{activityLabel}</span><span className="review-label">Collect first</span></div>
      {mode === 'writing'
        ? <WritingResponseCollector
          key={activeTarget.id}
          position={index + 1}
          timerSeconds={writingTimerSeconds}
          onReplay={() => void onPlayReference(activeTarget).catch(() => undefined)}
          onCollected={advanceWriting}
        />
        : <ReadingResponseCollector key={activeTarget.id} target={activeTarget} onCollected={collectReading} />}
    </section>
    <p className="practice-footnote"><Headphones size={14} /> {sessionNote}</p>
  </div>
}
