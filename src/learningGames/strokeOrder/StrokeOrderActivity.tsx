import { activityClock, pauseToFamilyHub } from '../../activity/activityLifecycle.ts'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react'
import { Brush, Check, Eraser, EyeOff, Play, RotateCcw, Save, Sparkles, Undo2, Volume2, X } from 'lucide-react'
import type { LearningGameAttempt } from '../contracts.ts'
import { summarizeLearningGame } from '../model.ts'
import type { StrokeDrawing, StrokeOrderActivityProps, StrokeOrderRound, StrokePoint } from './contracts.ts'
import './strokeOrder.css'

type InkStroke = StrokePoint[]
type InkDrawing = InkStroke[]
type ActivityPhase = 'copy' | 'copy-review' | 'memory' | 'memory-review'
type Feedback = 'correct' | 'incorrect'
type NarrationState = 'idle' | 'playing' | 'ready' | 'error'

const strokeAnimationStaggerSeconds = 0.55
const strokeAnimationDurationSeconds = 0.46

function modelAnimationDurationMs(strokeCount: number) {
  if (strokeCount <= 0) return 0
  return ((strokeCount - 1) * strokeAnimationStaggerSeconds + strokeAnimationDurationSeconds) * 1000
}

function strokePath(points: readonly StrokePoint[]) {
  return points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ')
}

function serializeStroke(stroke: readonly StrokePoint[]) {
  return stroke.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(' ')
}

function pointFromClient(clientX: number, clientY: number, bounds: DOMRect, viewBoxWidth: number): StrokePoint {
  const x = Math.max(0, Math.min(viewBoxWidth, ((clientX - bounds.left) / bounds.width) * viewBoxWidth))
  const y = Math.max(0, Math.min(100, ((clientY - bounds.top) / bounds.height) * 100))
  return [x, y]
}

function appendDistinctPoint(points: InkStroke, point: StrokePoint) {
  const previous = points[points.length - 1]
  if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) >= 0.18) points.push(point)
}

function simplifyStroke(points: readonly StrokePoint[]) {
  if (points.length <= 2) return [...points]
  const simplified: StrokePoint[] = [points[0]]
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1]
    const point = points[index]
    if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) >= 0.3) simplified.push(point)
  }
  const finalPoint = points[points.length - 1]
  if (simplified[simplified.length - 1] !== finalPoint) simplified.push(finalPoint)
  return simplified
}

function PracticeGrid({ characterCount }: { readonly characterCount: number }) {
  return (
    <g className="so-grid-lines" aria-hidden="true">
      {Array.from({ length: characterCount }, (_, index) => (
        <g key={index} transform={`translate(${index * 100} 0)`}>
          <rect x="3" y="3" width="94" height="94" rx="2" />
          <path d="M50 3v94M3 50h94M3 3l94 94M97 3 3 97" />
        </g>
      ))}
    </g>
  )
}

function StrokePad({
  round,
  strokes,
  onStrokeComplete,
  showGuide,
  animationKey,
  label,
}: {
  readonly round: StrokeOrderRound
  readonly strokes: StrokeDrawing
  readonly onStrokeComplete?: (stroke: InkStroke) => void
  readonly showGuide: boolean
  readonly animationKey: number
  readonly label: string
}) {
  const activePointer = useRef<number | null>(null)
  const activePoints = useRef<InkStroke>([])
  const activePath = useRef<SVGPathElement | null>(null)
  const padBounds = useRef<DOMRect | null>(null)
  const paintFrame = useRef<number | null>(null)
  const interactive = Boolean(onStrokeComplete)
  const characterCount = Math.max(1, [...round.targetText].length)
  const viewBoxWidth = characterCount * 100

  useEffect(
    () => () => {
      if (paintFrame.current !== null) activityClock.cancelAnimationFrame(paintFrame.current)
    },
    [],
  )

  function paintActiveStroke() {
    paintFrame.current = null
    activePath.current?.setAttribute('d', strokePath(activePoints.current))
  }

  function scheduleActivePaint() {
    if (paintFrame.current === null) paintFrame.current = activityClock.requestAnimationFrame(paintActiveStroke)
  }

  function beginStroke(event: ReactPointerEvent<SVGSVGElement>) {
    if (!onStrokeComplete || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointer.current = event.pointerId
    padBounds.current = event.currentTarget.getBoundingClientRect()
    activePoints.current = [pointFromClient(event.clientX, event.clientY, padBounds.current, viewBoxWidth)]
    scheduleActivePaint()
  }

  function continueStroke(event: ReactPointerEvent<SVGSVGElement>) {
    if (!onStrokeComplete || activePointer.current !== event.pointerId || !padBounds.current) return
    event.preventDefault()
    const coalesced =
      typeof event.nativeEvent.getCoalescedEvents === 'function' ? event.nativeEvent.getCoalescedEvents() : []
    const samples = coalesced.length > 0 ? coalesced : [event.nativeEvent]
    samples.forEach((sample) =>
      appendDistinctPoint(
        activePoints.current,
        pointFromClient(sample.clientX, sample.clientY, padBounds.current!, viewBoxWidth),
      ),
    )
    scheduleActivePaint()
  }

  function endStroke(event: ReactPointerEvent<SVGSVGElement>) {
    if (activePointer.current !== event.pointerId) return
    if (event.type === 'pointerup' && padBounds.current) {
      appendDistinctPoint(
        activePoints.current,
        pointFromClient(event.clientX, event.clientY, padBounds.current, viewBoxWidth),
      )
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (paintFrame.current !== null) {
      activityClock.cancelAnimationFrame(paintFrame.current)
      paintFrame.current = null
    }
    const completedStroke = simplifyStroke(activePoints.current)
    if (completedStroke.length >= 2) onStrokeComplete?.(completedStroke)
    activePath.current?.removeAttribute('d')
    activePointer.current = null
    activePoints.current = []
    padBounds.current = null
  }

  return (
    <div
      className={`so-stroke-pad${characterCount === 1 ? ' is-single-character' : ''}${interactive ? ' is-interactive' : ' is-saved'}${showGuide ? ' has-guide' : ''}`}
      style={{ aspectRatio: `${characterCount} / 1` }}
    >
      <svg
        viewBox={`0 0 ${viewBoxWidth} 100`}
        role={interactive ? 'application' : 'img'}
        aria-label={label}
        tabIndex={interactive ? 0 : undefined}
        onPointerDown={beginStroke}
        onPointerMove={continueStroke}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      >
        <PracticeGrid characterCount={characterCount} />
        {showGuide && (
          <g className="so-stroke-guide" key={`${round.id}-${animationKey}`} aria-hidden="true">
            {round.strokes.map((stroke, index) => (
              <path
                key={`${round.id}-guide-${index}`}
                d={strokePath(stroke)}
                pathLength={1}
                style={{
                  animationDelay: `${index * strokeAnimationStaggerSeconds}s`,
                  animationDuration: `${strokeAnimationDurationSeconds}s`,
                }}
              />
            ))}
            {round.strokes.map((stroke, index) => (
              <g
                className="so-stroke-marker"
                key={`${round.id}-marker-${index}`}
                style={{ animationDelay: `${index * strokeAnimationStaggerSeconds}s` }}
              >
                <circle cx={stroke[0][0]} cy={stroke[0][1]} r="4.3" />
                <text x={stroke[0][0]} y={stroke[0][1] + 1.7}>
                  {round.strokeLabels[index]}
                </text>
              </g>
            ))}
            {round.strokes.map((stroke, index) => (
              <circle className="so-stroke-brush" key={`${round.id}-brush-${index}`} r="2.7">
                <animateMotion
                  path={strokePath(stroke)}
                  begin={`${index * strokeAnimationStaggerSeconds}s`}
                  dur={`${strokeAnimationDurationSeconds}s`}
                  fill="freeze"
                />
                <animate
                  attributeName="opacity"
                  values="0;1;1;0"
                  keyTimes="0;.08;.82;1"
                  begin={`${index * strokeAnimationStaggerSeconds}s`}
                  dur={`${strokeAnimationDurationSeconds}s`}
                  fill="freeze"
                />
              </circle>
            ))}
          </g>
        )}
        <g className="so-student-ink">
          {strokes.map((stroke, index) => (
            <path key={`ink-${index}`} d={strokePath(stroke)} />
          ))}
          {interactive && <path className="so-active-ink" ref={activePath} />}
        </g>
      </svg>
      <span className="so-pad-label">{label}</span>
    </div>
  )
}

function ReferencePad({ round }: { readonly round: StrokeOrderRound }) {
  const characters = [...round.targetText]
  const viewBoxWidth = Math.max(1, characters.length) * 100
  return (
    <div
      className={`so-stroke-pad is-reference${characters.length === 1 ? ' is-single-character' : ''}`}
      style={{ aspectRatio: `${characters.length} / 1` }}
    >
      <svg viewBox={`0 0 ${viewBoxWidth} 100`} role="img" aria-label={`Correct writing: ${round.targetText}`}>
        <PracticeGrid characterCount={characters.length} />
        {characters.map((character, index) => (
          <text
            key={`${character}-${index}`}
            className="so-reference-character"
            x={50 + index * 100}
            y="76"
            textAnchor="middle"
          >
            {character}
          </text>
        ))}
        {round.strokes.map((stroke, index) => (
          <g className="so-reference-marker" key={`${round.id}-reference-${index}`}>
            <circle cx={stroke[0][0]} cy={stroke[0][1]} r="4.3" />
            <text x={stroke[0][0]} y={stroke[0][1] + 1.7}>
              {round.strokeLabels[index]}
            </text>
          </g>
        ))}
      </svg>
      <span className="so-pad-label">Correct writing · {round.meaning}</span>
    </div>
  )
}

function DrawingTools({
  drawing,
  setDrawing,
}: {
  readonly drawing: InkDrawing
  readonly setDrawing: Dispatch<SetStateAction<InkDrawing>>
}) {
  return (
    <div className="so-tools">
      <button type="button" disabled={!drawing.length} onClick={() => setDrawing((current) => current.slice(0, -1))}>
        <Undo2 size={17} /> Undo stroke
      </button>
      <button type="button" disabled={!drawing.length} onClick={() => setDrawing([])}>
        <Eraser size={17} /> Clear pad
      </button>
    </div>
  )
}

function Countdown({
  countdownKey,
  durationSeconds,
  active,
  onComplete,
}: {
  readonly countdownKey: string
  readonly durationSeconds: number
  readonly active: boolean
  readonly onComplete: () => void
}) {
  const [seconds, setSeconds] = useState(durationSeconds)
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])
  useEffect(() => {
    setSeconds(durationSeconds)
    if (!active) return
    let remaining = durationSeconds
    const timer = activityClock.setInterval(() => {
      remaining -= 1
      setSeconds(Math.max(0, remaining))
      if (remaining <= 0) {
        activityClock.clearInterval(timer)
        onCompleteRef.current()
      }
    }, 1000)
    return () => activityClock.clearInterval(timer)
  }, [active, countdownKey, durationSeconds])
  return <>{seconds}s</>
}

function ActivityShell({
  activityId,
  grade,
  title,
  eyebrow,
  sourceLabel,
  progress,
  onExit,
  children,
}: Pick<StrokeOrderActivityProps, 'activityId' | 'grade' | 'title' | 'eyebrow' | 'sourceLabel' | 'onExit'> & {
  readonly progress: string
  readonly children: React.ReactNode
}) {
  return (
    <section
      className={`so-shell is-${grade === 'Kindergarten' ? 'kindergarten' : 'grade2'}`}
      data-activity-id={activityId}
      data-report-activity={title}
    >
      <div className="so-atmosphere" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="so-topbar">
        <button className="so-exit" type="button" onClick={() => { if (!pauseToFamilyHub()) onExit() }}>
          <X size={18} /> Exit game
        </button>
        <div className="so-progress" aria-label={`Stroke Order progress: ${progress}`}>
          <Sparkles size={14} aria-hidden="true" />
          <span>{sourceLabel}</span>
          <strong>{progress}</strong>
        </div>
      </div>
      <header className="so-heading">
        <p>{eyebrow}</p>
        <h1>{title}</h1>
      </header>
      {children}
    </section>
  )
}

export function StrokeOrderActivity({
  activityId,
  grade,
  title,
  eyebrow,
  sourceLabel,
  rounds,
  unsupportedTargets,
  timing,
  playAudio,
  onExit,
  onAttempt,
  onComplete,
}: StrokeOrderActivityProps) {
  const [roundIndex, setRoundIndex] = useState(0)
  const [phase, setPhase] = useState<ActivityPhase>('copy')
  const [correction, setCorrection] = useState(false)
  const [traceDrawing, setTraceDrawing] = useState<InkDrawing>([])
  const [memoryDrawing, setMemoryDrawing] = useState<InkDrawing>([])
  const [savedDrawing, setSavedDrawing] = useState<InkDrawing>([])
  const [animationKey, setAnimationKey] = useState(0)
  const [modelAnimating, setModelAnimating] = useState(true)
  const [narrationKey, setNarrationKey] = useState(0)
  const [narrationState, setNarrationState] = useState<NarrationState>('idle')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [attempts, setAttempts] = useState<readonly LearningGameAttempt[]>([])
  const [complete, setComplete] = useState(false)
  const narrationRequestRef = useRef(0)
  const transitionTimerRef = useRef<number | null>(null)
  const round = rounds[roundIndex]

  useEffect(() => {
    window.scrollTo(0, 0)
    return () => {
      if (transitionTimerRef.current !== null) activityClock.clearTimeout(transitionTimerRef.current)
    }
  }, [])

  const playCurrentNarration = useCallback(() => {
    if (!round || !playAudio) return
    const request = ++narrationRequestRef.current
    setNarrationState('playing')
    void Promise.resolve(playAudio(round.audioText)).then(
      () => {
        if (request === narrationRequestRef.current) setNarrationState('ready')
      },
      () => {
        if (request === narrationRequestRef.current) setNarrationState('error')
      },
    )
  }, [playAudio, round])

  useEffect(() => {
    playCurrentNarration()
    return () => {
      narrationRequestRef.current += 1
    }
  }, [narrationKey, playCurrentNarration])

  useEffect(() => {
    if (!round || phase !== 'copy' || !modelAnimating) return
    const timer = activityClock.setTimeout(() => setModelAnimating(false), modelAnimationDurationMs(round.strokes.length))
    return () => activityClock.clearTimeout(timer)
  }, [animationKey, modelAnimating, phase, round])

  function resetDrawings() {
    setTraceDrawing([])
    setMemoryDrawing([])
    setSavedDrawing([])
  }

  function beginCopy(isCorrection: boolean) {
    resetDrawings()
    setCorrection(isCorrection)
    setPhase('copy')
    setModelAnimating(true)
    setAnimationKey((current) => current + 1)
  }

  function beginMemory() {
    resetDrawings()
    setPhase('memory')
    setFeedback(null)
    setNarrationKey((current) => current + 1)
  }

  function reviewCopy() {
    if (phase !== 'copy') return
    setSavedDrawing(traceDrawing.map((stroke) => [...stroke]))
    setPhase('copy-review')
  }

  function reviewMemory() {
    if (phase !== 'memory') return
    setSavedDrawing(memoryDrawing.map((stroke) => [...stroke]))
    setPhase('memory-review')
  }

  function assessCopy(correct: boolean) {
    if (feedback || phase !== 'copy-review') return
    setFeedback(correct ? 'correct' : 'incorrect')
    transitionTimerRef.current = activityClock.setTimeout(
      () => {
        transitionTimerRef.current = null
        if (correct) beginMemory()
        else {
          setFeedback(null)
          beginCopy(true)
        }
      },
      correct ? 700 : 1100,
    )
  }

  function assessMemory(correct: boolean) {
    if (!round || feedback || phase !== 'memory-review') return
    const attempt: LearningGameAttempt = {
      gameId: activityId,
      promptId: `${round.id}:memory:${attempts.length + 1}`,
      targetId: round.targetId,
      correct,
      response: savedDrawing.map(serializeStroke),
      assessmentMode: 'self-assessment',
    }
    const nextAttempts = [...attempts, attempt]
    setAttempts(nextAttempts)
    onAttempt?.(attempt)
    setFeedback(correct ? 'correct' : 'incorrect')
    transitionTimerRef.current = activityClock.setTimeout(
      () => {
        transitionTimerRef.current = null
        setFeedback(null)
        if (!correct) {
          beginCopy(true)
          return
        }
        if (roundIndex + 1 >= rounds.length) {
          setComplete(true)
          return
        }
        setRoundIndex((current) => current + 1)
        setCorrection(false)
        resetDrawings()
        setPhase('copy')
        setModelAnimating(true)
        setAnimationKey((current) => current + 1)
      },
      correct ? 900 : 1300,
    )
  }

  function recordStroke(kind: 'trace' | 'memory', stroke: InkStroke) {
    if (kind === 'trace') setTraceDrawing((current) => [...current, stroke])
    else setMemoryDrawing((current) => [...current, stroke])
  }

  function replayModel() {
    setModelAnimating(true)
    setAnimationKey((current) => current + 1)
  }

  const summary = summarizeLearningGame(activityId, attempts)
  const completedTargets = new Set(attempts.filter((attempt) => attempt.correct).map((attempt) => attempt.targetId))
    .size

  return (
    <ActivityShell
      activityId={activityId}
      grade={grade}
      title={title}
      eyebrow={eyebrow}
      sourceLabel={sourceLabel}
      progress={`${completedTargets}/${rounds.length}`}
      onExit={onExit}
    >
      {rounds.length === 0 ? (
        <section className="so-card so-empty" role="status">
          <div className="so-empty-mark" aria-hidden="true">
            字
          </div>
          <h2>Stroke practice is not ready for this set.</h2>
          <p>
            {unsupportedTargets.length > 0
              ? `Stroke data is missing for: ${unsupportedTargets.join('、')}.`
              : 'This curriculum set has no writing targets.'}
          </p>
          <p>The full cohort is paused so no weekly target is silently skipped.</p>
          <button className="so-primary" type="button" onClick={onExit}>
            Return to the Dojo
          </button>
        </section>
      ) : complete ? (
        <section className="so-card so-complete" aria-live="polite">
          <span className="so-complete-mark">
            <Check size={34} />
          </span>
          <p className="so-kicker">Challenge complete</p>
          <h2>
            {rounds.length} target{rounds.length === 1 ? '' : 's'} practiced
          </h2>
          <div className="so-complete-stats">
            <span>
              <strong>{summary.correct}</strong> successful checks
            </span>
            <span>
              <strong>{summary.attempted - summary.correct}</strong> learning retries
            </span>
          </div>
          <p>This Phase 1 visit is session-only. Durable progress arrives in the persistence phase.</p>
          <button className="so-primary" type="button" onClick={() => onComplete(summary)}>
            Return to the Dojo
          </button>
        </section>
      ) : round ? (
        <section className="so-card so-practice-card">
          <p className="so-round-label">
            {correction ? 'Correction' : 'New target'} · {roundIndex + 1} of {rounds.length} ·{' '}
            {phase.startsWith('copy') ? timing.copySeconds : timing.memorySeconds}s
          </p>
          <div className="so-phase-steps" aria-label="Stroke Order activity steps">
            <span className={phase.startsWith('copy') ? 'is-current' : 'is-complete'}>
              <b>1</b>Watch & copy
            </span>
            <span className={phase === 'memory' ? 'is-current' : phase === 'memory-review' ? 'is-complete' : ''}>
              <b>2</b>Write from memory
            </span>
            <span className={phase.endsWith('review') || feedback ? 'is-current' : ''}>
              <b>3</b>Compare
            </span>
          </div>

          {feedback ? (
            <div className={`so-feedback is-${feedback}`} role="status">
              <span className="so-feedback-emblem" aria-hidden="true">
                {feedback === 'correct' ? '✓' : '↻'}
              </span>
              <strong>{feedback === 'correct' ? 'Nice work!' : 'Let’s correct it.'}</strong>
              <span>
                {feedback === 'correct'
                  ? phase === 'copy-review'
                    ? 'Now write it from memory.'
                    : 'The next target is coming up.'
                  : 'Watch the strokes again, then make another attempt.'}
              </span>
            </div>
          ) : phase === 'copy' ? (
            <>
              <div className="so-stroke-heading">
                <div>
                  <p className="so-kicker">
                    {correction ? 'Correction model' : 'Stroke-order demonstration'} · {traceDrawing.length}/
                    {round.strokes.length} strokes copied
                  </p>
                  <h2>
                    Watch <span lang="zh-Hans">{round.targetText}</span> draw itself, then copy it
                  </h2>
                </div>
                <button className="so-audio" type="button" onClick={playCurrentNarration}>
                  <Volume2 size={18} />{' '}
                  {narrationState === 'playing'
                    ? 'Playing…'
                    : narrationState === 'error'
                      ? `Tap to hear ${round.targetText}`
                      : 'Hear it'}
                </button>
              </div>
              <StrokePad
                round={round}
                strokes={traceDrawing}
                onStrokeComplete={(stroke) => recordStroke('trace', stroke)}
                showGuide
                animationKey={animationKey}
                label={`Animated stroke order · ${traceDrawing.length}/${round.strokes.length} strokes copied`}
              />
              <div className="so-actions">
                <DrawingTools drawing={traceDrawing} setDrawing={setTraceDrawing} />
                <button className="so-secondary" type="button" onClick={replayModel}>
                  <Play size={17} /> Replay
                </button>
                <button className="so-secondary" type="button" onClick={reviewCopy}>
                  Review now
                </button>
                <button
                  className="so-primary"
                  type="button"
                  disabled={traceDrawing.length < round.strokes.length}
                  onClick={reviewCopy}
                >
                  <Save size={18} /> Review my copy
                </button>
              </div>
              <p className="so-timer">
                {modelAnimating ? (
                  'Model writing · timer starts after the final stroke'
                ) : (
                  <>
                    Your writing time ·{' '}
                    <Countdown
                      countdownKey={`${round.id}:copy:${animationKey}`}
                      durationSeconds={correction ? timing.correctionSeconds : timing.copySeconds}
                      active
                      onComplete={reviewCopy}
                    />
                  </>
                )}
              </p>
            </>
          ) : phase === 'memory' ? (
            <>
              <div className="so-stroke-heading">
                <div>
                  <p className="so-kicker">Target hidden · guide hidden</p>
                  <h2>Listen, then write the target from memory</h2>
                </div>
                <span className="so-memory-timer">
                  <Brush size={18} />{' '}
                  <Countdown
                    countdownKey={`${round.id}:memory`}
                    durationSeconds={timing.memorySeconds}
                    active
                    onComplete={reviewMemory}
                  />
                </span>
              </div>
              <StrokePad
                round={round}
                strokes={memoryDrawing}
                onStrokeComplete={(stroke) => recordStroke('memory', stroke)}
                showGuide={false}
                animationKey={animationKey}
                label={`Memory writing · ${memoryDrawing.length} strokes saved`}
              />
              <div className="so-actions">
                <DrawingTools drawing={memoryDrawing} setDrawing={setMemoryDrawing} />
                <button
                  type="button"
                  className="so-secondary"
                  onClick={() => setNarrationKey((current) => current + 1)}
                >
                  <RotateCcw size={17} /> Hear it again
                </button>
                <button type="button" className="so-secondary" onClick={reviewMemory}>
                  Skip timer
                </button>
                <button className="so-primary" type="button" disabled={!memoryDrawing.length} onClick={reviewMemory}>
                  <EyeOff size={18} /> Save and compare
                </button>
              </div>
            </>
          ) : (
            <div className="so-review">
              <p className="so-kicker">Your response is saved for this visit</p>
              <h2>
                {phase === 'copy-review'
                  ? 'Review your copy before writing from memory'
                  : 'Compare your writing with the target'}
              </h2>
              <div className="so-comparison">
                <section>
                  <strong>Your writing</strong>
                  <StrokePad
                    round={round}
                    strokes={savedDrawing}
                    showGuide={false}
                    animationKey={animationKey}
                    label={`${savedDrawing.length} saved strokes`}
                  />
                </section>
                <span aria-hidden="true">→</span>
                <section className="is-target">
                  <strong>Correct target</strong>
                  <ReferencePad round={round} />
                </section>
              </div>
              <button className="so-audio" type="button" onClick={playCurrentNarration}>
                <Volume2 size={18} /> {narrationState === 'playing' ? 'Playing…' : `Hear ${round.targetText}`}
              </button>
              <p>Does your writing match the shapes and stroke order?</p>
              <div className="so-self-assessment">
                <button
                  className="so-incorrect"
                  type="button"
                  onClick={() => (phase === 'copy-review' ? assessCopy(false) : assessMemory(false))}
                >
                  <X size={17} /> Needs correction
                </button>
                <button
                  className="so-correct"
                  type="button"
                  onClick={() => (phase === 'copy-review' ? assessCopy(true) : assessMemory(true))}
                >
                  <Check size={17} /> I got it
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </ActivityShell>
  )
}
