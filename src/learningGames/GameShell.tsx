import { Check, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { LearningGameSummary } from './contracts.ts'
import './learningGames.css'
import './learningGamesCool.css'

export function LearningGameShell({ title, eyebrow, progress, onExit, children }: {
  readonly title: string
  readonly eyebrow: string
  readonly progress: string
  readonly onExit: () => void
  readonly children: ReactNode
}) {
  return <main className="lg-shell">
    <div className="lg-topbar">
      <button className="lg-exit" type="button" onClick={onExit}><X size={18} /> Exit game</button>
      <span className="lg-progress" aria-label={`Progress: ${progress}`}>{progress}</span>
    </div>
    <header className="lg-heading">
      <p>{eyebrow}</p>
      <h1>{title}</h1>
    </header>
    {children}
  </main>
}

export function LearningGameComplete({ summary, message, onDone }: {
  readonly summary: LearningGameSummary
  readonly message: string
  readonly onDone: () => void
}) {
  const accuracy = summary.attempted ? Math.round((summary.correct / summary.attempted) * 100) : 0
  return <section className="lg-card lg-complete" aria-live="polite">
    <span className="lg-complete-mark"><Check size={30} /></span>
    <p className="lg-kicker">Challenge complete</p>
    <h2>{summary.correct} of {summary.attempted}</h2>
    <div className="lg-complete-stats">
      <span><strong>{accuracy}%</strong> accuracy</span>
      <span><strong>{summary.attempted}</strong> attempts</span>
    </div>
    <p>{message}</p>
    <button className="lg-primary" type="button" onClick={onDone}>Finish</button>
  </section>
}

export function LearningGameEmpty({ onExit }: { readonly onExit: () => void }) {
  return <section className="lg-card lg-empty" role="status">
    <h2>This game has no prompts yet.</h2>
    <p>The learning engine must provide a validated prompt set before play begins.</p>
    <button className="lg-primary" type="button" onClick={onExit}>Return</button>
  </section>
}

export function SelfAssessmentButtons({ onAnswer, incorrectLabel = 'Practice again', correctLabel = 'I got it' }: {
  readonly onAnswer: (correct: boolean) => void
  readonly incorrectLabel?: string
  readonly correctLabel?: string
}) {
  return <div className="lg-self-assessment">
    <button className="lg-incorrect" type="button" onClick={() => onAnswer(false)}><X size={17} /> {incorrectLabel}</button>
    <button className="lg-correct" type="button" onClick={() => onAnswer(true)}><Check size={17} /> {correctLabel}</button>
  </div>
}
