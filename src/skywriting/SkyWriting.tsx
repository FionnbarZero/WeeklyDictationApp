import { useState, type ReactNode } from 'react'
import { ArrowLeft, Check, Sparkles, Volume2, X } from 'lucide-react'
import { SkyWritingAcquisition } from './skywritingacquisition.tsx'
import './skywriting.css'

export type SkyWritingResult = {
  correct: number
  total: number
  assessments: SkyWritingAssessment[]
}

export type SkyWritingAssessment = {
  word: string
  index: number
  correct: boolean
}

export type SkyWritingProps = {
  words: string[]
  maxRounds?: number
  onExit: () => void
  onComplete: (result: SkyWritingResult) => void
  speak: (text: string) => void | Promise<void>
}

function distinctWords(words: string[]) {
  return [...new Set(words.filter(Boolean))]
}

function SkyWritingShell({ score, onExit, children }: {
  score: string
  onExit: () => void
  children: ReactNode
}) {
  return <main className="skywriting-shell">
    <div className="skywriting-topbar">
      <button className="skywriting-exit" type="button" onClick={onExit}><X size={17} /> Exit game</button>
      <header className="skywriting-heading">
        <p className="skywriting-eyebrow">Writing practice</p>
        <h1>Sky Writing</h1>
      </header>
      <span className="skywriting-live-score">{score}</span>
    </div>
    {children}
  </main>
}

export function SkyWriting({ words, maxRounds = 5, onExit, onComplete, speak }: SkyWritingProps) {
  const roundLimit = Number.isFinite(maxRounds) ? Math.max(0, Math.floor(maxRounds)) : 5
  const rounds = distinctWords(words).slice(0, roundLimit)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [correct, setCorrect] = useState(0)
  const [assessments, setAssessments] = useState<SkyWritingAssessment[]>([])
  const [complete, setComplete] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const word = rounds[index]

  async function playWord() {
    setAudioError(null)
    try {
      await speak(word)
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : 'Audio could not play.')
    }
  }

  function answer(value: boolean) {
    setAudioError(null)
    const nextCorrect = correct + (value ? 1 : 0)
    setCorrect(nextCorrect)
    setAssessments((current) => [...current, { word, index, correct: value }])
    if (index + 1 >= rounds.length) setComplete(true)
    else { setIndex((value) => value + 1); setRevealed(false) }
  }

  if (rounds.length === 0) return <SkyWritingShell score="0/0" onExit={onExit}>
    <section className="skywriting-card skywriting-empty">
      <div className="skywriting-mascot" aria-hidden="true">☁️</div>
      <h2>No writing words are ready yet</h2>
      <p>Return to the activity menu and choose another practice path.</p>
      <button className="skywriting-primary" type="button" onClick={onExit}>Return to the paths <ArrowLeft size={17} /></button>
    </section>
  </SkyWritingShell>

  if (complete) return <SkyWritingShell score={`${correct}/${rounds.length}`} onExit={onExit}>
    <section className="skywriting-card skywriting-complete">
      <div className="skywriting-complete-mark"><Check /></div>
      <p className="skywriting-eyebrow">Challenge complete</p>
      <h2>Your sky is full of words!</h2>
      <strong>{correct} of {rounds.length} correct</strong>
      <p>You can practice the tricky words again later.</p>
      <button className="skywriting-primary" type="button" onClick={() => onComplete({ correct, total: rounds.length, assessments })}>Return to the paths <ArrowLeft size={17} /></button>
    </section>
  </SkyWritingShell>

  return <SkyWritingShell score={`${correct}/${index}`} onExit={onExit}>
    <section className="skywriting-card">
      <div className={`skywriting-promptbar${revealed ? ' review' : ''}`}>
        {!revealed ? <>
          <div className="skywriting-prompt-copy">
            <div className="skywriting-mascot" aria-hidden="true">☁️</div>
            <div>
              <p className="skywriting-round-label">Writing word {index + 1} of {rounds.length}</p>
              <h2>Listen, then write the word</h2>
            </div>
          </div>
          <div className="skywriting-prompt-actions">
            <button className="skywriting-listen" type="button" onClick={() => void playWord()}><Volume2 size={21} /> Hear the word</button>
            <button className="skywriting-primary" type="button" onClick={() => setRevealed(true)}>Show the word <Sparkles size={17} /></button>
          </div>
        </> : <>
          <div className="skywriting-review-copy">
            <p className="skywriting-round-label">Review your writing</p>
            <h2>Does it match?</h2>
          </div>
          <div className="skywriting-prompt-actions">
            <button className="skywriting-listen" type="button" onClick={() => void playWord()}><Volume2 size={21} /> Hear it again</button>
            <div className="skywriting-self-check">
              <button className="skywriting-wrong" type="button" onClick={() => answer(false)}><X size={17} /> Not yet</button>
              <button className="skywriting-right" type="button" onClick={() => answer(true)}><Check size={17} /> It matches!</button>
            </div>
          </div>
        </>}
      </div>

      {audioError && <div className="recording-fallback" role="alert">
        <strong>The word did not play.</strong>
        <p>{audioError} Ask a teacher for help if it still does not play.</p>
        <button className="skywriting-listen" type="button" onClick={() => void playWord()}><Volume2 size={18} /> Try audio again</button>
      </div>}

      <SkyWritingAcquisition key={`${index}-${word}`} word={word} phase={revealed ? 'review' : 'writing'} traceTarget={false} />
    </section>
  </SkyWritingShell>
}
