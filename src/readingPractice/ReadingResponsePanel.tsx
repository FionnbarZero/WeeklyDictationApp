import { useEffect, useRef, useState } from 'react'
import { Headphones, Mic, RotateCcw, Square, Volume2 } from 'lucide-react'
import { playManagedMediaElement, stopActiveAudio } from '../audio/promptAudio.ts'
import { SelfAssessmentActions } from '../practice/SelfAssessmentActions.tsx'
import { useAudioRecorder } from './useAudioRecorder.ts'
import { activityClock } from '../activity/activityLifecycle.ts'

export type ReadingResponsePanelProps = {
  promptId: string
  targetText: string
  assessed: boolean
  teachingPrompt?: boolean
  allowSkipTimer?: boolean
  onPlayReference: () => Promise<void>
  onPlayTeachingIntroduction?: () => Promise<void>
  onAnswer: (correct: boolean) => void | Promise<void>
  onContinue: () => void | Promise<void>
  /** Acquisition games time the response after permission and teaching audio. */
  responseSeconds?: number
  onReviewPending?: (pending: boolean) => void
}

type ComparisonStatus = 'idle' | 'playing' | 'complete' | 'error'
type TeachingAudioStatus = 'idle' | 'playing' | 'complete' | 'error'

export function ReadingResponsePanel({
  promptId,
  targetText,
  assessed,
  teachingPrompt = false,
  allowSkipTimer = false,
  onPlayReference,
  onPlayTeachingIntroduction,
  onAnswer,
  onContinue,
  responseSeconds,
  onReviewPending,
}: ReadingResponsePanelProps) {
  const recorder = useAudioRecorder(
    promptId,
    undefined,
    responseSeconds === undefined
      ? undefined
      : {
          maximumDurationMs: responseSeconds * 1000,
          preserveOnPause: true,
        },
  )
  const audioRef = useRef<HTMLAudioElement>(null)
  const submittedRef = useRef(false)
  const teachingPlaybackRef = useRef(0)
  const comparisonPlaybackRef = useRef(0)
  const teachingIntroductionRef = useRef(onPlayTeachingIntroduction)
  const [comparison, setComparison] = useState<ComparisonStatus>('idle')
  // A show/copy prompt owns its teaching audio from the first render. Starting
  // in "playing" prevents the Record control from flashing on screen before
  // the effect begins playback; recording would otherwise cancel the new-word
  // announcement through the shared audio-focus manager.
  const [teachingAudio, setTeachingAudio] = useState<TeachingAudioStatus>(() => (teachingPrompt ? 'playing' : 'idle'))
  const [withoutRecording, setWithoutRecording] = useState(false)
  const [comparisonError, setComparisonError] = useState<string | null>(null)
  const [teachingAudioError, setTeachingAudioError] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const pendingReview = useRef<{ correct: boolean; teaching: boolean } | null>(null)
  const savingReview = useRef(false)
  const [remaining, setRemaining] = useState(responseSeconds || 0)

  useEffect(() => {
    if (
      responseSeconds === undefined ||
      (recorder.status !== 'recording' && !(withoutRecording && comparison === 'idle'))
    )
      return
    const end = activityClock.now() + responseSeconds * 1000
    setRemaining(responseSeconds)
    const interval = activityClock.setInterval(
      () => setRemaining(Math.max(0, Math.ceil((end - activityClock.now()) / 1000))),
      100,
    )
    const timeout = withoutRecording
      ? activityClock.setTimeout(() => {
          void compareReadings(true)
        }, responseSeconds * 1000)
      : undefined
    return () => {
      activityClock.clearInterval(interval)
      activityClock.clearTimeout(timeout)
    }
  }, [responseSeconds, recorder.status, withoutRecording, comparison])

  teachingIntroductionRef.current = onPlayTeachingIntroduction

  async function playTeachingIntroduction() {
    if (!teachingIntroductionRef.current) return
    const playback = teachingPlaybackRef.current + 1
    teachingPlaybackRef.current = playback
    setTeachingAudio('playing')
    setTeachingAudioError(null)
    try {
      await teachingIntroductionRef.current()
      if (teachingPlaybackRef.current !== playback) return
      setTeachingAudio('complete')
    } catch {
      if (teachingPlaybackRef.current !== playback) return
      setTeachingAudio('error')
      setTeachingAudioError(
        import.meta.env.VITE_OCT26_REPORTS_PREVIEW === 'true'
          ? 'The teaching word could not play. Tap Try audio again before recording.'
          : 'The teaching audio could not play. You can try again or record the word now.',
      )
    }
  }

  useEffect(() => {
    teachingPlaybackRef.current += 1
    comparisonPlaybackRef.current += 1
    submittedRef.current = false
    setComparison('idle')
    setTeachingAudio('idle')
    setWithoutRecording(false)
    setComparisonError(null)
    setTeachingAudioError(null)
    setReviewError(null)
    pendingReview.current = null
    if (teachingPrompt && teachingIntroductionRef.current) void playTeachingIntroduction()
    return () => {
      stopActiveAudio()
      teachingPlaybackRef.current += 1
      comparisonPlaybackRef.current += 1
    }
  }, [promptId, teachingPrompt])

  async function compareReadings(skipChildRecording = withoutRecording, restart = false) {
    if (comparison === 'playing' && !restart) return
    const playback = comparisonPlaybackRef.current + 1
    comparisonPlaybackRef.current = playback
    setComparison('playing')
    setComparisonError(null)
    try {
      if (!skipChildRecording) {
        if (!audioRef.current) throw new Error('The child recording is unavailable.')
        await playManagedMediaElement(audioRef.current)
      }
      if (comparisonPlaybackRef.current !== playback) return
      await onPlayReference()
      if (comparisonPlaybackRef.current !== playback) return
      setComparison('complete')
    } catch {
      if (comparisonPlaybackRef.current !== playback) return
      setComparison('error')
      setComparisonError('The comparison could not finish. Try playback again or ask a teacher for help.')
    }
  }

  function continueWithoutRecording() {
    stopActiveAudio()
    recorder.reset()
    setWithoutRecording(true)
    setComparisonError(null)
    if (responseSeconds === undefined) void compareReadings(true)
  }

  async function commitReview() {
    const pending = pendingReview.current
    if (!pending || activityClock.paused || savingReview.current) return
    savingReview.current = true
    try {
      if (pending.teaching) await onContinue()
      else await onAnswer(pending.correct)
      if (pendingReview.current !== pending) return
      setReviewError(null)
      pendingReview.current = null
      onReviewPending?.(false)
      // The next prompt normally unmounts this panel. Release even if an owner
      // keeps the completed presentation mounted briefly.
      if (responseSeconds !== undefined) recorder.reset()
    } catch (error) {
      if (pendingReview.current !== pending) return
      setReviewError(error instanceof Error ? error.message : 'The response could not be saved. Please retry.')
    } finally {
      savingReview.current = false
    }
  }

  function submit(correct: boolean, teaching = false) {
    if (submittedRef.current || !canCompare || comparison !== 'complete' || activityClock.paused) return
    submittedRef.current = true
    stopActiveAudio()
    pendingReview.current = { correct, teaching }
    onReviewPending?.(true)
    commitReview()
  }

  function continueInstruction() {
    submit(true, true)
  }

  const recordingUnavailable = !recorder.supported || recorder.status === 'error'
  const canCompare = withoutRecording || recorder.status === 'recorded'

  useEffect(() => {
    if (recorder.status === 'recorded' && comparison === 'idle') void compareReadings(false)
  }, [recorder.status, comparison])

  return (
    <div className="reading-response">
      {recorder.pauseNotice && <p role="status">{recorder.pauseNotice}</p>}
      {reviewError && (
        <div role="alert">
          <p>{reviewError}</p>
          <button type="button" className="primary-button" onClick={commitReview}>
            Retry saving response
          </button>
        </div>
      )}
      <div className="review-heading">
        <p className="answer-label">{teachingPrompt ? 'Listen, then read this word aloud' : 'Read this word aloud'}</p>
        <div className="answer-word reading-answer-word" lang="zh-Hans">
          {targetText}
        </div>
      </div>

      {recorder.clip && <audio ref={audioRef} src={recorder.clip.url} preload="metadata" />}

      {teachingPrompt && teachingAudio === 'playing' && (
        <div className="recording-status" role="status">
          <Volume2 size={18} /> Listen: let’s learn how to say this word.
          {import.meta.env.VITE_OCT26_REPORTS_PREVIEW !== 'true' && (
            <button
              className="record-reading-button"
              type="button"
              onClick={() => {
                teachingPlaybackRef.current += 1
                stopActiveAudio()
                setTeachingAudio('idle')
                void recorder.start()
              }}
            >
              Stop audio and record my reading
            </button>
          )}
        </div>
      )}

      {teachingAudioError && (
        <div className="recording-fallback" role="alert">
          <strong>Teaching audio needs attention.</strong>
          <p>{teachingAudioError} Ask a teacher for help if it still does not play.</p>
          <button className="replay-button" type="button" onClick={() => void playTeachingIntroduction()}>
            <Volume2 size={16} /> Try audio again
          </button>
        </div>
      )}

      {!withoutRecording &&
        recorder.status === 'idle' &&
        recorder.supported &&
        teachingAudio !== 'playing' &&
        !(import.meta.env.VITE_OCT26_REPORTS_PREVIEW === 'true' && teachingPrompt && teachingAudio !== 'complete') && (
          <>
            <p className="practice-helper">
              {teachingPrompt ? 'Now tap Record and say the word.' : 'Tap Record, then read the word aloud.'}
            </p>
            <button className="record-reading-button" type="button" onClick={() => void recorder.start()}>
              <Mic size={18} /> Record my reading
            </button>
            {allowSkipTimer && (
              <button className="replay-button" type="button" onClick={continueWithoutRecording}>
                Skip Timer
              </button>
            )}
          </>
        )}

      {recorder.status === 'requesting' && (
        <div className="recording-status" role="status">
          <Mic size={18} /> Waiting for microphone permission…
        </div>
      )}

      {recorder.status === 'recording' && (
        <>
          <div className="recording-status recording-live" role="status">
            <span className="recording-dot" /> Say the word. Tap Stop when you finish.
          </div>
          <button className="stop-recording-button" type="button" onClick={recorder.stop}>
            <Square size={16} /> Stop recording
          </button>
        </>
      )}

      {responseSeconds !== undefined &&
        (recorder.status === 'recording' || (withoutRecording && comparison === 'idle')) && (
          <p className="practice-helper" role="timer" aria-label="Reading time remaining">
            {remaining} seconds remaining{withoutRecording ? ' · Say the word aloud.' : ''}
          </p>
        )}

      {recordingUnavailable &&
        !withoutRecording &&
        !(import.meta.env.VITE_OCT26_REPORTS_PREVIEW === 'true' && teachingPrompt && teachingAudio !== 'complete') && (
          <div className="recording-fallback" role="alert">
            <strong>Recording is unavailable.</strong>
            <p>
              {recorder.error?.message || 'This browser cannot record microphone audio.'} You can try again or continue
              by saying the word aloud.
            </p>
            <div className="reading-secondary-actions">
              {recorder.supported && (
                <button className="replay-button" type="button" onClick={() => void recorder.start()}>
                  <RotateCcw size={16} /> Try microphone again
                </button>
              )}
              <button className="replay-button" type="button" onClick={continueWithoutRecording}>
                Continue without recording
              </button>
            </div>
          </div>
        )}

      {comparisonError && (
        <p className="recording-error" role="alert">
          {comparisonError}
        </p>
      )}

      {canCompare && comparison !== 'idle' && (
        <div className="reading-assessment">
          <p className="practice-helper">
            {comparison === 'playing'
              ? 'Listen: your voice plays first, followed immediately by the correct word.'
              : 'Did your reading match the example?'}
          </p>
          <div className="reading-secondary-actions">
            <button
              className="replay-button"
              type="button"
              onClick={() => void compareReadings(withoutRecording, true)}
            >
              <Headphones size={16} /> {comparison === 'playing' ? 'Restart playback' : 'Replay comparison'}
            </button>
            {comparison === 'error' && !submittedRef.current && recorder.supported && (
              <button
                className="replay-button"
                type="button"
                onClick={() => {
                  comparisonPlaybackRef.current += 1
                  stopActiveAudio()
                  setComparison('idle')
                  setComparisonError(null)
                  setWithoutRecording(false)
                  void recorder.start()
                }}
              >
                <Mic size={16} /> Retry recording
              </button>
            )}
          </div>
          {assessed ? (
            <>
              <SelfAssessmentActions
                disabled={comparison !== 'complete' || submittedRef.current}
                onIncorrect={() => submit(false)}
                onCorrect={() => submit(true)}
                incorrectLabel="Not yet"
                correctLabel="Yes"
              />
              <p className="answer-note">Be honest with yourself — that’s how you grow.</p>
            </>
          ) : (
            <button
              className="primary-button reading-continue-button"
              type="button"
              disabled={comparison !== 'complete' || submittedRef.current}
              onClick={continueInstruction}
            >
              Continue
            </button>
          )}
        </div>
      )}
    </div>
  )
}
