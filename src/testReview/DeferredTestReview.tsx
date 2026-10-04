import { useEffect, useRef, useState } from 'react'
import { Headphones, X } from 'lucide-react'
import { useDialogFocus } from '../accessibility/useDialogFocus.ts'
import { emptyWritingPadState, type WritingPadState } from '../skywriting/model.ts'
import type { WritingPadStateUpdater } from '../skywriting/WritingPad.tsx'
import type {
  TestReviewCompletion,
  TestReviewCollectionMethod,
  TestReviewMode,
  TestReviewState,
  TestReviewTarget,
} from './contracts.ts'
import { FinalReviewPage } from './FinalReviewPage.tsx'
import { ReadingResponseCollector } from './ReadingResponseCollector.tsx'
import { releaseRetainedReadingCaptures, type RetainedReadingCapture } from './retainedReadingClips.ts'
import { assessTestReviewTarget, completeTestReview, createTestReviewState } from './state.ts'
import { WritingResponseCollector } from './WritingResponseCollector.tsx'
import './testReview.css'
import {
  promptAudioCompleted,
  promptAudioStarted,
  stopActiveAudio,
  type PromptAudioAttempt,
} from '../audio/promptAudio.ts'

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
}

export function DeferredTestReview<TTarget extends TestReviewTarget>({
  mode,
  targets,
  activityLabel,
  writingTimerSeconds = 10,
  onPlayReference,
  onPlayWritingPrompt,
  onDiscard,
  onComplete,
  exitLabel = 'Exit without saving',
  sessionNote = 'No answers are scored during collection.',
}: DeferredTestReviewProps<TTarget>) {
  const [phase, setPhase] = useState<'collect' | 'review'>('collect')
  const [index, setIndex] = useState(0)
  const [review, setReview] = useState<TestReviewState>(() => createTestReviewState(targets))
  const [captures, setCaptures] = useState<RetainedReadingCapture[]>([])
  const [writingByTargetId, setWritingByTargetId] = useState<Record<string, WritingPadState>>({})
  const [writingAudio, setWritingAudio] = useState<{ status: 'loading' | 'ready' | 'error'; error: string | null }>({ status: 'loading', error: null })
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
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

  function submit() {
    if (submittedRef.current) return
    const completion = completeTestReview(mode, targets, review, collectionMethodsRef.current)
    submittedRef.current = true
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
      const started = attempt ? promptAudioStarted(attempt) : onPlayReference(activeTarget)
      void started.then(() => {
        if (writingPlaybackRef.current !== playback) return
        setWritingAudio({ status: 'ready', error: null })
        if (attempt) void promptAudioCompleted(attempt).catch((audioError) => {
          if (writingPlaybackRef.current !== playback) return
          setWritingAudio({
            status: 'error',
            error: audioError instanceof Error ? audioError.message : 'Audio could not play.',
          })
        })
      }).catch((audioError) => {
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
    const started = attempt ? promptAudioStarted(attempt) : onPlayReference(activeTarget)
    void started.then(() => {
      if (writingPlaybackRef.current !== playback) return
      setWritingAudio({ status: 'ready', error: null })
      if (attempt) void promptAudioCompleted(attempt).catch((audioError) => {
        if (writingPlaybackRef.current !== playback) return
        setWritingAudio({
          status: 'error',
          error: audioError instanceof Error ? audioError.message : 'Audio could not play.',
        })
      })
    }).catch((audioError) => {
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
      <div className="deferred-test-review deferred-empty-review">
        <p className="error-banner">This Test Review has no available targets.</p>
        <button className="back-button" type="button" onClick={() => setConfirmingDiscard(true)}>
          <X size={18} /> {exitLabel}
        </button>
        {discardConfirmation}
      </div>
    )
  }

  if (phase === 'review')
    return (
      <div className="deferred-test-review">
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
          onRequestDiscard={() => setConfirmingDiscard(true)}
          onSubmit={submit}
          exitLabel={exitLabel}
        />
        {discardConfirmation}
      </div>
    )

  const progress = Math.round((index / targets.length) * 100)
  return (
    <div className="deferred-test-review deferred-collection-review">
      <div className="practice-top">
        <button className="back-button" type="button" onClick={() => setConfirmingDiscard(true)}>
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
      <div className="practice-progress">
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
