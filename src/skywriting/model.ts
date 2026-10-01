export type WritingPadMode = 'press-and-drag' | 'tap-to-draw'

export type WritingPoint = {
  x: number
  y: number
}

export type WritingStroke = WritingPoint[]

export type WritingPadState = {
  strokes: WritingStroke[]
  activeStroke: WritingStroke | null
  tapDrawing: boolean
}

export const emptyWritingPadState: WritingPadState = {
  strokes: [],
  activeStroke: null,
  tapDrawing: false,
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function normalizedWritingPoint(
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number; width: number; height: number },
): WritingPoint {
  return {
    x: clamp(bounds.width > 0 ? (clientX - bounds.left) / bounds.width : 0),
    y: clamp(bounds.height > 0 ? (clientY - bounds.top) / bounds.height : 0),
  }
}

function finishActiveStroke(state: WritingPadState): WritingPadState {
  if (!state.activeStroke?.length) return { ...state, activeStroke: null, tapDrawing: false }
  return {
    strokes: [...state.strokes, state.activeStroke],
    activeStroke: null,
    tapDrawing: false,
  }
}

export function beginWritingStroke(
  state: WritingPadState,
  point: WritingPoint,
  mode: WritingPadMode,
): WritingPadState {
  if (mode === 'tap-to-draw' && state.tapDrawing) return finishActiveStroke(state)
  return {
    ...state,
    activeStroke: [point],
    tapDrawing: mode === 'tap-to-draw',
  }
}

export function extendWritingStroke(state: WritingPadState, point: WritingPoint): WritingPadState {
  const activeStroke = state.activeStroke
  if (!activeStroke) return state.tapDrawing ? { ...state, activeStroke: [point] } : state
  const previous = activeStroke[activeStroke.length - 1]
  if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.0025) return state
  return { ...state, activeStroke: [...activeStroke, point] }
}

export function endWritingStroke(state: WritingPadState, mode: WritingPadMode): WritingPadState {
  return mode === 'tap-to-draw' ? state : finishActiveStroke(state)
}

export function cancelWritingStroke(state: WritingPadState): WritingPadState {
  return finishActiveStroke(state)
}

export function pauseTapWritingStroke(state: WritingPadState): WritingPadState {
  if (!state.tapDrawing || !state.activeStroke?.length) return state
  return {
    strokes: [...state.strokes, state.activeStroke],
    activeStroke: null,
    tapDrawing: true,
  }
}

export function undoWritingStroke(state: WritingPadState): WritingPadState {
  if (state.activeStroke) return { ...state, activeStroke: null, tapDrawing: false }
  return { ...state, strokes: state.strokes.slice(0, -1) }
}

export function clearWritingPad(): WritingPadState {
  return { strokes: [], activeStroke: null, tapDrawing: false }
}

export function writingPadHasInk(state: WritingPadState) {
  return state.strokes.length > 0 || Boolean(state.activeStroke?.length)
}
