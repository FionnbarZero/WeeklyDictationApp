import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, Check, Play, RotateCcw, X } from 'lucide-react'
import { SkyWriting, type SkyWritingResult } from './skywriting/index.ts'
import {
  skyWritingCrossGradeSample,
  skyWritingHarnessGrades,
  type SkyWritingHarnessGrade,
} from './skywriting/harnessSample.ts'
import './skywritingHarness.css'

type HarnessView = 'intro' | 'activity' | 'results'

function speakText(text: string) {
  if (!text || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = 0.55
  window.speechSynthesis.speak(utterance)
}

function gradeLabel(grade: SkyWritingHarnessGrade) {
  return grade === 'Kindergarten' ? 'K' : grade.replace('Grade ', 'G')
}

function SkyWritingHarness() {
  const [view, setView] = useState<HarnessView>(() => new URLSearchParams(window.location.search).get('start') === 'writing' ? 'activity' : 'intro')
  const [runId, setRunId] = useState(0)
  const [result, setResult] = useState<SkyWritingResult | null>(null)

  if (!import.meta.env.DEV) return <main className="sky-lab-unavailable">This development harness is unavailable in production.</main>

  function startRun() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setResult(null)
    setRunId((current) => current + 1)
    setView('activity')
  }

  function returnToIntro() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setView('intro')
  }

  if (view === 'activity') return <SkyWriting
    key={runId}
    words={skyWritingCrossGradeSample.map((target) => target.text)}
    maxRounds={skyWritingCrossGradeSample.length}
    onExit={returnToIntro}
    onComplete={(summary) => { setResult(summary); setView('results') }}
    speak={speakText}
  />

  if (view === 'results' && result) return <main className="sky-lab-shell">
    <button className="sky-lab-back" type="button" onClick={returnToIntro}><ArrowLeft size={17} /> Harness home</button>
    <section className="sky-lab-results">
      <div className="sky-lab-result-mark"><Check /></div>
      <p className="sky-lab-eyebrow">Session-only results</p>
      <h1>{result.correct} of {result.total}</h1>
      <p>Compare how the writing pad felt for single-character and multi-character Tier 1 targets.</p>
      <div className="sky-lab-grade-results">
        {skyWritingHarnessGrades.map((grade) => {
          const targets = skyWritingCrossGradeSample.filter((target) => target.grade === grade)
          const assessments = result.assessments.filter((assessment) => targets.some((target) => target.text === assessment.word))
          const correct = assessments.filter((assessment) => assessment.correct).length
          return <article key={grade}>
            <span>{gradeLabel(grade)}</span>
            <div><h2>{grade}</h2><p>{correct} of {assessments.length} matched</p></div>
            <ul>{targets.map((target) => {
              const assessment = assessments.find((item) => item.word === target.text)
              return <li key={target.id} className={assessment?.correct ? 'correct' : 'practice'}>
                <b>{target.text}</b><span>{assessment?.correct ? <Check size={15} /> : <X size={15} />}{assessment?.correct ? 'Matched' : 'Practice'}</span>
              </li>
            })}</ul>
          </article>
        })}
      </div>
      <button className="sky-lab-primary" type="button" onClick={startRun}><RotateCcw size={18} /> Test the same 10 again</button>
      <small>Nothing from this run was saved or sent anywhere.</small>
    </section>
  </main>

  return <main className="sky-lab-shell">
    <p className="sky-lab-safety">Development-only Sky Writing harness · Checked-in Tier 1 fixture sample · No account, cloud, or saved progress</p>
    <header className="sky-lab-hero">
      <div>
        <p className="sky-lab-eyebrow">Cross-grade interaction test</p>
        <h1>Test Sky Writing with 10 Tier 1 words</h1>
        <p>This fixed sample mixes three Kindergarten characters, four Grade 2 words, and three Grade 5 words so the touchpad can be evaluated before any Tier 1 engine integration.</p>
        <button className="sky-lab-primary" type="button" onClick={startRun}><Play size={18} /> Start the 10-word test</button>
      </div>
      <div className="sky-lab-count" aria-label="10 writing targets"><strong>10</strong><span>Tier 1 targets</span></div>
    </header>

    <section className="sky-lab-grade-grid" aria-label="Sample distribution">
      {skyWritingHarnessGrades.map((grade) => {
        const targets = skyWritingCrossGradeSample.filter((target) => target.grade === grade)
        return <article key={grade}>
          <span>{gradeLabel(grade)}</span>
          <h2>{grade}</h2>
          <p>{targets.length} source-derived {targets.length === 1 ? 'target' : 'targets'}</p>
          <div>{targets.map((target) => <b key={target.id}>{target.text}</b>)}</div>
        </article>
      })}
    </section>

    <details className="sky-lab-provenance">
      <summary>View sample provenance</summary>
      <table>
        <thead><tr><th>Grade</th><th>Target</th><th>Fixture source unit</th></tr></thead>
        <tbody>{skyWritingCrossGradeSample.map((target) => <tr key={target.id}>
          <td>{target.grade}</td><td lang="zh-CN">{target.text}</td><td>{target.sourceUnit} · {target.sourceFixture}</td>
        </tr>)}</tbody>
      </table>
    </details>
  </main>
}

const root = document.getElementById('skywriting-harness-root')
if (!root) throw new Error('Missing Sky Writing harness root.')
createRoot(root).render(<SkyWritingHarness />)
