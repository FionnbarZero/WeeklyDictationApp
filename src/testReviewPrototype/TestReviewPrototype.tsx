import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowLeft,
  Check,
  Headphones,
  Mic,
  PencilLine,
  RotateCcw,
  Square,
  Volume2,
  X,
} from 'lucide-react'
import { SelfAssessmentActions } from '../practice/SelfAssessmentActions.tsx'
import {
  browserSupportsAudioRecording,
  startEphemeralAudioRecording,
  type ActiveAudioRecording,
} from '../readingPractice/audioRecorder.ts'
import { ReadingRecorderError, type EphemeralAudioClip } from '../readingPractice/contracts.ts'
import {
  assessPrototypeTerm,
  createPrototypeReviewState,
  GRADE2_TEST_REVIEW_WEEK,
  prototypeReviewIsComplete,
  prototypeReviewScore,
  termsForPrototypeMode,
  type PrototypeReviewState,
  type PrototypeTerm,
  type TestReviewPrototypeMode,
} from './model.ts'

type PrototypePhase = 'choose' | 'collect' | 'review' | 'complete'
type ReadingCapture = { readonly termId: string; readonly clip: EphemeralAudioClip | null }
type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'recorded' | 'error'

function speakMandarin(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!text || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      reject(new Error('Mandarin speech playback is unavailable.'))
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.55
    utterance.onend = () => resolve()
    utterance.onerror = () => reject(new Error('Mandarin speech playback failed.'))
    window.speechSynthesis.speak(utterance)
  })
}

function playClip(clip: EphemeralAudioClip): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(clip.url)
    audio.onended = () => resolve()
    audio.onerror = () => reject(new Error('The child recording could not be played.'))
    void audio.play().catch(reject)
  })
}

async function playReadingComparison(clip: EphemeralAudioClip, targetText: string) {
  await playClip(clip)
  await speakMandarin(targetText)
}

function ModeCard({
  mode,
  title,
  description,
  count,
  onStart,
}: {
  mode: TestReviewPrototypeMode
  title: string
  description: string
  count: number
  onStart: (mode: TestReviewPrototypeMode) => void
}) {
  return <article className={`trp-mode-card trp-mode-${mode}`}>
    <span className="trp-mode-icon">{mode === 'writing' ? <PencilLine size={25} /> : <Mic size={25} />}</span>
    <p className="eyebrow">{count} responses · one final review</p>
    <h2>{title}</h2>
    <p>{description}</p>
    <button className="primary-button" type="button" onClick={() => onStart(mode)}>
      Try {title} <ArrowLeft size={17} />
    </button>
  </article>
}

function ReadingCapturePrompt({
  term,
  onCaptured,
}: {
  term: PrototypeTerm
  onCaptured: (capture: ReadingCapture) => void
}) {
  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [clip, setClip] = useState<EphemeralAudioClip | null>(null)
  const [error, setError] = useState<string | null>(null)
  const activeRef = useRef<ActiveAudioRecording | null>(null)
  const clipRef = useRef<EphemeralAudioClip | null>(null)
  const transferredRef = useRef(false)
  const generationRef = useRef(0)
  const supported = browserSupportsAudioRecording()

  function releaseLocalClip() {
    if (clipRef.current && !transferredRef.current) clipRef.current.dispose()
    clipRef.current = null
    setClip(null)
  }

  async function startRecording() {
    generationRef.current += 1
    const generation = generationRef.current
    activeRef.current?.cancel()
    activeRef.current = null
    releaseLocalClip()
    transferredRef.current = false
    setError(null)
    setStatus('requesting')
    try {
      const active = await startEphemeralAudioRecording()
      if (generation !== generationRef.current) {
        active.cancel()
        return
      }
      activeRef.current = active
      setStatus('recording')
      void active.finished.then((nextClip) => {
        if (generation !== generationRef.current) {
          nextClip.dispose()
          return
        }
        activeRef.current = null
        clipRef.current = nextClip
        setClip(nextClip)
        setStatus('recorded')
      }).catch((nextError: unknown) => {
        if (generation !== generationRef.current) return
        activeRef.current = null
        setStatus('error')
        setError(nextError instanceof ReadingRecorderError
          ? nextError.message
          : 'The recording could not be completed.')
      })
    } catch (nextError) {
      if (generation !== generationRef.current) return
      setStatus('error')
      setError(nextError instanceof ReadingRecorderError
        ? nextError.message
        : 'The recording could not be started.')
    }
  }

  function keepAndContinue() {
    if (!clip) return
    transferredRef.current = true
    onCaptured({ termId: term.id, clip })
  }

  function continueWithoutRecording() {
    onCaptured({ termId: term.id, clip: null })
  }

  useEffect(() => () => {
    generationRef.current += 1
    activeRef.current?.cancel()
    if (clipRef.current && !transferredRef.current) clipRef.current.dispose()
  }, [])

  return <div className="trp-reading-capture">
    <p className="answer-label">Read this word aloud</p>
    <div className="trp-reading-word" lang="zh-Hans">{term.text}</div>
    {status === 'idle' && supported && <button className="record-reading-button" type="button" onClick={() => void startRecording()}>
      <Mic size={18} /> Record my reading
    </button>}
    {status === 'requesting' && <p className="recording-status"><Mic size={18} /> Waiting for microphone permission…</p>}
    {status === 'recording' && <>
      <p className="recording-status recording-live"><span className="recording-dot" /> Say the word, then tap Stop.</p>
      <button className="stop-recording-button" type="button" onClick={() => activeRef.current?.stop()}><Square size={16} /> Stop recording</button>
    </>}
    {status === 'recorded' && clip && <>
      <p className="trp-captured"><Check size={17} /> Recording captured. It will be compared on the final page.</p>
      <div className="trp-inline-actions">
        <button className="replay-button" type="button" onClick={() => void playClip(clip)}><Headphones size={16} /> Check recording</button>
        <button className="replay-button" type="button" onClick={() => void startRecording()}><RotateCcw size={16} /> Record again</button>
      </div>
      <button className="primary-button trp-next-button" type="button" onClick={keepAndContinue}>Save response and continue <ArrowLeft size={17} /></button>
    </>}
    {(!supported || status === 'error') && <div className="recording-fallback" role="alert">
      <strong>Microphone recording is unavailable.</strong>
      <p>{error || 'This browser cannot record microphone audio.'}</p>
      <button className="replay-button" type="button" onClick={continueWithoutRecording}>Prototype fallback: continue without a recording</button>
    </div>}
    <p className="trp-collection-rule">The model pronunciation and correctness buttons stay hidden until every response is collected.</p>
  </div>
}

function WritingCollectionPrompt({
  termNumber,
  onReplay,
  onContinue,
}: {
  termNumber: number
  onReplay: () => void
  onContinue: () => void
}) {
  return <div className="trp-writing-capture">
    <span className="speaker-orb"><span className="orb-ring" /><Volume2 size={32} strokeWidth={1.7} /></span>
    <h1>Listen, then write<br /><span>word {termNumber}.</span></h1>
    <p className="practice-helper">Write the response on paper. The correct word will stay hidden until the final review page.</p>
    <button className="replay-button" type="button" onClick={onReplay}><RotateCcw size={16} /> Replay word</button>
    <button className="primary-button trp-next-button" type="button" onClick={onContinue}>Response written <ArrowLeft size={17} /></button>
  </div>
}

function ReviewRow({
  mode,
  number,
  term,
  capture,
  assessment,
  onAssess,
}: {
  mode: TestReviewPrototypeMode
  number: number
  term: PrototypeTerm
  capture?: ReadingCapture
  assessment: 'correct' | 'incorrect' | null
  onAssess: (correct: boolean) => void
}) {
  return <article className={`trp-review-row ${assessment ? `is-${assessment}` : ''}`}>
    <div className="trp-review-number">{number}</div>
    <div className="trp-review-content">
      <p className="answer-label">{mode === 'writing' ? 'The word was' : 'Compare this reading'}</p>
      {mode === 'writing'
        ? <><div className="trp-review-word" lang="zh-Hans">{term.text}</div><p>Compare this word with the response on paper.</p></>
        : <>
          <div className="trp-reading-review-target">
            <div className="trp-review-word" lang="zh-Hans">{term.text}</div>
            {capture?.clip && <div className="trp-compare-control">
              <button
                className="trp-compare-button"
                type="button"
                aria-label="Check Yourself"
                onClick={() => void playReadingComparison(capture.clip!, term.text)}
              ><Headphones size={28} /></button>
              <span>Check Yourself</span>
            </div>}
          </div>
          {!capture?.clip && <div className="trp-inline-actions">
            <span className="trp-missing-recording">No recording was captured</span>
            <button className="replay-button" type="button" onClick={() => void speakMandarin(term.text)}><Volume2 size={16} /> Hear the word</button>
          </div>}
        </>}
    </div>
    <SelfAssessmentActions
      onIncorrect={() => onAssess(false)}
      onCorrect={() => onAssess(true)}
      incorrectLabel="Not yet"
      correctLabel="Yes"
    />
  </article>
}

function Grade2TestReviewPrototype() {
  const [mode, setMode] = useState<TestReviewPrototypeMode | null>(null)
  const [phase, setPhase] = useState<PrototypePhase>('choose')
  const [index, setIndex] = useState(0)
  const [captures, setCaptures] = useState<ReadingCapture[]>([])
  const capturesRef = useRef<ReadingCapture[]>([])
  const [review, setReview] = useState<PrototypeReviewState | null>(null)

  const terms = mode ? termsForPrototypeMode(mode) : []
  const activeTerm = terms[index]

  function replaceCaptures(next: ReadingCapture[]) {
    capturesRef.current = next
    setCaptures(next)
  }

  function disposeCaptures() {
    capturesRef.current.forEach((capture) => capture.clip?.dispose())
    capturesRef.current = []
    setCaptures([])
  }

  function start(nextMode: TestReviewPrototypeMode) {
    disposeCaptures()
    setMode(nextMode)
    setIndex(0)
    setReview(createPrototypeReviewState(termsForPrototypeMode(nextMode)))
    setPhase('collect')
  }

  function finishCollection() {
    window.speechSynthesis?.cancel()
    setPhase('review')
  }

  function advanceWriting() {
    if (index + 1 >= terms.length) finishCollection()
    else setIndex((current) => current + 1)
  }

  function captureReading(capture: ReadingCapture) {
    replaceCaptures([...capturesRef.current, capture])
    if (index + 1 >= terms.length) finishCollection()
    else setIndex((current) => current + 1)
  }

  function leaveRun() {
    window.speechSynthesis?.cancel()
    disposeCaptures()
    setMode(null)
    setIndex(0)
    setReview(null)
    setPhase('choose')
  }

  useEffect(() => () => {
    window.speechSynthesis?.cancel()
    capturesRef.current.forEach((capture) => capture.clip?.dispose())
  }, [])

  useEffect(() => {
    if (phase === 'collect' && mode === 'writing' && activeTerm) void speakMandarin(activeTerm.text)
  }, [phase, mode, activeTerm])

  if (phase === 'choose' || !mode) return <main className="trp-shell">
    <div className="trp-safety"><strong>Development prototype:</strong> nothing is saved or uploaded. Reading clips exist only until this page is refreshed or the run is closed.</div>
    <header className="trp-hero">
      <p className="eyebrow">One grade · one week · one interaction question</p>
      <h1>Collect every response.<br /><em>Review once at the end.</em></h1>
      <p>This isolated Grade 2 harness lets us clarify the shared Test Review behavior before changing the production applications.</p>
      <div className="trp-week-chip"><strong>{GRADE2_TEST_REVIEW_WEEK.grade}</strong><span>{GRADE2_TEST_REVIEW_WEEK.dateRange}</span></div>
    </header>
    <section className="trp-mode-grid" aria-label="Prototype modes">
      <ModeCard mode="writing" title="Writing Test Review" count={GRADE2_TEST_REVIEW_WEEK.writingTerms.length} description="Hear and write every word first. The final page reveals all correct words for one paper review." onStart={start} />
      <ModeCard mode="reading" title="Reading Test Review" count={GRADE2_TEST_REVIEW_WEEK.readingTerms.length} description="Record every visible word first. The final page keeps every recording beside the model pronunciation." onStart={start} />
    </section>
    <details className="trp-rules">
      <summary>Prototype rules being tested</summary>
      <ul>
        <li>No correctness feedback appears while responses are collected.</li>
        <li>Every item appears together on one final, scrollable review frame.</li>
        <li>Each final-review item receives one red or green assessment.</li>
        <li>The result can be submitted only after every item is assessed.</li>
      </ul>
    </details>
  </main>

  if (phase === 'collect' && activeTerm) {
    const progress = Math.round((index / terms.length) * 100)
    return <main className="trp-shell trp-run-shell">
      <div className="practice-top">
        <button className="back-button" type="button" onClick={leaveRun}><X size={18} /> Exit prototype</button>
        <span className="practice-count">{mode === 'writing' ? 'Writing' : 'Reading'} responses<span> · {index + 1} of {terms.length}</span></span>
      </div>
      <div className="practice-progress"><span style={{ width: `${progress}%` }} /></div>
      <section className="prompt-card trp-collection-card">
        <div className="prompt-meta"><span className="set-chip chip-test-review">Grade 2 Test Review</span><span className="review-label">Collect first</span></div>
        {mode === 'writing'
          ? <WritingCollectionPrompt
            key={activeTerm.id}
            termNumber={index + 1}
            onReplay={() => void speakMandarin(activeTerm.text)}
            onContinue={advanceWriting}
          />
          : <ReadingCapturePrompt key={activeTerm.id} term={activeTerm} onCaptured={captureReading} />}
      </section>
      <p className="practice-footnote"><Headphones size={14} /> No answers are scored during collection</p>
    </main>
  }

  if (phase === 'review' && review) {
    const allAssessed = prototypeReviewIsComplete(review)
    const currentScore = prototypeReviewScore(review)
    return <main className="trp-shell trp-review-shell">
      <div className="practice-top">
        <button className="back-button" type="button" onClick={leaveRun}><X size={18} /> Exit prototype</button>
        <span className="practice-count">Final review<span> · {currentScore.attempted} of {currentScore.total} assessed</span></span>
      </div>
      <header className="trp-review-header">
        <p className="eyebrow">All responses are now complete</p>
        <h1>Review everything<br /><em>on one final page.</em></h1>
        <p>{mode === 'writing'
          ? 'Compare every revealed word with the child’s paper, then mark each response.'
          : 'Play the child’s recording and the model pronunciation for each word, then mark each response.'}</p>
      </header>
      <section className="trp-review-list" aria-label="Final response review">
        {terms.map((term, termIndex) => <ReviewRow
          key={term.id}
          mode={mode}
          number={termIndex + 1}
          term={term}
          capture={captures.find((candidate) => candidate.termId === term.id)}
          assessment={review.assessments[term.id] || null}
          onAssess={(correct) => setReview((current) => current
            ? assessPrototypeTerm(current, term.id, correct ? 'correct' : 'incorrect')
            : current)}
        />)}
      </section>
      <footer className="trp-submit-bar">
        <div><strong>{currentScore.correct} correct</strong><span>{allAssessed ? 'Ready to finalize this prototype result.' : `Assess ${currentScore.total - currentScore.attempted} more response${currentScore.total - currentScore.attempted === 1 ? '' : 's'}.`}</span></div>
        <button className="primary-button" type="button" disabled={!allAssessed} onClick={() => setPhase('complete')}>Submit final review <ArrowLeft size={17} /></button>
      </footer>
    </main>
  }

  const score = review ? prototypeReviewScore(review) : { correct: 0, total: terms.length }
  return <main className="trp-shell trp-complete-shell">
    <section className="prompt-card complete-card">
      <span className="complete-mark"><Check size={27} /></span>
      <p className="eyebrow">Prototype run complete</p>
      <h1>{score.correct} of {score.total}</h1>
      <p className="review-instruction">All responses were collected before the single final review frame. This result was not saved.</p>
      <button className="primary-button" type="button" onClick={leaveRun}>Try another mode <ArrowLeft size={17} /></button>
    </section>
  </main>
}

const root = document.getElementById('grade2-test-review-prototype-root')
if (!root) throw new Error('Missing Grade 2 Test Review prototype root.')
createRoot(root).render(<Grade2TestReviewPrototype />)
