import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, Check, Mic, PencilLine } from 'lucide-react'
import type { TestReviewCompletion, TestReviewMode } from '../testReview/contracts.ts'
import { DeferredTestReview } from '../testReview/DeferredTestReview.tsx'
import {
  GRADE2_TEST_REVIEW_WEEK,
  termsForPrototypeMode,
  type PrototypeTerm,
} from './model.ts'

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

function playPrototypeReference(target: PrototypeTerm) {
  return speakMandarin(target.text)
}

function ModeCard({
  mode,
  title,
  description,
  count,
  onStart,
}: {
  mode: TestReviewMode
  title: string
  description: string
  count: number
  onStart: (mode: TestReviewMode) => void
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

function Grade2TestReviewPrototype() {
  const [mode, setMode] = useState<TestReviewMode | null>(null)
  const [completion, setCompletion] = useState<TestReviewCompletion<PrototypeTerm> | null>(null)

  function leaveRun() {
    window.speechSynthesis?.cancel()
    setMode(null)
    setCompletion(null)
  }

  if (!mode) return <main className="trp-shell">
    <div className="trp-safety"><strong>Development prototype:</strong> nothing is saved or uploaded. Reading clips exist only until this page is refreshed or the run is closed.</div>
    <header className="trp-hero">
      <p className="eyebrow">One grade · one week · one interaction question</p>
      <h1>Collect every response.<br /><em>Review once at the end.</em></h1>
      <p>This isolated Grade 2 harness lets us clarify the shared Test Review behavior before changing the production applications.</p>
      <div className="trp-week-chip"><strong>{GRADE2_TEST_REVIEW_WEEK.grade}</strong><span>{GRADE2_TEST_REVIEW_WEEK.dateRange}</span></div>
    </header>
    <section className="trp-mode-grid" aria-label="Prototype modes">
      <ModeCard mode="writing" title="Writing Test Review" count={GRADE2_TEST_REVIEW_WEEK.writingTerms.length} description="Hear and write every word first. The final page reveals all correct words for one paper review." onStart={setMode} />
      <ModeCard mode="reading" title="Reading Test Review" count={GRADE2_TEST_REVIEW_WEEK.readingTerms.length} description="Record every visible word first. The final page keeps every recording beside the model pronunciation." onStart={setMode} />
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

  if (!completion) return <main className="trp-shell trp-shared-shell">
    <DeferredTestReview
      key={mode}
      mode={mode}
      targets={termsForPrototypeMode(mode)}
      activityLabel="Grade 2 Test Review"
      writingTimerSeconds={10}
      onPlayReference={playPrototypeReference}
      onExit={leaveRun}
      onComplete={setCompletion}
      exitLabel="Exit prototype"
    />
  </main>

  return <main className="trp-shell trp-complete-shell">
    <section className="prompt-card complete-card">
      <span className="complete-mark"><Check size={27} /></span>
      <p className="eyebrow">Prototype run complete</p>
      <h1>{completion.correct} of {completion.total}</h1>
      <p className="review-instruction">All responses were collected before the single final review frame. This result was not saved.</p>
      <button className="primary-button" type="button" onClick={leaveRun}>Try another mode <ArrowLeft size={17} /></button>
    </section>
  </main>
}

const root = document.getElementById('grade2-test-review-prototype-root')
if (!root) throw new Error('Missing Grade 2 Test Review prototype root.')
createRoot(root).render(<Grade2TestReviewPrototype />)
