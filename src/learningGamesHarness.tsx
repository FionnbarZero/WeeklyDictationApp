import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, Check, Play, RotateCcw, ShieldCheck } from 'lucide-react'
import {
  ContextGapDash,
  CopyHideWriteCombo,
  CorrectionRescue,
  DictationStreak,
  LEARNING_GAME_CATALOG,
  LilyPadPath,
  MemoryFlip,
  ReadAloudBossRush,
  SentenceScramble,
  SpeedMatch,
  TargetBlast,
  type ContextGameRound,
  type GameChoice,
  type GamePair,
  type LearningGameId,
  type LearningGameSummary,
  type ProductionGameRound,
  type SelectionGameRound,
  type SequenceGameRound,
} from './learningGames/index.ts'
import { ReadingResponsePanel } from './readingPractice/ReadingResponsePanel.tsx'
import './styles.css'
import './tier2Lab/readingLab.css'
import './learningGamesHarness.css'
import './learningGamesHarnessCool.css'

type HarnessView = 'gallery' | 'game' | 'results'

// Synthetic interaction-QA values only. These are not curriculum, source data,
// a fallback word set, or input to any Acquisition or Adaptive Mastery engine.
const DEMO_TERMS = [
  { id: 'demo-water', text: '水', meaning: 'water' },
  { id: 'demo-mountain', text: '山', meaning: 'mountain' },
  { id: 'demo-fire', text: '火', meaning: 'fire' },
  { id: 'demo-tree', text: '木', meaning: 'wood' },
  { id: 'demo-person', text: '人', meaning: 'person' },
] as const

function demoChoice(term: typeof DEMO_TERMS[number]): GameChoice {
  return { id: `choice-${term.id}`, label: term.text, accessibleLabel: `${term.meaning}: ${term.text}` }
}

const DEMO_PAIRS: readonly GamePair[] = DEMO_TERMS.map((term) => ({
  id: `pair-${term.id}`,
  targetId: term.id,
  left: { id: `term-${term.id}`, label: term.text, accessibleLabel: term.text },
  right: { id: `meaning-${term.id}`, label: term.meaning },
}))

const DEMO_SELECTION_ROUNDS: readonly SelectionGameRound[] = DEMO_TERMS.map((term, index) => ({
  id: `selection-${term.id}`,
  targetId: term.id,
  targetText: term.text,
  cueText: `Choose the character for “${term.meaning}”`,
  audioText: term.text,
  choices: [
    demoChoice(term),
    demoChoice(DEMO_TERMS[(index + 1) % DEMO_TERMS.length]),
    demoChoice(DEMO_TERMS[(index + 2) % DEMO_TERMS.length]),
  ],
  correctChoiceId: `choice-${term.id}`,
}))

const DEMO_CONTEXT_ROUNDS: readonly ContextGameRound[] = [
  {
    ...DEMO_SELECTION_ROUNDS[0],
    id: 'context-water',
    cueText: 'Which word completes the sentence?',
    sentenceBefore: '我喝',
    sentenceAfter: '。',
  },
  {
    ...DEMO_SELECTION_ROUNDS[1],
    id: 'context-mountain',
    cueText: 'Which word completes the sentence?',
    sentenceBefore: '那是一座',
    sentenceAfter: '。',
  },
]

const DEMO_SEQUENCE_ROUNDS: readonly SequenceGameRound[] = [
  {
    id: 'sequence-water',
    targetId: 'demo-water',
    targetText: '我喝水。',
    cueText: 'Build the sentence “I drink water.”',
    tokens: [
      { id: 'water-token', label: '水' },
      { id: 'drink-token', label: '喝' },
      { id: 'i-token', label: '我' },
    ],
    correctTokenIds: ['i-token', 'drink-token', 'water-token'],
  },
  {
    id: 'sequence-mountain',
    targetId: 'demo-mountain',
    targetText: '山很大。',
    cueText: 'Build the sentence “The mountain is big.”',
    tokens: [
      { id: 'big-token', label: '大' },
      { id: 'mountain-token', label: '山' },
      { id: 'very-token', label: '很' },
    ],
    correctTokenIds: ['mountain-token', 'very-token', 'big-token'],
  },
]

const DEMO_PRODUCTION_ROUNDS: readonly ProductionGameRound[] = DEMO_TERMS.slice(0, 3).map((term) => ({
  id: `production-${term.id}`,
  targetId: term.id,
  targetText: term.text,
  audioText: term.text,
}))

const GAME_MARKS: Record<LearningGameId, string> = {
  'speed-match': '⚡',
  'target-blast': '☄️',
  'lily-pad-path': '🐸',
  'memory-flip': '🧠',
  'context-gap-dash': '💬',
  'sentence-scramble': '🧩',
  'read-aloud-boss-rush': '🐉',
  'dictation-streak': '🔥',
  'copy-hide-write-combo': '✨',
  'correction-rescue': '🛠️',
}

function speakDemoText(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!text || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      reject(new Error('Speech playback is unavailable in this browser.'))
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.55
    utterance.onend = () => resolve()
    utterance.onerror = () => reject(new Error('Speech playback did not finish.'))
    window.speechSynthesis.speak(utterance)
  })
}

function playDemoText(text: string): Promise<void> {
  return speakDemoText(text).catch(() => undefined)
}

function GameGallery({ onStart }: { readonly onStart: (gameId: LearningGameId) => void }) {
  return <main className="lgh-shell">
    <p className="lgh-safety"><ShieldCheck size={16} /> Development-only · Synthetic interaction values · Nothing is saved</p>
    <header className="lgh-hero">
      <div>
        <p className="lgh-eyebrow">Modular component lab</p>
        <h1>Test all ten <em>learning games</em></h1>
        <p>Open any format independently. This gallery tests presentation and interaction only; it is not connected to Grade 5 lifecycle, Acquisition, Adaptive Mastery, or persistence.</p>
      </div>
      <div className="lgh-count" aria-label="Ten games"><i aria-hidden="true">🥷</i><strong>10</strong><span>game formats</span></div>
    </header>
    <section className="lgh-grid" aria-label="Available game formats">
      {LEARNING_GAME_CATALOG.map((game, index) => <article key={game.id} className="lgh-card" data-game={game.id}>
        <div className="lgh-card-top">
          <span className="lgh-mark" aria-hidden="true"><small>{String(index + 1).padStart(2, '0')}</small>{GAME_MARKS[game.id]}</span>
          <span className="lgh-time">{game.estimatedSeconds[0]}–{game.estimatedSeconds[1]} sec</span>
        </div>
        <p className="lgh-eyebrow">{game.skills.join(' · ')}</p>
        <h2>{game.title}</h2>
        <p>{game.description}</p>
        <div className="lgh-channels">
          {game.channels.map((channel) => <span key={channel}>{channel === 'tier-1-writing' ? 'Tier 1 writing' : 'Tier 2 reading'}</span>)}
        </div>
        <button type="button" onClick={() => onStart(game.id)}><Play size={16} /> Test this game</button>
      </article>)}
    </section>
    <details className="lgh-details">
      <summary>About the demo values</summary>
      <p>The five simple characters and two short sentences on this page exist only to exercise the component states. They never enter the curriculum importer, a child record, or a mastery queue.</p>
    </details>
  </main>
}

function GameResult({ gameId, summary, onReplay, onHome }: {
  readonly gameId: LearningGameId
  readonly summary: LearningGameSummary
  readonly onReplay: () => void
  readonly onHome: () => void
}) {
  const definition = LEARNING_GAME_CATALOG.find((game) => game.id === gameId)!
  return <main className="lgh-shell lgh-result-shell">
    <button className="lgh-back" type="button" onClick={onHome}><ArrowLeft size={17} /> All games</button>
    <section className="lgh-result">
      <span className="lgh-result-mark"><Check size={31} /></span>
      <p className="lgh-eyebrow">Session-only result</p>
      <h1>{definition.title}</h1>
      <strong>{summary.correct} of {summary.attempted}</strong>
      <p>This result was produced by the reusable component callback and was not sent to any learning engine or storage.</p>
      <div className="lgh-result-actions">
        <button type="button" onClick={onReplay}><RotateCcw size={17} /> Test again</button>
        <button className="secondary" type="button" onClick={onHome}>Choose another game</button>
      </div>
      <details>
        <summary>View emitted attempt events</summary>
        <pre>{JSON.stringify(summary, null, 2)}</pre>
      </details>
    </section>
  </main>
}

function LearningGamesHarness() {
  const [view, setView] = useState<HarnessView>('gallery')
  const [gameId, setGameId] = useState<LearningGameId | null>(null)
  const [runId, setRunId] = useState(0)
  const [summary, setSummary] = useState<LearningGameSummary | null>(null)

  if (!import.meta.env.DEV) return <main className="lgh-unavailable">This development harness is unavailable in production.</main>

  function returnToTop() {
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }))
  }

  function start(nextGameId: LearningGameId) {
    window.speechSynthesis?.cancel()
    setGameId(nextGameId)
    setSummary(null)
    setRunId((current) => current + 1)
    setView('game')
    returnToTop()
  }

  function home() {
    window.speechSynthesis?.cancel()
    setGameId(null)
    setSummary(null)
    setView('gallery')
    returnToTop()
  }

  function complete(nextSummary: LearningGameSummary) {
    window.speechSynthesis?.cancel()
    setSummary(nextSummary)
    setView('results')
    returnToTop()
  }

  if (view === 'gallery' || !gameId) return <GameGallery onStart={start} />
  if (view === 'results' && summary) return <GameResult gameId={gameId} summary={summary} onReplay={() => start(gameId)} onHome={home} />

  const shared = { key: `${gameId}-${runId}`, onExit: home, onComplete: complete }
  switch (gameId) {
    case 'speed-match': return <SpeedMatch {...shared} pairs={DEMO_PAIRS} eyebrow="Harness · Both engines" />
    case 'target-blast': return <TargetBlast {...shared} rounds={DEMO_SELECTION_ROUNDS} playAudio={playDemoText} eyebrow="Harness · Both engines" />
    case 'lily-pad-path': return <LilyPadPath {...shared} rounds={DEMO_SELECTION_ROUNDS} playAudio={playDemoText} eyebrow="Harness · Both engines" />
    case 'memory-flip': return <MemoryFlip {...shared} pairs={DEMO_PAIRS.slice(0, 4)} eyebrow="Harness · Both engines" />
    case 'context-gap-dash': return <ContextGapDash {...shared} rounds={DEMO_CONTEXT_ROUNDS} playAudio={playDemoText} />
    case 'sentence-scramble': return <SentenceScramble {...shared} rounds={DEMO_SEQUENCE_ROUNDS} />
    case 'read-aloud-boss-rush': return <ReadAloudBossRush
      {...shared}
      rounds={DEMO_PRODUCTION_ROUNDS}
      playAudio={playDemoText}
      renderResponse={(round, controls) => <div className="lgh-boss-response">
        <div className="lg-boss-meter" aria-label={`${controls.total - controls.index} boss power segments remaining`}>
          <span style={{ width: `${((controls.total - controls.index) / controls.total) * 100}%` }} />
        </div>
        <span className="lgh-boss-avatar" aria-hidden="true">🐉</span>
        <ReadingResponsePanel
          promptId={round.id}
          targetText={round.targetText}
          assessed
          onPlayReference={() => speakDemoText(round.audioText || round.targetText)}
          onAnswer={controls.onAssess}
          onContinue={() => undefined}
        />
        <p className="lgh-recording-note">Your recording stays in this browser tab and is discarded when you leave the prompt.</p>
      </div>}
    />
    case 'dictation-streak': return <DictationStreak {...shared} rounds={DEMO_PRODUCTION_ROUNDS} playAudio={playDemoText} />
    case 'copy-hide-write-combo': return <CopyHideWriteCombo {...shared} rounds={DEMO_PRODUCTION_ROUNDS} playAudio={playDemoText} />
    case 'correction-rescue': return <CorrectionRescue {...shared} rounds={DEMO_PRODUCTION_ROUNDS.slice(0, 2)} playAudio={playDemoText} />
  }
}

const root = document.getElementById('learning-games-harness-root')
if (!root) throw new Error('Missing learning games harness root.')
createRoot(root).render(<LearningGamesHarness />)
