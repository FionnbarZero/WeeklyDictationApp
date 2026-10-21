import { Headphones, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useDialogFocus } from '../accessibility/useDialogFocus.ts'
import { hasFamilyActivityOwner, pauseForReport, pauseToFamilyHub } from '../activity/activityLifecycle.ts'
import { emptyWritingPadState, type WritingPadState } from '../skywriting/model.ts'
import type { WritingPadStateUpdater } from '../skywriting/WritingPad.tsx'
import type {
  TestReviewCollectionMethod,
  TestReviewCompletion,
  TestReviewMode,
  TestReviewState,
  TestReviewTarget,
} from './contracts.ts'
import { FinalReviewPage } from './FinalReviewPage.tsx'
import { ReadingResponseCollector } from './ReadingResponseCollector.tsx'
import { type RetainedReadingCapture, releaseRetainedReadingCaptures } from './retainedReadingClips.ts'
import { assessTestReviewTarget, completeTestReview, createTestReviewState } from './state.ts'
import { WritingResponseCollector } from './WritingResponseCollector.tsx'
import './testReview.css'
import {
  type PromptAudioAttempt,
  promptAudioCompleted,
  promptAudioStarted,
  stopActiveAudio,
} from '../audio/promptAudio.ts'
import { TARGET_WRITING_RESPONSE_SECONDS } from '../practice/writingTimer.ts'
import { regressionPreview } from '../regressionPreview/policy.ts'

export type DeferredTestReviewProps<TTarget extends TestReviewTarget> = {
  readonly mode: TestReviewMode
  readonly targets: readonly TTarget[]
  readonly activityLabel: string
  readonly writingTimerSeconds?: number
  readonly onPlayReference: (target: TTarget) => Promise<void>
  readonly onPlayWritingPrompt?: (target: TTarget) => PromptAudioAttempt
  readonly onDiscard: () => void
  readonly onComplete: (completion: TestReviewCompletion<TTarget>) => void
  readonly exitLabel?: string
  readonly sessionNote?: string
  readonly retrySaveFailures?: boolean
}

export function DeferredTestReview<TTarget extends TestReviewTarget>({
  mode,
  targets,
  activityLabel,
  writingTimerSeconds = TARGET_WRITING_RESPONSE_SECONDS,
  onPlayReference,
  onPlayWritingPrompt,
  onDiscard,
  onComplete,
  exitLabel = 'Exit without saving',
  sessionNote = 'No answers are scored during collection.',
  retrySaveFailures = false,
}: DeferredTestReviewProps<TTarget>) {
  const [phase, setPhase] = useState<'collect' | 'review'>('collect')
  const [index, setIndex] = useState(0)
  const [review, setReview] = useState<TestReviewState>(() => createTestReviewState(targets))
  const [captures, setCaptures] = useState<RetainedReadingCapture[]>([])
  const [writingByTargetId, setWritingByTargetId] = useState<Record<string, WritingPadState>>({})
  const [writingAudio, setWritingAudio] = useState<{ status: 'loading' | 'ready' | 'error'; error: string | null }>({
    status: 'loading',
    error: null,
  })
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [submitError, setSubmitError] = useState('')
  useEffect(() => {
    if (confirmingDiscard) return pauseForReport()
  }, [confirmingDiscard])
  const pauseButton = !regressionPreview && hasFamilyActivityOwner() && (
    <button className="back-button" type="button" onClick={pauseToFamilyHub}>
      Pause and return
    </button>
  )
  const capturesRef = useRef<RetainedReadingCapture[]>([])
  const collectionMethodsRef = useRef<Record<string, TestReviewCollectionMethod>>({})
  const submittedRef = useRef(false)
  const writingPlaybackRef = useRef(0)
  const discardDialogRef = useDialogFocus<HTMLElement>(confirmingDiscard, () => setConfirmingDiscard(false))
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
    stopActiveAudio()
    setPhase('review')
  }

  function updateWriting(targetId: string, update: WritingPadStateUpdater) {
    setWritingByTargetId((current) => ({
      ...current,
      [targetId]: update(current[targetId] || emptyWritingPadState),
    }))
  }

  function advanceWriting(method: 'timer' | 'skip_timer') {
    if (!activeTarget) return
    stopActiveAudio()
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

  function discard() {
    stopActiveAudio()
    releaseCaptures()
    setWritingByTargetId({})
    setConfirmingDiscard(false)
    onDiscard()
  }
  const requestDiscard = () => (regressionPreview ? discard() : setConfirmingDiscard(true))

  function submit() {
    if (submittedRef.current) return
    const completion = completeTestReview(mode, targets, review, collectionMethodsRef.current)
    submittedRef.current = true
    if (retrySaveFailures) {
      try {
        onComplete(completion)
        releaseCaptures()
        setWritingByTargetId({})
        setSubmitError('')
      } catch {
        submittedRef.current = false
        setSubmitError(
          'Your result could not be saved. Your review is still here. Please try Submit final review again.',
        )
      }
      return
    }
    releaseCaptures()
    setWritingByTargetId({})
    onComplete(completion)
  }

  useEffect(
    () => () => {
      stopActiveAudio()
      releaseRetainedReadingCaptures(capturesRef.current)
    },
    [],
  )

  useEffect(() => {
    if (phase === 'collect' && mode === 'writing' && activeTarget) {
      const playback = writingPlaybackRef.current + 1
      writingPlaybackRef.current = playback
      setWritingAudio({ status: 'loading', error: null })
      const attempt = onPlayWritingPrompt?.(activeTarget)
      const started = attempt ? promptAudioStarted(attempt) : Promise.resolve()
      const completed = attempt ? promptAudioCompleted(attempt) : onPlayReference(activeTarget)
      void started.catch((audioError) => {
        if (writingPlaybackRef.current !== playback) return
        setWritingAudio({
          status: 'error',
          error: audioError instanceof Error ? audioError.message : 'Audio could not play.',
        })
      })
      void completed
        .then(() => {
          if (writingPlaybackRef.current !== playback) return
          setWritingAudio({ status: 'ready', error: null })
        })
        .catch((audioError) => {
          if (writingPlaybackRef.current !== playback) return
          setWritingAudio({
            status: 'error',
            error: audioError instanceof Error ? audioError.message : 'Audio could not play.',
          })
        })
      return () => {
        writingPlaybackRef.current += 1
        stopActiveAudio()
      }
    }
  }, [phase, mode, activeTarget, onPlayReference, onPlayWritingPrompt])

  function retryWritingAudio() {
    if (mode !== 'writing' || !activeTarget) return
    const playback = writingPlaybackRef.current + 1
    writingPlaybackRef.current = playback
    setWritingAudio({ status: 'loading', error: null })
    const attempt = onPlayWritingPrompt?.(activeTarget)
    const started = attempt ? promptAudioStarted(attempt) : Promise.resolve()
    const completed = attempt ? promptAudioCompleted(attempt) : onPlayReference(activeTarget)
    void started.catch((audioError) => {
      if (writingPlaybackRef.current !== playback) return
      setWritingAudio({
        status: 'error',
        error: audioError instanceof Error ? audioError.message : 'Audio could not play.',
      })
    })
    void completed
      .then(() => {
        if (writingPlaybackRef.current !== playback) return
        setWritingAudio({ status: 'ready', error: null })
      })
      .catch((audioError) => {
        if (writingPlaybackRef.current !== playback) return
        setWritingAudio({
          status: 'error',
          error: audioError instanceof Error ? audioError.message : 'Audio could not play.',
        })
      })
  }

  useEffect(() => {
    if (phase === 'review') window.scrollTo({ top: 0, behavior: 'auto' })
  }, [phase])

  const discardConfirmation = confirmingDiscard && (
    <div className="deferred-discard-backdrop" role="presentation">
      <section
        ref={discardDialogRef}
        className="deferred-discard-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deferred-discard-title"
        tabIndex={-1}
      >
        <p className="eyebrow">Unfinished Final Boss</p>
        <h2 id="deferred-discard-title">Exit without saving?</h2>
        <p>Your collected writing or temporary recordings and every unfinished assessment will be discarded.</p>
        <div className="deferred-discard-actions">
          <button className="replay-button" type="button" onClick={() => setConfirmingDiscard(false)}>
            Keep working
          </button>
          <button className="deferred-confirm-discard" type="button" onClick={discard}>
            Exit without saving
          </button>
        </div>
      </section>
    </div>
  )

  if (targets.length === 0 || (!activeTarget && phase === 'collect')) {
    return (
      <div
        className="deferred-test-review deferred-empty-review"
        data-report-activity={`${mode} final test`}
        data-report-phase="no-targets"
      >
        <p className="error-banner">This Test Review has no available targets.</p>
        <button className="back-button" type="button" onClick={requestDiscard}>
          <X size={18} /> {exitLabel}
        </button>
        {discardConfirmation}
      </div>
    )
  }

  if (phase === 'review')
    return (
      <div className="deferred-test-review" data-report-activity={`${mode} final test`} data-report-phase="review">
        {pauseButton}
        {submitError && (
          <p role="alert" className="error-banner">
            {submitError}
          </p>
        )}
        <FinalReviewPage
          mode={mode}
          targets={targets}
          captures={captures}
          writingByTargetId={writingByTargetId}
          review={review}
          onAssess={(targetId, correct) =>
            setReview((current) => assessTestReviewTarget(current, targetId, correct ? 'correct' : 'incorrect'))
          }
          onPlayReference={onPlayReference}
          onRequestDiscard={requestDiscard}
          onSubmit={submit}
          exitLabel={exitLabel}
        />
        {discardConfirmation}
      </div>
    )

  const progress = Math.round((index / targets.length) * 100)
  return (
    <div
      className="deferred-test-review deferred-collection-review"
      data-report-activity={`${mode} final test`}
      data-report-phase="collect"
      data-report-target={activeTarget?.id}
      data-report-position={index + 1}
    >
      <div className="practice-top">
        {pauseButton}
        <button className="back-button" type="button" onClick={requestDiscard}>
          <X size={18} /> {exitLabel}
        </button>
        <span className="practice-count">
          {mode === 'writing' ? 'Writing' : 'Reading'} responses
          <span>
            {' '}
            · {index + 1} of {targets.length}
          </span>
        </span>
      </div>
      <div
        className="practice-progress"
        role="progressbar"
        aria-label="Test Review progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <section className="prompt-card deferred-collection-card">
        <div className="prompt-meta">
          <span className="set-chip chip-test-review">{activityLabel}</span>
          <span className="review-label">Collect first</span>
        </div>
        {mode === 'writing' ? (
          <WritingResponseCollector
            key={activeTarget.id}
            target={activeTarget}
            position={index + 1}
            timerSeconds={writingTimerSeconds}
            audioStatus={writingAudio.status}
            audioError={writingAudio.error}
            padState={writingByTargetId[activeTarget.id] || emptyWritingPadState}
            onPadStateChange={(update) => updateWriting(activeTarget.id, update)}
            onRetryAudio={retryWritingAudio}
            onCollected={advanceWriting}
          />
        ) : (
          <ReadingResponseCollector key={activeTarget.id} target={activeTarget} onCollected={collectReading} />
        )}
      </section>
      <p className="practice-footnote">
        <Headphones size={14} /> {sessionNote}
      </p>
      {discardConfirmation}
    </div>
  )
}
