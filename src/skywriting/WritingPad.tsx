import { useId, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Eraser, Keyboard, Pencil, RotateCcw } from 'lucide-react'
import {
  beginWritingStroke,
  cancelWritingStroke,
  clearWritingPad,
  emptyWritingPadState,
  endWritingStroke,
  extendWritingStroke,
  normalizedWritingPoint,
  setWritingPadText,
  typedChineseInputIssue,
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
  const keyboardInputId = useId()
  const keyboardHelpId = useId()
  const [inputMode, setInputMode] = useState<'draw' | 'type'>(() => (pad.typedText ? 'type' : 'draw'))
  const [isComposing, setIsComposing] = useState(false)
  const typedInputIssue = isComposing ? null : typedChineseInputIssue(pad.typedText)
  const writingLanes = Math.min(6, Math.max(1, Math.floor(characterCount)))
  const traceCharacters = traceText ? [...traceText].slice(0, writingLanes) : []
  const viewBoxWidth = writingLanes * VIEWBOX_CELL_SIZE
  const strokes = pad.activeStroke ? [...pad.strokes, pad.activeStroke] : pad.strokes
  const hasInk = writingPadHasInk(pad)
  const hasDrawing = pad.strokes.length > 0 || Boolean(pad.activeStroke?.length)

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

  return (
    <section
      className={`skywriting-pad-shell trace-font-${traceFont}${disabled ? ' is-disabled' : ''}`}
      aria-label="On-screen word writing pad"
    >
      <div className="skywriting-pad-toolbar">
        <div className="skywriting-input-modes" role="group" aria-label="Writing input method">
          <button
            type="button"
            aria-pressed={inputMode === 'draw'}
            onClick={() => setInputMode('draw')}
            disabled={disabled}
          >
            <Pencil size={16} /> Draw
          </button>
          <button
            type="button"
            aria-pressed={inputMode === 'type'}
            onClick={() => setInputMode('type')}
            disabled={disabled}
          >
            <Keyboard size={16} /> Type Chinese
          </button>
        </div>
        <div className="skywriting-pad-actions">
          <button
            type="button"
            onClick={() => updatePad((current) => undoWritingStroke(current))}
            disabled={disabled || inputMode === 'type' || !hasDrawing}
          >
            <RotateCcw size={16} /> Undo stroke
          </button>
          <button type="button" onClick={() => updatePad(() => clearWritingPad())} disabled={disabled || !hasInk}>
            <Eraser size={16} /> Clear
          </button>
        </div>
      </div>

      <div className={`skywriting-pad-frame input-${inputMode}`}>
        {inputMode === 'type' ? (
          disabled ? (
            <div
              className="skywriting-typed-preview"
              lang="zh-Hans"
              aria-label={`Your typed Chinese response: ${pad.typedText || 'blank'}`}
            >
              {pad.typedText || <span>No typed Chinese response</span>}
            </div>
          ) : (
            <div className="skywriting-keyboard-entry">
              <label htmlFor={keyboardInputId}>Type Chinese with a Pinyin keyboard</label>
              <input
                id={keyboardInputId}
                type="text"
                lang="zh-Hans"
                inputMode="text"
                value={pad.typedText}
                maxLength={Math.max(characterCount * 8, 32)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="拼音 → 汉字"
                onChange={(event) => updatePad((current) => setWritingPadText(current, event.target.value))}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={(event) => {
                  setIsComposing(false)
                  updatePad((current) => setWritingPadText(current, event.currentTarget.value))
                }}
                aria-describedby={keyboardHelpId}
                aria-invalid={Boolean(typedInputIssue)}
              />
              <p id={keyboardHelpId}>
                Switch to your device’s Chinese Pinyin keyboard, type the pronunciation, then choose the Chinese
                characters from its candidate list.
              </p>
              {typedInputIssue && (
                <p className="skywriting-typing-error" role="alert">
                  {typedInputIssue}
                </p>
              )}
            </div>
          )
        ) : (
          <div className="skywriting-pad-scroll">
            <svg
              className="skywriting-pad"
              style={{ minWidth: `${Math.max(1, writingLanes) * 150}px` }}
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
              {strokes.map((stroke, index) => (
                <polyline key={index} points={pointsFor(stroke, viewBoxWidth)} className="skywriting-stroke" />
              ))}
            </svg>
          </div>
        )}
        {inputMode === 'draw' && !hasInk && !traceText && (
          <p className="skywriting-pad-placeholder" aria-hidden="true">
            Write here
          </p>
        )}
      </div>
      <div className="skywriting-pad-footer">
        <p className="skywriting-pad-help" aria-live="polite">
          {disabled
            ? 'Your response is locked for review.'
            : inputMode === 'type'
              ? 'Type Pinyin, then choose the Chinese characters from your keyboard’s options.'
              : 'Draw on a touch screen, or press and drag.'}
        </p>
        <p className="skywriting-lane-note">
          {inputMode === 'type'
            ? 'Chinese character response'
            : writingLanes === 1
              ? 'One writing space'
              : `${writingLanes} spaces—one per character`}
        </p>
        <small>Your response stays in memory only.</small>
      </div>
    </section>
  )
}
