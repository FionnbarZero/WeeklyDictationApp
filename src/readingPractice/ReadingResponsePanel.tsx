import { useEffect, useRef, useState } from 'react'
import { Headphones, Mic, RotateCcw, Square, Volume2 } from 'lucide-react'
import { SelfAssessmentActions } from '../practice/SelfAssessmentActions.tsx'
import { useAudioRecorder } from './useAudioRecorder.ts'

export type ReadingResponsePanelProps = {
  promptId: string
  targetText: string
  assessed: boolean
  teachingPrompt?: boolean
  onPlayReference: () => Promise<void>
  onPlayTeachingIntroduction?: () => Promise<void>
  onAnswer: (correct: boolean) => void
  onContinue: () => void
}

type ComparisonStatus = 'idle' | 'playing' | 'complete' | 'error'
type TeachingAudioStatus = 'idle' | 'playing' | 'complete' | 'error'

function playRecordedAudio(element: HTMLAudioElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      element.removeEventListener('ended', handleEnded)
      element.removeEventListener('error', handleError)
    }
    const handleEnded = () => {
      cleanup()
      resolve()
    }
    const handleError = () => {
      cleanup()
      reject(new Error('The child recording could not be played.'))
    }
    element.addEventListener('ended', handleEnded, { once: true })
    element.addEventListener('error', handleError, { once: true })
    element.currentTime = 0
    void element.play().catch((error) => {
      cleanup()
      reject(error)
    })
  })
}

export function ReadingResponsePanel({
  promptId,
  targetText,
  assessed,
  teachingPrompt = false,
  onPlayReference,
  onPlayTeachingIntroduction,
  onAnswer,
  onContinue,
}: ReadingResponsePanelProps) {
  const recorder = useAudioRecorder(promptId)
  const audioRef = useRef<HTMLAudioElement>(null)
  const submittedRef = useRef(false)
  const teachingPlaybackRef = useRef(0)
  const teachingIntroductionRef = useRef(onPlayTeachingIntroduction)
  const [comparison, setComparison] = useState<ComparisonStatus>('idle')
  const [teachingAudio, setTeachingAudio] = useState<TeachingAudioStatus>('idle')
  const [withoutRecording, setWithoutRecording] = useState(false)
  const [comparisonError, setComparisonError] = useState<string | null>(null)
  const [teachingAudioError, setTeachingAudioError] = useState<string | null>(null)

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
      setTeachingAudioError('The teaching audio could not play. You can try again or record the word now.')
    }
  }

  useEffect(() => {
    teachingPlaybackRef.current += 1
    submittedRef.current = false
    setComparison('idle')
    setTeachingAudio('idle')
    setWithoutRecording(false)
    setComparisonError(null)
    setTeachingAudioError(null)
    if (teachingPrompt && teachingIntroductionRef.current) void playTeachingIntroduction()
    return () => { teachingPlaybackRef.current += 1 }
  }, [promptId, teachingPrompt])

  async function hearMine() {
    if (!audioRef.current) return
    setComparisonError(null)
    try {
      await playRecordedAudio(audioRef.current)
    } catch {
      setComparisonError('Your recording could not be played. You can record it again.')
    }
  }

  async function hearReference() {
    setComparisonError(null)
    try {
      await onPlayReference()
    } catch {
      setComparisonError('The example pronunciation could not be played. Please try again.')
    }
  }

  async function compareReadings() {
    if (comparison === 'playing') return
    setComparison('playing')
    setComparisonError(null)
    try {
      if (!withoutRecording) {
        if (!audioRef.current) throw new Error('The child recording is unavailable.')
        await playRecordedAudio(audioRef.current)
      }
      await onPlayReference()
      setComparison('complete')
    } catch {
      setComparison('error')
      setComparisonError('The comparison could not finish. Try it again or make a new recording.')
    }
  }

  function recordAgain() {
    setComparison('idle')
    setComparisonError(null)
    setWithoutRecording(false)
    void recorder.start()
  }

  function continueWithoutRecording() {
    recorder.reset()
    setWithoutRecording(true)
    setComparison('idle')
    setComparisonError(null)
  }

  function submit(correct: boolean) {
    if (submittedRef.current || comparison !== 'complete') return
    submittedRef.current = true
    onAnswer(correct)
  }

  function continueInstruction() {
    if (submittedRef.current || comparison !== 'complete') return
    submittedRef.current = true
    onContinue()
  }

  const recordingUnavailable = !recorder.supported || recorder.status === 'error'
  const canCompare = withoutRecording || recorder.status === 'recorded'

  return <div className="reading-response">
    <div className="review-heading">
      <p className="answer-label">{teachingPrompt ? 'Listen, then read this word aloud' : 'Read this word aloud'}</p>
      <div className="answer-word reading-answer-word" lang="zh-Hans">{targetText}</div>
    </div>

    {recorder.clip && <audio ref={audioRef} src={recorder.clip.url} preload="metadata" />}

    {teachingPrompt && teachingAudio === 'playing' && <div className="recording-status" role="status">
      <Volume2 size={18} /> Listen: let’s learn how to say this word.
    </div>}

    {teachingAudioError && <p className="recording-error" role="alert">{teachingAudioError}</p>}

    {!withoutRecording && recorder.status === 'idle' && recorder.supported && teachingAudio !== 'playing' && <>
      <p className="practice-helper">{teachingPrompt ? 'Now tap Record and say the word.' : 'Tap Record, then read the word aloud.'}</p>
      <button className="record-reading-button" type="button" onClick={() => void recorder.start()}>
        <Mic size={18} /> Record my reading
      </button>
      {teachingPrompt && <button className="replay-button" type="button" onClick={() => void playTeachingIntroduction()}>
        <Volume2 size={16} /> Hear how to say it again
      </button>}
    </>}

    {recorder.status === 'requesting' && <div className="recording-status" role="status">
      <Mic size={18} /> Waiting for microphone permission…
    </div>}

    {recorder.status === 'recording' && <>
      <div className="recording-status recording-live" role="status">
        <span className="recording-dot" /> Say the word. Tap Stop when you finish.
      </div>
      <button className="stop-recording-button" type="button" onClick={recorder.stop}>
        <Square size={16} /> Stop recording
      </button>
    </>}

    {recordingUnavailable && !withoutRecording && <div className="recording-fallback" role="alert">
      <strong>Recording is unavailable.</strong>
      <p>{recorder.error?.message || 'This browser cannot record microphone audio.'} You can try again or continue by saying the word aloud.</p>
      <div className="reading-secondary-actions">
        {recorder.supported && <button className="replay-button" type="button" onClick={() => void recorder.start()}><RotateCcw size={16} /> Try microphone again</button>}
        <button className="replay-button" type="button" onClick={continueWithoutRecording}>Continue without recording</button>
      </div>
    </div>}

    {canCompare && comparison !== 'complete' && <>
      <p className="practice-helper">{withoutRecording ? 'Say the word aloud. Then hear the example.' : 'Tap Compare. You’ll hear your voice first, then the example.'}</p>
      <button className="compare-reading-button" type="button" disabled={comparison === 'playing'} onClick={() => void compareReadings()}>
        <Headphones size={18} /> {comparison === 'playing' ? 'Playing comparison…' : withoutRecording ? 'Hear the example pronunciation' : 'Compare my reading'}
      </button>
      {!withoutRecording && <button className="replay-button reading-retake" type="button" onClick={recordAgain}><RotateCcw size={16} /> Record again</button>}
    </>}

    {comparisonError && <p className="recording-error" role="alert">{comparisonError}</p>}

    {comparison === 'complete' && <div className="reading-assessment">
      <p className="practice-helper">Did your reading match the example?</p>
      <div className="reading-secondary-actions">
        {!withoutRecording && <button className="replay-button" type="button" onClick={() => void hearMine()}><Headphones size={16} /> Hear mine again</button>}
        <button className="replay-button" type="button" onClick={() => void hearReference()}><Volume2 size={16} /> Hear the word again</button>
        {!withoutRecording && <button className="replay-button" type="button" onClick={recordAgain}><RotateCcw size={16} /> Record again</button>}
      </div>
      {assessed
        ? <><SelfAssessmentActions
          onIncorrect={() => submit(false)}
          onCorrect={() => submit(true)}
          incorrectLabel="Not yet"
          correctLabel="Yes"
        /><p className="answer-note">Be honest with yourself — that’s how you grow.</p></>
        : <button className="primary-button reading-continue-button" type="button" onClick={continueInstruction}>Continue</button>}
    </div>}
  </div>
}
