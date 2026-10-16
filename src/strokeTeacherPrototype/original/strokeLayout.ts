import type { StrokePoint } from './contracts'

export type StrokeLayout = {
  readonly scale: number
  readonly offsetX: number
  readonly offsetY: number
}

// Center the complete character, leaving room for stroke caps and number markers.
// This affects display only; drawing and assessment keep the source coordinates.
export function getStrokeLayout(strokes: readonly (readonly StrokePoint[])[]): StrokeLayout {
  const points = strokes.flat()
  if (!points.length) return { scale: 1, offsetX: 0, offsetY: 0 }
  const minX = Math.min(...points.map(([x]) => x))
  const maxX = Math.max(...points.map(([x]) => x))
  const minY = Math.min(...points.map(([, y]) => y))
  const maxY = Math.max(...points.map(([, y]) => y))
  const scale = Math.min(1, 78 / Math.max(maxX - minX, maxY - minY, 1))
  return {
    scale,
    offsetX: 50 - ((minX + maxX) / 2) * scale,
    offsetY: 50 - ((minY + maxY) / 2) * scale,
  }
}

export function displayPointToStroke([x, y]: StrokePoint, layout: StrokeLayout): StrokePoint {
  return [
    Math.max(0, Math.min(100, (x - layout.offsetX) / layout.scale)),
    Math.max(0, Math.min(100, (y - layout.offsetY) / layout.scale)),
  ]
}
