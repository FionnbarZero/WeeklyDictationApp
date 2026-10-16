import { Eraser, Pencil, RotateCcw } from 'lucide-react'
import { type ReactNode, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import {
  beginWritingStroke,
  cancelWritingStroke,
  clearWritingPad,
  emptyWritingPadState,
  endWritingStroke,
  extendWritingStroke,
  normalizedWritingPoint,
  setWritingPadTypedText,
  undoWritingStroke,
  type WritingPadState,
  type WritingPoint,
  type WritingStroke,
  writingPadHasInk,
} from './model.ts'
import { personPinyinCandidates } from './pinyinPrototype.ts'
import './skywriting.css'

const VIEWBOX_CELL_SIZE = 1000

export type WritingPadTraceFont = 'songti' | 'kaiti'
export type WritingPadPresentation = 'standard' | 'grand-scroll'
export type WritingPadStateUpdater = (current: WritingPadState) => WritingPadState

function pointsFor(stroke: WritingStroke, viewBoxWidth: number) {
  return stroke.map((point) => `${point.x * viewBoxWidth},${point.y * VIEWBOX_CELL_SIZE}`).join(' ')
}

function smoothPathFor(stroke: WritingStroke, lane: number, laneCount: number) {
  const points = stroke.map((point) => ({
    x: (point.x * laneCount - lane) * VIEWBOX_CELL_SIZE,
    y: point.y * VIEWBOX_CELL_SIZE,
  }))
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0].x} ${points[0].y}l.01 0`
  let path = `M${points[0].x} ${points[0].y}`
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]
    const next = points[index + 1]
    path += `Q${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`
  }
  const last = points[points.length - 1]
  return `${path}L${last.x} ${last.y}`
}

function eventPoint(event: ReactPointerEvent<SVGSVGElement>, lane = 0, laneCount = 1): WritingPoint {
  const point = normalizedWritingPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
  return { x: (lane + point.x) / laneCount, y: point.y }
}

function coalescedEventPoints(event: ReactPointerEvent<SVGSVGElement>, lane: number, laneCount: number) {
  const bounds = event.currentTarget.getBoundingClientRect()
  const nativeSamples = event.nativeEvent.getCoalescedEvents?.() || []
  const samples = [...nativeSamples, event.nativeEvent]
  return samples.map((sample) => {
    const point = normalizedWritingPoint(sample.clientX, sample.clientY, bounds)
    return { x: (lane + point.x) / laneCount, y: point.y }
  })
}

export function WritingPad({
  disabled = false,
  characterCount = 1,
  traceText,
  traceFont = 'songti',
  presentation = 'standard',
  pinyinPrototype = false,
  guide,
  padState,
  onPadStateChange,
}: {
  disabled?: boolean
  characterCount?: number
  traceText?: string
  traceFont?: WritingPadTraceFont
  presentation?: WritingPadPresentation
  pinyinPrototype?: boolean
  guide?: ReactNode
  padState?: WritingPadState
  onPadStateChange?: (update: WritingPadStateUpdater) => void
}) {
  const [localPad, setLocalPad] = useState(emptyWritingPadState)
  const [composing, setComposing] = useState(false)
  const typedInputRef = useRef<HTMLInputElement>(null)
  const grandScrollGridRef = useRef<HTMLDivElement>(null)
  const pad = padState ?? localPad
  const writingLanes = Math.min(6, Math.max(1, Math.floor(characterCount)))
  const grandScroll = presentation === 'grand-scroll'
  const traceCharacters = traceText ? [...traceText].slice(0, writingLanes) : []
  const viewBoxWidth = writingLanes * VIEWBOX_CELL_SIZE
  const strokes = pad.activeStroke ? [...pad.strokes, pad.activeStroke] : pad.strokes
  const hasInk = writingPadHasInk(pad)
  const hasStrokes = pad.strokes.length > 0 || Boolean(pad.activeStroke?.length)
  const pinyinCandidates = pinyinPrototype && grandScroll && !disabled
    ? personPinyinCandidates(pad.typedText || '', composing)
    : []

  useEffect(() => {
    if (!grandScroll) return
    const pads = [...(grandScrollGridRef.current?.querySelectorAll<SVGSVGElement>('.skywriting-pad') || [])]
    const keepPaperStill = (event: WheelEvent) => event.preventDefault()
    for (const writingPad of pads) writingPad.addEventListener('wheel', keepPaperStill, { passive: false })
    return () => {
      for (const writingPad of pads) writingPad.removeEventListener('wheel', keepPaperStill)
    }
  }, [grandScroll, writingLanes])

  function updatePad(update: WritingPadStateUpdater) {
    if (padState !== undefined && onPadStateChange) {
      onPadStateChange(update)
      return
    }
    setLocalPad(update)
  }

  function pointerDown(event: ReactPointerEvent<SVGSVGElement>, lane = 0, laneCount = 1) {
    if (disabled || event.button !== 0) return
    event.preventDefault()
    const point = eventPoint(event, lane, laneCount)
    event.currentTarget.setPointerCapture(event.pointerId)
    updatePad((current) => beginWritingStroke(current, point, 'press-and-drag'))
  }

  function pointerMove(event: ReactPointerEvent<SVGSVGElement>, lane = 0, laneCount = 1) {
    if (disabled) return
    if (event.buttons === 0 && event.pointerType !== 'touch') return
    const points = coalescedEventPoints(event, lane, laneCount)
    updatePad((current) => points.reduce(extendWritingStroke, current))
  }

  function pointerUp(event: ReactPointerEvent<SVGSVGElement>, lane = 0, laneCount = 1) {
    if (disabled) return
    const points = coalescedEventPoints(event, lane, laneCount)
    updatePad((current) => endWritingStroke(points.reduce(extendWritingStroke, current), 'press-and-drag'))
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function stopInterruptedStroke() {
    updatePad((current) => cancelWritingStroke(current))
  }

  return (
    <section
      className={`skywriting-pad-shell trace-font-${traceFont}${grandScroll ? ' is-grand-scroll' : ''}${disabled ? ' is-disabled' : ''}`}
      aria-label="On-screen word writing pad"
    >
      <div className="skywriting-pad-toolbar">
        <p className="skywriting-input-hint">
          <Pencil size={16} /> Finger or press &amp; drag
        </p>
        <div className="skywriting-pad-actions">
          {!grandScroll && <button
            type="button"
            onClick={() => updatePad((current) => undoWritingStroke(current))}
            disabled={disabled || !hasStrokes}
          >
            <RotateCcw size={16} /> Undo stroke
          </button>}
          <button type="button" onClick={() => updatePad(() => clearWritingPad())} disabled={disabled || !hasInk}>
            <Eraser size={16} /> Clear
          </button>
        </div>
      </div>

      {grandScroll ? <div
        ref={grandScrollGridRef}
        className="skywriting-grand-scroll-grid"
        data-character-count={writingLanes}
        aria-label={`${writingLanes} character writing ${writingLanes === 1 ? 'space' : 'spaces'}`}
      >
        {Array.from({ length: writingLanes }, (_, lane) => (
          <div className="skywriting-scroll-cell" key={lane}>
            <div className="skywriting-scroll-paper">
              <svg
                className="skywriting-pad"
                viewBox={`0 0 ${VIEWBOX_CELL_SIZE} ${VIEWBOX_CELL_SIZE}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`Write character ${lane + 1} of ${writingLanes}`}
                onPointerDown={(event) => pointerDown(event, lane, writingLanes)}
                onPointerMove={(event) => pointerMove(event, lane, writingLanes)}
                onPointerUp={(event) => pointerUp(event, lane, writingLanes)}
                onPointerCancel={stopInterruptedStroke}
                onLostPointerCapture={stopInterruptedStroke}
              >
                <rect width={VIEWBOX_CELL_SIZE} height={VIEWBOX_CELL_SIZE} className="skywriting-paper" />
                {traceCharacters[lane] && (
                  <text
                    x="500"
                    y="520"
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="skywriting-trace-character"
                  >
                    {traceCharacters[lane]}
                  </text>
                )}
                <path
                  d="M500 34V966M34 500H966M90 90L910 910M910 90L90 910"
                  className="skywriting-guide"
                />
                {strokes.map((stroke, index) => (
                  <path key={index} d={smoothPathFor(stroke, lane, writingLanes)} className="skywriting-stroke" />
                ))}
              </svg>
              {!hasInk && !traceText && !guide && lane === 0 && (
                <p className="skywriting-pad-placeholder" aria-hidden="true">
                  Your brush starts here
                </p>
              )}
              <span className="skywriting-paper-seal" aria-hidden="true">忍</span>
            </div>
            {writingLanes > 1 && <span className="skywriting-character-position" aria-hidden="true">{lane + 1}</span>}
          </div>
        ))}
      </div> : <div className="skywriting-pad-frame">
        <svg
          className="skywriting-pad"
          viewBox={`0 0 ${viewBoxWidth} ${VIEWBOX_CELL_SIZE}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={hasInk ? 'Your word drawing' : 'Blank word drawing pad'}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={stopInterruptedStroke}
          onLostPointerCapture={stopInterruptedStroke}
        >
          <rect width={viewBoxWidth} height={VIEWBOX_CELL_SIZE} rx="72" className="skywriting-paper" />
          {Array.from({ length: writingLanes }, (_, lane) => {
            const left = lane * VIEWBOX_CELL_SIZE
            const center = left + VIEWBOX_CELL_SIZE / 2
            const right = left + VIEWBOX_CELL_SIZE
            return (
              <g key={lane}>
                {traceCharacters[lane] && (
                  <text
                    x={center}
                    y="520"
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="skywriting-trace-character"
                  >
                    {traceCharacters[lane]}
                  </text>
                )}
                {lane > 0 && <path d={`M${left} 18V982`} className="skywriting-lane-divider" />}
                <path
                  d={`M${center} 34V966M${left + 34} 500H${right - 34}M${left + 90} 90L${right - 90} 910M${right - 90} 90L${left + 90} 910`}
                  className="skywriting-guide"
                />
              </g>
            )
          })}
          {guide}
          {strokes.map((stroke, index) => (
            <polyline key={index} points={pointsFor(stroke, viewBoxWidth)} className="skywriting-stroke" />
          ))}
        </svg>
        {!hasInk && !traceText && !guide && (
          <p className="skywriting-pad-placeholder" aria-hidden="true">
            Write here
          </p>
        )}
      </div>}
      <label className="skywriting-keyboard-alternative">
        <span>{presentation === 'grand-scroll' ? 'Type' : disabled ? 'Typed Response' : 'Keyboard or switch-input alternative'}</span>
        <input
          ref={typedInputRef}
          type="text"
          lang="zh-Hans"
          inputMode="text"
          autoComplete="off"
          value={pad.typedText || ''}
          disabled={disabled}
          aria-label="Type your word instead of drawing it"
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={(event) => {
            const value = event.currentTarget.value
            setComposing(false)
            updatePad((current) => setWritingPadTypedText(current, value))
          }}
          onChange={(event) => updatePad((current) => setWritingPadTypedText(current, event.target.value))}
        />
      </label>
      {pinyinCandidates.length > 0 && <div className="skywriting-pinyin-candidates" role="group" aria-label="Choose a Chinese character">
        <span>Choose one</span>
        <div>{pinyinCandidates.map((candidate) => <button key={candidate} type="button" onClick={() => {
          updatePad((current) => setWritingPadTypedText(current, candidate))
          typedInputRef.current?.focus()
        }} aria-label={`Choose character ${candidate}`}>{candidate}</button>)}</div>
      </div>}
      <div className="skywriting-pad-footer">
        <p className="skywriting-pad-help" aria-live="polite">
          {disabled ? 'Drawing paused for review.' : 'Draw on a touch screen, or press and drag.'}
        </p>
        <p className="skywriting-lane-note">
          {writingLanes === 1 ? 'One writing space' : `${writingLanes} spaces—one per character`}
        </p>
        <small>Drawing stays in memory only.</small>
      </div>
    </section>
  )
}
