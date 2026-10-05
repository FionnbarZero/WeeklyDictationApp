import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Clock3, RotateCcw, Volume2, Zap } from 'lucide-react'
import type { LearningGameAttempt } from './runtime/contracts'
import type { PairGameProps } from './runtime/PairGameShared'
import { summarizeLearningGame, validGamePairs } from './runtime/model'
import { LearningGameComplete, LearningGameEmpty, LearningGameShell } from './runtime/GameShell'
import { playGameSound } from './runtime/gameFeel'

type SpeedMatchCard = {
  readonly id: string
  readonly pairId: string
  readonly label: string
  readonly accessibleLabel?: string
  readonly audioText: string
  readonly audioLanguage: 'zh-CN' | 'en-US'
  readonly kind: 'word' | 'meaning'
}

type MatchFeedback = 'correct' | 'incorrect' | null
type StrikeQuality = 'lightning' | 'clean' | 'miss' | null

const MISSION_SECONDS = 60
const LIGHTNING_SECONDS = 3

function shuffled<T>(values: readonly T[]) {
  const next = [...values]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }
  return next
}

function reshuffleUnmatched(cards: readonly SpeedMatchCard[], matchedPairIds: readonly string[]) {
  const unmatched = shuffled(cards.filter((card) => !matchedPairIds.includes(card.pairId)))
  let nextIndex = 0
  return cards.map((card) => matchedPairIds.includes(card.pairId) ? card : unmatched[nextIndex++])
}

function strikeCoordinates(cards: readonly SpeedMatchCard[], selectedCardIds: readonly string[]) {
  if (selectedCardIds.length !== 2) return null
  const indexes = selectedCardIds.map((id) => cards.findIndex((card) => card.id === id))
  if (indexes.some((index) => index < 0)) return null
  const center = (index: number) => ({
    x: ((index % 4) + .5) * 25,
    y: (Math.floor(index / 4) + .5) * 25,
  })
  return { from: center(indexes[0]), to: center(indexes[1]) }
}

function missionRank(accuracy: number, timeLeft: number, bestStreak: number) {
  if (accuracy >= .9 && timeLeft >= 20 && bestStreak >= 5) return 'Shadow Master'
  if (accuracy >= .8 && timeLeft >= 10) return 'Silent Blade'
  return 'Rooftop Runner'
}

export function SpeedMatch({
  pairs,
  playAudio,
  title = 'Shuriken Match',
  eyebrow = 'Ninja fluency mission',
  onExit,
  onAttempt,
  onComplete,
}: PairGameProps) {
  const initialCards = useMemo<readonly SpeedMatchCard[]>(() => shuffled([
    ...pairs.map((pair) => ({
      id: pair.left.id,
      pairId: pair.id,
      label: pair.left.label,
      accessibleLabel: pair.left.accessibleLabel,
      audioText: pair.left.label,
      audioLanguage: 'zh-CN' as const,
      kind: 'word' as const,
    })),
    ...pairs.map((pair) => ({
      id: pair.right.id,
      pairId: pair.id,
      label: pair.right.label,
      accessibleLabel: pair.right.accessibleLabel,
      audioText: pair.right.label,
      audioLanguage: 'en-US' as const,
      kind: 'meaning' as const,
    })),
  ]), [pairs])
  const [cards, setCards] = useState(initialCards)
  const [selectedCardIds, setSelectedCardIds] = useState<readonly string[]>([])
  const [matchedPairIds, setMatchedPairIds] = useState<readonly string[]>([])
  const [attempts, setAttempts] = useState<readonly LearningGameAttempt[]>([])
  const [feedback, setFeedback] = useState<MatchFeedback>(null)
  const [strikeQuality, setStrikeQuality] = useState<StrikeQuality>(null)
  const [lastMessage, setLastMessage] = useState('Tap a word seal to begin the rooftop mission.')
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [timeLeft, setTimeLeft] = useState(MISSION_SECONDS)
  const [missionStarted, setMissionStarted] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const selectionStartedAt = useRef(0)
  const valid = validGamePairs(pairs)
  const missionFinished = valid && matchedPairIds.length === pairs.length
  const complete = missionFinished && !feedback
  const strike = strikeCoordinates(cards, selectedCardIds)
  const correctAttempts = attempts.filter((attempt) => attempt.correct).length
  const accuracy = attempts.length ? correctAttempts / attempts.length : 1
  const rank = missionRank(accuracy, timeLeft, bestStreak)
  const stageStyle = {
    '--shuriken-progress': `${pairs.length ? (matchedPairIds.length / pairs.length) * 79 : 0}%`,
  } as CSSProperties

  useEffect(() => {
    if (!missionStarted || timedOut || missionFinished) return
    const timer = window.setInterval(() => setTimeLeft((current) => Math.max(0, current - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [missionFinished, missionStarted, timedOut])

  useEffect(() => {
    if (timeLeft > 0 || !missionStarted || missionFinished) return
    setMissionStarted(false)
    setTimedOut(true)
    setSelectedCardIds([])
    setFeedback(null)
    setStrikeQuality(null)
    setLastMessage('The moon gate closed. Reset the mission and strike faster.')
  }, [missionFinished, missionStarted, timeLeft])

  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => {
      if (feedback === 'incorrect') setCards((current) => reshuffleUnmatched(current, matchedPairIds))
      setSelectedCardIds([])
      setFeedback(null)
      setStrikeQuality(null)
    }, feedback === 'correct' ? 520 : 650)
    return () => window.clearTimeout(timer)
  }, [feedback, matchedPairIds])

  function resetMission() {
    setCards(shuffled(initialCards))
    setSelectedCardIds([])
    setMatchedPairIds([])
    setFeedback(null)
    setStrikeQuality(null)
    setLastMessage('Tap a word seal to begin the rooftop mission.')
    setStreak(0)
    setBestStreak(0)
    setTimeLeft(MISSION_SECONDS)
    setMissionStarted(false)
    setTimedOut(false)
    selectionStartedAt.current = 0
  }

  function resolve(first: SpeedMatchCard, second: SpeedMatchCard, spoken: Promise<void>) {
    const pair = pairs.find((candidate) => candidate.id === first.pairId)
    if (!pair) return
    const correct = first.pairId === second.pairId
    const responseSeconds = Math.max(0, (performance.now() - selectionStartedAt.current) / 1000)
    const lightning = correct && responseSeconds <= LIGHTNING_SECONDS
    const attempt: LearningGameAttempt = {
      gameId: 'speed-match',
      promptId: pair.id,
      targetId: pair.targetId,
      correct,
      response: [first.id, second.id],
      assessmentMode: 'automatic',
    }
    setAttempts((current) => [...current, attempt])
    onAttempt?.(attempt)
    setFeedback(correct ? 'correct' : 'incorrect')
    setStrikeQuality(correct ? (lightning ? 'lightning' : 'clean') : 'miss')
    void spoken.then(() => playGameSound(correct ? 'correct' : 'incorrect'))

    if (correct) {
      setMatchedPairIds((current) => current.includes(pair.id) ? current : [...current, pair.id])
      setStreak((current) => {
        const next = current + 1
        setBestStreak((best) => Math.max(best, next))
        return next
      })
      setLastMessage(lightning
        ? `Lightning strike! ${first.label} matches ${second.label}.`
        : `Clean strike! ${first.label} matches ${second.label}.`)
    } else {
      setStreak(0)
      setLastMessage('Decoy seals! Watch the smoke—they are changing positions.')
    }
  }

  function choose(card: SpeedMatchCard, spoken: Promise<void>) {
    if (feedback || timedOut || matchedPairIds.includes(card.pairId) || selectedCardIds.includes(card.id)) return
    if (!missionStarted) setMissionStarted(true)
    const next = [...selectedCardIds, card.id]
    setSelectedCardIds(next)
    if (next.length === 1) {
      selectionStartedAt.current = performance.now()
      setLastMessage('Seal armed. Find its matching shadow before the lightning bonus fades.')
      return
    }
    const first = cards.find((candidate) => candidate.id === next[0])
    if (first) resolve(first, card, spoken)
  }

  const summary = summarizeLearningGame('speed-match', attempts)
  return <LearningGameShell
    gameId="speed-match"
    title={title}
    eyebrow={eyebrow}
    progress={`${matchedPairIds.length}/${pairs.length} seals · ${timeLeft}s`}
    onExit={onExit}
  >
    {!valid ? <LearningGameEmpty onExit={onExit} /> : complete ? <LearningGameComplete
      summary={summary}
      message={`${rank} rank earned with ${timeLeft} seconds remaining and a ${bestStreak}× best streak.`}
      onDone={() => onComplete(summary)}
    /> : <section className="lg-card lg-speed-card">
      <div className={`lg-shuriken-stage${feedback ? ` is-${feedback}` : ''}${strikeQuality === 'lightning' ? ' is-lightning' : ''}`} style={stageStyle}>
        <div className="lg-shuriken-sky" aria-hidden="true"><i /><i /><i /></div>
        <div className="lg-shuriken-moon" aria-hidden="true" />
        <div className="lg-shuriken-roofs" aria-hidden="true"><i /><i /><i /><i /></div>
        <div className="lg-shuriken-dojo" aria-hidden="true"><i /><b /><em /></div>
        <div className="lg-rooftop-ninja" aria-hidden="true"><i /><b /><em /><span /></div>
        <div className="lg-rooftop-checkpoints" aria-hidden="true">
          {pairs.map((pair) => <i key={pair.id} className={matchedPairIds.includes(pair.id) ? 'is-cleared' : ''} />)}
        </div>
        <div className="lg-shuriken-brief">
          <span>Rooftop rush · {pairs.length} {pairs.length === 1 ? 'target' : 'targets'}</span>
          <strong>Match the seals. Reach the dojo.</strong>
          <small>Click to hear each word. Match Mandarin with English before the moon gate closes.</small>
        </div>
        <div className={`lg-moon-timer${timeLeft <= 10 ? ' is-danger' : ''}`} aria-label={`${timeLeft} seconds remaining`}>
          <Clock3 size={17} /><strong>{timeLeft}</strong><span>sec</span>
        </div>
        <div className={`lg-stealth-streak${streak >= 3 ? ' is-hot' : ''}`}><Zap size={16} /><strong>{streak}×</strong><span>stealth streak</span></div>
      </div>

      <div className="lg-shuriken-stat-row" aria-live="polite">
        <span><strong>{matchedPairIds.length}</strong> targets cleared</span>
        <span><strong>{bestStreak}×</strong> best streak</span>
        <span><strong>{Math.round(accuracy * 100)}%</strong> accuracy</span>
      </div>

      <div className={`lg-shuriken-board${feedback ? ` is-${feedback}` : ''}${timedOut ? ' is-timeout' : ''}`}>
        <div className="lg-seal-grid">
          {cards.map((card) => <button
            key={card.id}
            type="button"
            className={`lg-choice lg-word-seal is-${card.kind}${selectedCardIds.includes(card.id) ? ' is-selected' : ''}${matchedPairIds.includes(card.pairId) ? ' is-matched' : ''}`}
            disabled={matchedPairIds.includes(card.pairId) || Boolean(feedback) || timedOut}
            aria-label={`${card.accessibleLabel || card.label}. Click to hear and select.`}
            onClick={() => {
              const spoken = Promise.resolve(playAudio?.(card.audioText, card.audioLanguage)).then(() => undefined, () => undefined)
              choose(card, spoken)
            }}
          >
            <Volume2 size={15} aria-hidden="true" />
            <span lang={card.kind === 'word' ? 'zh-Hans' : undefined}>{card.label}</span>
            <small>{card.kind === 'word' ? 'word seal' : 'shadow meaning'}</small>
            <i aria-hidden="true" />
          </button>)}
        </div>
        {feedback && strike && <svg className="lg-shuriken-strike" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1={strike.from.x} y1={strike.from.y} x2={strike.to.x} y2={strike.to.y} pathLength="1" />
          <circle cx={strike.from.x} cy={strike.from.y} r="2.5" />
          <circle cx={strike.to.x} cy={strike.to.y} r="2.5" />
          <text x={(strike.from.x + strike.to.x) / 2} y={(strike.from.y + strike.to.y) / 2}>✦</text>
        </svg>}
        {timedOut && <div className="lg-shuriken-timeout" role="status">
          <span>Moon gate closed</span>
          <strong>{matchedPairIds.length} of {pairs.length} targets cleared</strong>
          <p>Your word knowledge is safe. Reset the clock and try a faster route.</p>
          <button type="button" className="lg-primary" onClick={resetMission}><RotateCcw size={17} /> Restart mission</button>
        </div>}
      </div>

      <div className={`lg-shuriken-status${feedback ? ` is-${feedback}` : ''}`} role="status">
        <strong>{lastMessage}</strong>
        <span>{feedback === 'correct'
          ? strikeQuality === 'lightning' ? 'Lightning bonus · ninja advancing!' : 'Target cleared · ninja advancing!'
          : feedback === 'incorrect' ? 'Smoke reset · stay sharp!' : 'Hear it. Match it. Strike fast.'}</span>
      </div>
    </section>}
  </LearningGameShell>
}
