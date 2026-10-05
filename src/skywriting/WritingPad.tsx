import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Eraser, Pencil, RotateCcw } from 'lucide-react'
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
  writingPadHasInk,
  type WritingPadState,
  type WritingPoint,
  type WritingStroke,
} from './model.ts'
import './skywriting.css'

const VIEWBOX_CELL_SIZE = 1000

export type WritingPadTraceFont = 'songti' | 'kaiti'
export type WritingPadStateUpdater = (current: WritingPadState) => WritingPadState

function pointsFor(stroke: WritingStroke, viewBoxWidth: number) {
  return stroke.map((point) => `${point.x * viewBoxWidth},${point.y * VIEWBOX_CELL_SIZE}`).join(' ')
}

function eventPoint(event: ReactPointerEvent<SVGSVGElement>): WritingPoint {
  return normalizedWritingPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
}

export function WritingPad({
  disabled = false,
  characterCount = 1,
  traceText,
  traceFont = 'songti',
  padState,
  onPadStateChange,
}: {
  disabled?: boolean
  characterCount?: number
  traceText?: string
  traceFont?: WritingPadTraceFont
  padState?: WritingPadState
  onPadStateChange?: (update: WritingPadStateUpdater) => void
}) {
  const [localPad, setLocalPad] = useState(emptyWritingPadState)
  const pad = padState ?? localPad
  const writingLanes = Math.min(6, Math.max(1, Math.floor(characterCount)))
  const traceCharacters = traceText ? [...traceText].slice(0, writingLanes) : []
  const viewBoxWidth = writingLanes * VIEWBOX_CELL_SIZE
  const strokes = pad.activeStroke ? [...pad.strokes, pad.activeStroke] : pad.strokes
  const hasInk = writingPadHasInk(pad)
  const hasStrokes = pad.strokes.length > 0 || Boolean(pad.activeStroke?.length)

  function updatePad(update: WritingPadStateUpdater) {
    if (padState !== undefined && onPadStateChange) {
      onPadStateChange(update)
      return
    }
    setLocalPad(update)
  }

  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (disabled || event.button !== 0) return
    event.preventDefault()
    const point = eventPoint(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    updatePad((current) => beginWritingStroke(current, point, 'press-and-drag'))
  }

  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (disabled) return
    if (event.buttons === 0 && event.pointerType !== 'touch') return
    const point = eventPoint(event)
    updatePad((current) => extendWritingStroke(current, point))
  }

  function pointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (disabled) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    updatePad((current) => endWritingStroke(current, 'press-and-drag'))
  }

  function stopInterruptedStroke() {
    updatePad((current) => cancelWritingStroke(current))
  }

  return <section className={`skywriting-pad-shell trace-font-${traceFont}${disabled ? ' is-disabled' : ''}`} aria-label="On-screen word writing pad">
    <div className="skywriting-pad-toolbar">
      <p className="skywriting-input-hint"><Pencil size={16} /> Finger or press &amp; drag</p>
      <div className="skywriting-pad-actions">
        <button type="button" onClick={() => updatePad((current) => undoWritingStroke(current))} disabled={disabled || !hasStrokes}>
          <RotateCcw size={16} /> Undo stroke
        </button>
        <button type="button" onClick={() => updatePad(() => clearWritingPad())} disabled={disabled || !hasInk}>
          <Eraser size={16} /> Clear
        </button>
      </div>
    </div>

    <div className="skywriting-pad-frame">
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
          return <g key={lane}>
            {traceCharacters[lane] && <text x={center} y="520" textAnchor="middle" dominantBaseline="central" className="skywriting-trace-character">{traceCharacters[lane]}</text>}
            {lane > 0 && <path d={`M${left} 18V982`} className="skywriting-lane-divider" />}
            <path d={`M${center} 34V966M${left + 34} 500H${right - 34}M${left + 90} 90L${right - 90} 910M${right - 90} 90L${left + 90} 910`} className="skywriting-guide" />
          </g>
        })}
        {strokes.map((stroke, index) => <polyline key={index} points={pointsFor(stroke, viewBoxWidth)} className="skywriting-stroke" />)}
      </svg>
      {!hasInk && !traceText && <p className="skywriting-pad-placeholder" aria-hidden="true">Write here</p>}
    </div>
    <label className="skywriting-keyboard-alternative">
      <span>{disabled ? 'Typed response' : 'Keyboard or switch-input alternative'}</span>
      <input
        type="text"
        lang="zh-Hans"
        inputMode="text"
        autoComplete="off"
        value={pad.typedText || ''}
        disabled={disabled}
        aria-label="Type your word instead of drawing it"
        onChange={(event) => updatePad((current) => setWritingPadTypedText(current, event.target.value))}
      />
    </label>
    <div className="skywriting-pad-footer">
      <p className="skywriting-pad-help" aria-live="polite">
        {disabled
          ? 'Drawing paused for review.'
          : 'Draw on a touch screen, or press and drag.'}
      </p>
      <p className="skywriting-lane-note">{writingLanes === 1 ? 'One writing space' : `${writingLanes} spaces—one per character`}</p>
      <small>Drawing stays in memory only.</small>
    </div>
  </section>
}
