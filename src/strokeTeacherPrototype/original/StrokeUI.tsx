// Original EduGames drawing UI, with optional backward-chain guide visibility.
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react'
import { Eraser, Undo2, Volume2 } from 'lucide-react'
import type { StrokeOrderGameRound, StrokePoint } from './contracts'
import { displayPointToStroke, getStrokeLayout, type StrokeLayout } from './strokeLayout'
type NarrationState = 'idle' | 'playing' | 'ready' | 'error'
type InkStroke = StrokePoint[]
type InkDrawing = InkStroke[]
function strokePath(points: readonly StrokePoint[]) {
  return points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ')
}

function serializeStroke(stroke: readonly StrokePoint[]) {
  return stroke.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(' ')
}

function PracticeGrid() {
  return (
    <g className="lg-stroke-grid-lines" aria-hidden="true">
      <rect x="3" y="3" width="94" height="94" rx="2" />
      <path d="M50 3v94M3 50h94M3 3l94 94M97 3 3 97" />
    </g>
  )
}

function pointFromClient(clientX: number, clientY: number, bounds: DOMRect, layout: StrokeLayout): StrokePoint {
  return displayPointToStroke(
    [((clientX - bounds.left) / bounds.width) * 100, ((clientY - bounds.top) / bounds.height) * 100],
    layout,
  )
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

export function StrokePad({
  round,
  strokes,
  onStrokesChange,
  showGuide,
  animationKey,
  label,
  validateStroke,
  onStrokeAccepted,
  onStrokeRejected,
  animationStepSeconds,
  resetKey = 0,
  rejectedStroke = null,
  suppliedStrokeCount = 0,
  guideMode = 'full',
  hintStrokeIndex,
}: {
  readonly round: StrokeOrderGameRound
  readonly strokes: InkDrawing
  readonly onStrokesChange?: Dispatch<SetStateAction<InkDrawing>>
  readonly showGuide: boolean
  readonly animationKey: number
  readonly label: string
  readonly validateStroke?: (stroke: InkStroke, strokeIndex: number) => boolean
  readonly onStrokeAccepted?: () => void
  readonly onStrokeRejected?: (stroke: InkStroke) => void
  readonly animationStepSeconds: number
  readonly resetKey?: number
  readonly rejectedStroke?: InkStroke | null
  readonly suppliedStrokeCount?: number
  readonly guideMode?: 'full' | 'faded' | 'hidden'
  readonly hintStrokeIndex?: number
}) {
  const padElement = useRef<SVGSVGElement | null>(null)
  const activePointer = useRef<number | null>(null)
  const activePoints = useRef<InkStroke>([])
  const activePath = useRef<SVGPathElement | null>(null)
  const padBounds = useRef<DOMRect | null>(null)
  const paintFrame = useRef<number | null>(null)
  const interactive = Boolean(onStrokesChange)
  const layout = useMemo(() => getStrokeLayout(round.strokes), [round.strokes])

  const cancelActiveStroke = useCallback(() => {
    const pointerId = activePointer.current
    activePointer.current = null
    activePoints.current = []
    padBounds.current = null
    if (paintFrame.current !== null) {
      window.cancelAnimationFrame(paintFrame.current)
      paintFrame.current = null
    }
    activePath.current?.removeAttribute('d')
    if (pointerId !== null && padElement.current?.hasPointerCapture(pointerId)) {
      padElement.current.releasePointerCapture(pointerId)
    }
  }, [])

  // Clear live ink before the browser can paint or finish an old pointer gesture.
  useLayoutEffect(() => {
    cancelActiveStroke()
    return cancelActiveStroke
  }, [cancelActiveStroke, resetKey, round.id])

  function paintActiveStroke() {
    paintFrame.current = null
    if (activePointer.current !== null) activePath.current?.setAttribute('d', strokePath(activePoints.current))
  }

  function scheduleActivePaint() {
    if (paintFrame.current === null) paintFrame.current = window.requestAnimationFrame(paintActiveStroke)
  }

  function beginStroke(event: ReactPointerEvent<SVGSVGElement>) {
    if (!onStrokesChange || activePointer.current !== null || (event.pointerType === 'mouse' && event.button !== 0))
      return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointer.current = event.pointerId
    padBounds.current = event.currentTarget.getBoundingClientRect()
    activePoints.current = [pointFromClient(event.clientX, event.clientY, padBounds.current, layout)]
    scheduleActivePaint()
  }

  function continueStroke(event: ReactPointerEvent<SVGSVGElement>) {
    if (!onStrokesChange || activePointer.current !== event.pointerId || !padBounds.current) return
    event.preventDefault()
    const coalesced =
      typeof event.nativeEvent.getCoalescedEvents === 'function' ? event.nativeEvent.getCoalescedEvents() : []
    const samples = coalesced.length > 0 ? coalesced : [event.nativeEvent]
    samples.forEach((sample) =>
      appendDistinctPoint(
        activePoints.current,
        pointFromClient(sample.clientX, sample.clientY, padBounds.current!, layout),
      ),
    )
    scheduleActivePaint()
  }

  function endStroke(event: ReactPointerEvent<SVGSVGElement>) {
    if (activePointer.current !== event.pointerId) return
    if (padBounds.current) {
      appendDistinctPoint(
        activePoints.current,
        pointFromClient(event.clientX, event.clientY, padBounds.current, layout),
      )
    }
    const completedStroke = simplifyStroke(activePoints.current)
    cancelActiveStroke()
    if (completedStroke.length >= 2) {
      if (!validateStroke || validateStroke(completedStroke, strokes.length)) {
        onStrokesChange?.((current) => [...current, completedStroke])
        onStrokeAccepted?.()
      } else {
        onStrokeRejected?.(completedStroke)
      }
    }
  }

  function cancelStroke(event: ReactPointerEvent<SVGSVGElement>) {
    if (activePointer.current === event.pointerId) cancelActiveStroke()
  }

  function losePointerCapture(event: ReactPointerEvent<SVGSVGElement>) {
    if (activePointer.current !== event.pointerId) return
    // Some embedded browsers release capture before delivering pointerup.
    // A released button finishes the stroke; capture loss while held cancels it.
    if (event.buttons === 0) endStroke(event)
    else cancelActiveStroke()
  }

  return (
    <div className={`lg-stroke-pad${interactive ? ' is-interactive' : ' is-saved'}${showGuide ? ' has-guide' : ''}`}>
      <svg
        ref={padElement}
        viewBox="0 0 100 100"
        data-next-stroke={strokes.length}
        data-supplied-strokes={suppliedStrokeCount}
        role={interactive ? 'application' : 'img'}
        aria-label={label}
        tabIndex={interactive ? 0 : undefined}
        onPointerDown={beginStroke}
        onPointerMove={continueStroke}
        onPointerUp={endStroke}
        onPointerCancel={cancelStroke}
        onLostPointerCapture={losePointerCapture}
      >
        <PracticeGrid />
        <g transform={`translate(${layout.offsetX} ${layout.offsetY}) scale(${layout.scale})`}>
          {showGuide && (
            <g className="lg-stroke-guide" key={`${round.id}-${animationKey}`} aria-hidden="true">
              {round.strokes.map(
                (stroke, index) =>
                  (guideMode === 'full' || index === hintStrokeIndex) && (
                    <path
                      key={`${round.id}-guide-${index}`}
                      d={strokePath(stroke)}
                      pathLength={1}
                      style={{ animationDelay: `${index === hintStrokeIndex ? 0 : index * animationStepSeconds}s` }}
                    />
                  ),
              )}
              {round.strokes.map(
                (stroke, index) =>
                  ((guideMode === 'full' && index >= strokes.length) ||
                    (index === strokes.length && (guideMode === 'faded' || index === hintStrokeIndex))) && (
                    <g
                      className="lg-stroke-marker"
                      key={`${round.id}-marker-${index}`}
                      style={{ animationDelay: `${index * animationStepSeconds}s` }}
                    >
                      <circle cx={stroke[0][0]} cy={stroke[0][1]} r="4.3" />
                      <text x={stroke[0][0]} y={stroke[0][1] + 1.7}>
                        {index + 1}
                      </text>
                    </g>
                  ),
              )}
            </g>
          )}
          {rejectedStroke && (
            <g className="lg-stroke-retry-ink" aria-label="Incorrect stroke">
              <path d={strokePath(rejectedStroke)} />
            </g>
          )}
          <g className={`lg-student-ink${validateStroke ? ' is-validated' : ''}`}>
            {strokes.map((stroke, index) => (
              <path
                key={`ink-${index}`}
                className={index < suppliedStrokeCount ? 'teacher-supplied-stroke' : undefined}
                d={strokePath(stroke)}
              />
            ))}
            {interactive && <path className="lg-active-ink" ref={activePath} />}
          </g>
        </g>
      </svg>
    </div>
  )
}

export function ReferencePad({ round }: { readonly round: StrokeOrderGameRound }) {
  const layout = getStrokeLayout(round.strokes)
  return (
    <div className="lg-stroke-pad is-reference">
      <svg viewBox="0 0 100 100" role="img" aria-label={`Correct character: ${round.targetText}`}>
        <PracticeGrid />
        <text className="lg-reference-character" x="50" y="76" textAnchor="middle">
          {round.targetText}
        </text>
        <g transform={`translate(${layout.offsetX} ${layout.offsetY}) scale(${layout.scale})`}>
          {round.strokes.map((stroke, index) => (
            <g className="lg-reference-marker" key={`${round.id}-reference-${index}`}>
              <circle cx={stroke[0][0]} cy={stroke[0][1]} r="4.3" />
              <text x={stroke[0][0]} y={stroke[0][1] + 1.7}>
                {index + 1}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}

export function DrawingTools({
  drawing,
  setDrawing,
  onReset,
  hasRejectedStroke = false,
}: {
  readonly drawing: InkDrawing
  readonly setDrawing: Dispatch<SetStateAction<InkDrawing>>
  readonly onReset: () => void
  readonly hasRejectedStroke?: boolean
}) {
  return (
    <div className="lg-stroke-tools">
      <button
        type="button"
        aria-label="Undo stroke"
        disabled={!drawing.length && !hasRejectedStroke}
        onClick={() => {
          onReset()
          if (!hasRejectedStroke) setDrawing((current) => current.slice(0, -1))
        }}
      >
        <Undo2 size={18} /> Undo
      </button>
      <button
        type="button"
        aria-label="Clear pad"
        onClick={() => {
          onReset()
          setDrawing([])
        }}
      >
        <Eraser size={18} /> Clear
      </button>
    </div>
  )
}

export function VocabularyContext({
  round,
  audioState,
  onPlay,
  clueVisible = true,
}: {
  readonly round: StrokeOrderGameRound
  readonly audioState: NarrationState
  readonly onPlay: () => void
  readonly clueVisible?: boolean
}) {
  const characters = Array.from(round.word || round.targetText)
  return (
    <div
      className="lg-vocabulary-context"
      aria-label={
        clueVisible
          ? `Vocabulary word ${round.word || round.targetText}, ${round.pinyin || ''}, meaning ${round.meaning}`
          : 'Word audio'
      }
    >
      <div
        className="lg-vocabulary-main"
        aria-hidden={!clueVisible}
        style={{ visibility: clueVisible ? 'visible' : 'hidden' }}
      >
        <h2 className="lg-vocabulary-word" lang="zh-Hans">
          {characters.map((character, index) => (
            <b className={index === (round.wordCharacterIndex || 0) ? 'is-current' : ''} key={`${character}-${index}`}>
              {character}
            </b>
          ))}
        </h2>
        <div className="lg-vocabulary-details">
          <span>{round.pinyin}</span>
          <strong>{round.meaning}</strong>
        </div>
      </div>
      <button className="lg-audio" type="button" onClick={onPlay} aria-label={`Hear ${round.word || round.targetText}`}>
        <Volume2 size={21} />
        <span>{audioState === 'playing' ? 'Playing…' : audioState === 'error' ? 'Retry audio' : 'Listen'}</span>
      </button>
    </div>
  )
}
