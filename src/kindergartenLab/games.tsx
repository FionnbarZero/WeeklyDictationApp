import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, RotateCcw, Sparkles, Volume2, X } from 'lucide-react'
import {
  promptAudioStarted,
  stopPromptAudio,
  type PromptAudioAttempt,
} from '../audio/promptAudio.ts'
import type { Word } from '../domain/contracts.ts'

export type KindergartenScoreKind = 'Current week' | 'Ninja game' | 'Final Boss' | 'Spirit Realm'

export type KindergartenScoreRecord = {
  id: string
  label: string
  kind: KindergartenScoreKind
  correct: number
  total: number
  completedAt: string
}

type CompleteScore = Pick<KindergartenScoreRecord, 'label' | 'kind' | 'correct' | 'total'>
type GameSpeak = (text: string) => void | Promise<void>

function AudioFailureNotice({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  if (!message) return null
  return <div className="recording-fallback" role="alert">
    <strong>The word did not play.</strong>
    <p>{message} Ask a teacher for help if it still does not play.</p>
    <button className="replay-button" type="button" onClick={onRetry}><Volume2 size={16} /> Try audio again</button>
  </div>
}

function GameShell({ title, eyebrow, score, onExit, children }: {
  title: string
  eyebrow: string
  score: string
  onExit: () => void
  children: ReactNode
}) {
  return <main className="k-game-shell">
    <div className="k-game-topbar">
      <button className="k-back" type="button" onClick={() => onExit()}><X size={17} /> Exit game</button>
      <span className="k-game-live-score">{score}</span>
    </div>
    <header className="k-game-heading">
      <p className="k-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
    </header>
    {children}
  </main>
}

function CompletionCard({ title, message, score, onDone }: {
  title: string
  message: string
  score: string
  onDone: () => void
}) {
  return <section className="k-game-card k-game-complete">
    <div className="mark"><Check /></div>
    <p className="k-eyebrow">Challenge complete</p>
    <h2>{title}</h2>
    <strong>{score}</strong>
    <p>{message}</p>
    <button className="k-primary" type="button" onClick={onDone}>Return to the paths <ArrowLeft size={17} /></button>
  </section>
}

function distinctWords(words: string[]) {
  return [...new Set(words.filter(Boolean))]
}

function choicesFor(target: string, pool: string[], index: number) {
  const distractors = pool.filter((word) => word !== target).slice(index % Math.max(pool.length, 1)).concat(pool).filter((word) => word !== target)
  const selected = distinctWords([target, ...distractors]).slice(0, 3)
  if (selected.length < 2) return selected
  const shift = index % selected.length
  return [...selected.slice(shift), ...selected.slice(0, shift)]
}

export function ListeningLilyPads({ targets, choicePool, onExit, onComplete, speak }: {
  targets: string[]
  choicePool: string[]
  onExit: () => void
  onComplete: (score: CompleteScore) => void
  speak: GameSpeak
}) {
  const rounds = distinctWords(targets).slice(0, 5)
  const [index, setIndex] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [complete, setComplete] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const target = rounds[index]
  const choices = choicesFor(target, distinctWords(choicePool), index)

  const playTarget = useCallback(async () => {
    if (!target) return
    setAudioError(null)
    try {
      await speak(target)
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : 'Audio could not play.')
    }
  }, [speak, target])

  useEffect(() => {
    if (!complete) void playTarget()
  }, [complete, playTarget])

  function choose(word: string) {
    if (selected) return
    setSelected(word)
    if (word === target) setCorrect((value) => value + 1)
  }

  function advance() {
    if (index + 1 >= rounds.length) setComplete(true)
    else { setIndex((value) => value + 1); setSelected(null) }
  }

  const finalCorrect = correct
  if (complete) return <GameShell title="Listening Lily Pads" eyebrow="Ninja Skills · Reading" score={`${finalCorrect}/${rounds.length}`} onExit={onExit}>
    <CompletionCard title="You crossed the pond!" message="You listened carefully and found the matching words." score={`${finalCorrect} of ${rounds.length} correct`} onDone={() => onComplete({ label: 'Listening Lily Pads', kind: 'Ninja game', correct: finalCorrect, total: rounds.length })} />
  </GameShell>

  return <GameShell title="Listening Lily Pads" eyebrow="Ninja Skills · Reading" score={`${correct}/${index + (selected ? 1 : 0)}`} onExit={onExit}>
    <section className="k-game-card k-lily-game">
      <p className="k-round-label">Word {index + 1} of {rounds.length}</p>
      <div className="k-game-mascot" aria-hidden="true">🐸</div>
      <h2>Which word did you hear?</h2>
      <button className="k-listen-button" type="button" onClick={() => void playTarget()}><Volume2 size={24} /> Hear the word</button>
      <AudioFailureNotice message={audioError} onRetry={() => void playTarget()} />
      <div className="k-choice-grid">
        {choices.map((word) => <button
          className={`k-word-choice${selected === word ? word === target ? ' correct' : ' wrong' : ''}${selected && word === target ? ' answer' : ''}`}
          type="button"
          key={word}
          disabled={Boolean(selected)}
          onClick={() => choose(word)}
        >{word}</button>)}
      </div>
      {selected && <div className={`k-game-feedback ${selected === target ? 'correct' : 'wrong'}`}>
        <strong>{selected === target ? 'Great listening!' : 'Good try—the word is highlighted.'}</strong>
        <button className="k-primary" type="button" onClick={advance}>{index + 1 === rounds.length ? 'See my score' : 'Next lily pad'} <ArrowLeft size={17} /></button>
      </div>}
    </section>
  </GameShell>
}

type MemoryCard = { id: string; word: string }

function memoryDeck(words: string[]): MemoryCard[] {
  const pairs = distinctWords(words).slice(0, 4)
  const cards = pairs.flatMap((word, index) => [{ id: `${index}-a`, word }, { id: `${index}-b`, word }])
  const order = [0, 5, 2, 7, 1, 4, 6, 3]
  return order.map((position) => cards[position]).filter((card): card is MemoryCard => Boolean(card))
}

export function MemoryLanterns({ words, onExit, onComplete, speak }: {
  words: string[]
  onExit: () => void
  onComplete: (score: CompleteScore) => void
  speak: GameSpeak
}) {
  const deck = useMemo(() => memoryDeck(words), [words])
  const pairTotal = deck.length / 2
  const [flipped, setFlipped] = useState<string[]>([])
  const [matched, setMatched] = useState<string[]>([])
  const [turns, setTurns] = useState(0)
  const [complete, setComplete] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [retryWord, setRetryWord] = useState('')
  const selectedCards = flipped.map((id) => deck.find((card) => card.id === id)).filter((card): card is MemoryCard => Boolean(card))
  const pairReady = selectedCards.length === 2
  const isMatch = pairReady && selectedCards[0].word === selectedCards[1].word

  async function playWord(word: string) {
    setRetryWord(word)
    setAudioError(null)
    try {
      await speak(word)
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : 'Audio could not play.')
    }
  }

  function flip(card: MemoryCard) {
    if (pairReady || flipped.includes(card.id) || matched.includes(card.word)) return
    const next = [...flipped, card.id]
    setFlipped(next)
    void playWord(card.word)
    if (next.length === 2) setTurns((value) => value + 1)
  }

  function continueGame() {
    if (isMatch) {
      void playWord(selectedCards[0].word)
      const nextMatched = [...matched, selectedCards[0].word]
      setMatched(nextMatched)
      if (nextMatched.length === pairTotal) setComplete(true)
    }
    setFlipped([])
  }

  if (complete) return <GameShell title="Memory Lanterns" eyebrow="Ninja Skills · Reading" score={`${pairTotal} pairs`} onExit={onExit}>
    <CompletionCard title="Every lantern is glowing!" message="You matched the words by sight and sound." score={`${pairTotal} pairs in ${turns} turns`} onDone={() => onComplete({ label: 'Memory Lanterns', kind: 'Ninja game', correct: pairTotal, total: Math.max(turns, pairTotal) })} />
  </GameShell>

  return <GameShell title="Memory Lanterns" eyebrow="Ninja Skills · Reading" score={`${matched.length}/${pairTotal} pairs`} onExit={onExit}>
    <section className="k-game-card">
      <p className="k-round-label">Match two lanterns with the same word</p>
      <AudioFailureNotice message={audioError} onRetry={() => void playWord(retryWord)} />
      <div className="k-memory-grid">
        {deck.map((card) => {
          const visible = flipped.includes(card.id) || matched.includes(card.word)
          return <button className={`k-memory-card${visible ? ' visible' : ''}${matched.includes(card.word) ? ' matched' : ''}`} type="button" key={card.id} disabled={pairReady || matched.includes(card.word)} onClick={() => flip(card)}>
            <span aria-hidden={!visible}>{visible ? card.word : '🏮'}</span>
          </button>
        })}
      </div>
      {pairReady && <div className={`k-game-feedback ${isMatch ? 'correct' : 'wrong'}`}>
        <strong>{isMatch ? 'A matching pair!' : 'Not a match yet. Remember where they are!'}</strong>
        <button className="k-primary" type="button" onClick={continueGame}>{isMatch ? 'Keep going' : 'Turn them back'} <RotateCcw size={16} /></button>
      </div>}
    </section>
  </GameShell>
}

export function CurrentWeekReading({ words, onExit, onComplete, speak }: {
  words: string[]
  onExit: () => void
  onComplete: (score: CompleteScore) => void
  speak: GameSpeak
}) {
  const rounds = distinctWords(words)
  const [index, setIndex] = useState(0)
  const [correct, setCorrect] = useState(0)
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
    if (index + 1 >= rounds.length) setComplete(true)
    else setIndex((value) => value + 1)
  }

  if (complete) return <GameShell title="High-frequency words" eyebrow="Current week · Reading" score={`${correct}/${rounds.length}`} onExit={onExit}>
    <CompletionCard title="Wonderful reading!" message="You looked, listened, and said every word from this week." score={`${correct} of ${rounds.length} strong today`} onDone={() => onComplete({ label: 'High-frequency words', kind: 'Current week', correct, total: rounds.length })} />
  </GameShell>

  return <GameShell title="High-frequency words" eyebrow="Current week · Reading" score={`${correct}/${index}`} onExit={onExit}>
    <section className="k-game-card k-weekly-reading">
      <p className="k-round-label">Reading word {index + 1} of {rounds.length}</p>
      <h2>Look, listen, and say it</h2>
      <div className="k-reveal-word">{word}</div>
      <p>Point to the word, listen, then say it aloud.</p>
      <button className="k-listen-button" type="button" onClick={() => void playWord()}><Volume2 size={24} /> Hear the word</button>
      <AudioFailureNotice message={audioError} onRetry={() => void playWord()} />
      <p className="k-self-check-prompt">Did you say it correctly?</p>
      <div className="k-self-check-actions">
        <button className="k-game-wrong" type="button" onClick={() => answer(false)}><X size={17} /> Practice again</button>
        <button className="k-game-right" type="button" onClick={() => answer(true)}><Check size={17} /> I said it!</button>
      </div>
    </section>
  </GameShell>
}

export function MasteryWarmup({ words, onExit, onAnswer, onComplete, playWord }: {
  words: Word[]
  onExit: () => void
  onAnswer: (word: Word, correct: boolean) => void
  onComplete: (score: CompleteScore) => void
  playWord: (word: Word) => PromptAudioAttempt
}) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [correct, setCorrect] = useState(0)
  const [complete, setComplete] = useState(false)
  const [audioStatus, setAudioStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [audioMessage, setAudioMessage] = useState('')
  const activeAudioRef = useRef<PromptAudioAttempt>(undefined)
  const word = words[index]
  const isReading = word?.tier === 'tier-2'

  const observeAudio = useCallback((attempt: PromptAudioAttempt) => {
    stopPromptAudio(activeAudioRef.current)
    activeAudioRef.current = attempt
    setAudioStatus('loading')
    setAudioMessage('')
    void promptAudioStarted(attempt).then(() => {
      if (activeAudioRef.current === attempt) setAudioStatus('ready')
    }).catch((audioError) => {
      if (activeAudioRef.current !== attempt) return
      setAudioStatus('error')
      setAudioMessage(audioError instanceof Error ? audioError.message : 'The word audio could not play.')
    })
  }, [])

  const replayAudio = useCallback(() => {
    if (word) observeAudio(playWord(word))
  }, [observeAudio, playWord, word])

  useEffect(() => {
    if (!word || complete) return
    const attempt = playWord(word)
    observeAudio(attempt)
    return () => {
      stopPromptAudio(attempt)
      if (activeAudioRef.current === attempt) activeAudioRef.current = undefined
    }
  }, [complete, observeAudio, playWord, word])

  useEffect(() => () => stopPromptAudio(activeAudioRef.current), [])

  function answer(value: boolean) {
    onAnswer(word, value)
    const nextCorrect = correct + (value ? 1 : 0)
    setCorrect(nextCorrect)
    if (index + 1 >= words.length) setComplete(true)
    else { setIndex((value) => value + 1); setRevealed(false) }
  }

  if (complete) return <GameShell title="The Spirit Realm" eyebrow="Adaptive mastery warmup" score={`${correct}/${words.length}`} onExit={onExit}>
    <CompletionCard title="Your mastery power is growing!" message="Words marked “practice again” will return sooner in the next warmup." score={`${correct} of ${words.length} strong today`} onDone={() => onComplete({ label: 'Mastery warmup', kind: 'Spirit Realm', correct, total: words.length })} />
  </GameShell>

  return <GameShell title="The Spirit Realm" eyebrow="Adaptive mastery warmup" score={`${correct}/${index}`} onExit={onExit}>
    <section className="k-game-card k-spirit-game">
      <p className="k-round-label">Mastery word {index + 1} of {words.length} · {isReading ? 'Reading' : 'Writing'}</p>
      <div className="k-game-mascot" aria-hidden="true">🌙</div>
      {!revealed ? <>
        <h2>{isReading ? 'Listen, then say the word' : 'Listen, then write the character'}</h2>
        <p>{isReading ? 'Say it aloud before you reveal it.' : 'Write it in the air or on paper before you reveal it.'}</p>
        <button className="k-listen-button" type="button" onClick={replayAudio}><Volume2 size={24} /> Hear the word</button>
        {audioStatus === 'loading' && <p className="k-round-label" role="status">Playing the word…</p>}
        {audioStatus === 'ready' && <p className="k-round-label" role="status">The word played automatically.</p>}
        {audioStatus === 'error' && <p className="recording-error" role="alert">{audioMessage} Tap Hear the word to try again.</p>}
        <button className="k-primary" type="button" onClick={() => setRevealed(true)}>Reveal the word <Sparkles size={17} /></button>
      </> : <>
        <p className="k-eyebrow">The word was</p>
        <div className="k-reveal-word">{word.text}</div>
        <p>{isReading ? 'Did you say it correctly?' : 'Does your writing match?'}</p>
        <div className="k-self-check-actions">
          <button className="k-game-wrong" type="button" onClick={() => answer(false)}><X size={17} /> Practice again</button>
          <button className="k-game-right" type="button" onClick={() => answer(true)}><Check size={17} /> I got it!</button>
        </div>
      </>}
    </section>
  </GameShell>
}

export function NinjaRecord({ scores }: { scores: KindergartenScoreRecord[] }) {
  const attempts = scores.reduce((total, score) => total + score.total, 0)
  const correct = scores.reduce((total, score) => total + score.correct, 0)
  const percent = attempts ? Math.round((correct / attempts) * 100) : 0
  return <section className="k-scoreboard" aria-label="Ninja score record">
    <div className="k-scoreboard-heading">
      <div><p className="k-eyebrow">Your progress</p><h2>Ninja Record</h2></div>
      <div className="k-score-total"><strong>{scores.length ? `${percent}%` : '—'}</strong><span>{scores.length ? `${correct} of ${attempts} correct` : 'No scores yet'}</span></div>
    </div>
    {scores.length ? <div className="k-score-list">
      {scores.slice(-4).reverse().map((score) => <article key={score.id}>
        <span>{score.kind}</span>
        <strong>{score.label}</strong>
        <b>{score.correct}/{score.total}</b>
      </article>)}
    </div> : <p className="k-empty-score">Finish a Dojo activity, game, Final Boss review, or Spirit Realm warmup to add a score here.</p>}
    <small>Development lab: these scores stay only for this open visit and are not saved to a child account.</small>
  </section>
}
