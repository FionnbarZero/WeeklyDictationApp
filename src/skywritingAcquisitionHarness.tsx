import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Check, Clock3, RotateCcw, X } from 'lucide-react'
import { SkyWritingAcquisition, type SkyWritingAcquisitionPhase } from './skywriting/index.ts'
import {
  grade5SkyWritingAcquisitionAudioSequence,
  grade5SkyWritingAcquisitionSample,
  type Grade5SkyWritingAcquisitionTarget,
} from './skywriting/grade5AcquisitionSample.ts'
import './skywritingAcquisitionHarness.css'

type PrototypeAssessment = {
  word: string
  correct: boolean
}

const acquisitionSequenceLabels = ['Word', 'Context sentence', 'Word again', 'Word again']

function playAcquisitionSequence(target: Grade5SkyWritingAcquisitionTarget, onStep: (step: number) => void) {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return () => undefined
  const sequence = grade5SkyWritingAcquisitionAudioSequence(target)
  let cancelled = false
  let step = 0

  function playNext() {
    if (cancelled || step >= sequence.length) {
      if (!cancelled) onStep(sequence.length)
      return
    }
    onStep(step)
    const utterance = new SpeechSynthesisUtterance(sequence[step])
    utterance.lang = 'zh-CN'
    utterance.rate = step === 1 ? 0.72 : 0.58
    const advance = () => { step += 1; playNext() }
    utterance.onend = advance
    utterance.onerror = advance
    window.speechSynthesis.speak(utterance)
  }

  window.speechSynthesis.cancel()
  playNext()
  return () => {
    cancelled = true
    window.speechSynthesis.cancel()
  }
}

function SkyWritingAcquisitionHarness() {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<SkyWritingAcquisitionPhase>('writing')
  const [assessments, setAssessments] = useState<PrototypeAssessment[]>([])
  const [runId, setRunId] = useState(0)
  const [sequenceStep, setSequenceStep] = useState(0)
  const target = grade5SkyWritingAcquisitionSample[index]
  const complete = index >= grade5SkyWritingAcquisitionSample.length

  useEffect(() => {
    if (!import.meta.env.DEV || !target || phase !== 'writing') return
    setSequenceStep(0)
    return playAcquisitionSequence(target, setSequenceStep)
  }, [target, phase, runId])

  if (!import.meta.env.DEV) return <main className="sky-acq-unavailable">This development harness is unavailable in production.</main>

  function assess(correct: boolean) {
    if (!target) return
    setAssessments((current) => [...current, { word: target.text, correct }])
    setIndex((current) => current + 1)
    setPhase('writing')
  }

  function restart() {
    setIndex(0)
    setPhase('writing')
    setAssessments([])
    setRunId((current) => current + 1)
  }

  if (complete) {
    const correct = assessments.filter((assessment) => assessment.correct).length
    return <main className="sky-acq-harness results">
      <section className="sky-acq-results">
        <div className="sky-acq-complete-mark"><Check /></div>
        <p className="sky-acq-eyebrow">Prototype complete</p>
        <h1>{correct} of {assessments.length} matched</h1>
        <div className="sky-acq-result-words">
          {assessments.map((assessment) => <span key={assessment.word} className={assessment.correct ? 'correct' : 'practice'}>
            <b>{assessment.word}</b>{assessment.correct ? <Check size={16} /> : <X size={16} />}
          </span>)}
        </div>
        <button className="sky-acq-primary" type="button" onClick={restart}><RotateCcw size={17} /> Test the three words again</button>
        <small>Session only—nothing was saved or sent.</small>
      </section>
    </main>
  }

  return <main className="sky-acq-harness">
    <header className="sky-acq-header">
      <div>
        <p className="sky-acq-eyebrow">Development-only response prototype</p>
        <h1>Grade 5 Sky Writing Acquisition</h1>
      </div>
      <span>{index + 1} of {grade5SkyWritingAcquisitionSample.length}</span>
    </header>

    <aside className="sky-acq-boundary">
      <strong>Acquisition boundary</strong>
      <p>Automatic prototype audio: word → contextual sentence → word → word. Production Acquisition owns this sequence and the real timer.</p>
      <span>Tester target: <b lang="zh-CN">{target.text}</b> · {target.sourceUnit}</span>
    </aside>

    <section className="sky-acq-stage">
      <div className="sky-acq-stagebar">
        <div>
          <p className="sky-acq-eyebrow">{phase === 'writing' ? 'Response phase' : 'Review phase'}</p>
          <h2>{phase === 'writing' ? 'Trace the word as you listen' : 'Compare the two versions'}</h2>
          {phase === 'writing' && <p className="sky-acq-audio-status" aria-live="polite">
            {sequenceStep < acquisitionSequenceLabels.length
              ? `Now playing: ${acquisitionSequenceLabels[sequenceStep]}`
              : 'Audio sequence complete—keep tracing until the timer ends.'}
          </p>}
        </div>
        {phase === 'writing'
          ? <button className="sky-acq-primary" type="button" onClick={() => setPhase('review')}><Clock3 size={17} /> Simulate timer ending</button>
          : <div className="sky-acq-assessment">
            <button className="incorrect" type="button" onClick={() => assess(false)}><X size={17} /> Not yet</button>
            <button className="correct" type="button" onClick={() => assess(true)}><Check size={17} /> It matches!</button>
          </div>}
      </div>
      <div className="sky-acq-component">
        <SkyWritingAcquisition key={`${runId}-${target.id}`} word={target.text} phase={phase} />
      </div>
    </section>
  </main>
}

const root = document.getElementById('skywriting-acquisition-harness-root')
if (!root) throw new Error('Missing Sky Writing Acquisition harness root.')
createRoot(root).render(<SkyWritingAcquisitionHarness />)
