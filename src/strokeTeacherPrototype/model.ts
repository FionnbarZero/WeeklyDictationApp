import type { StrokePoint } from '../learningGames/strokeOrder/contracts.ts'

export const TEACHER_STEPS = [
  'Watch and trace',
  'Trace again',
  'Trace one more time',
  'Finish the last third',
  'Finish the last two-thirds',
  'Write and compare',
] as const

// Stable stage identities preserve the approved six-step reference while the new
// isolated preview omits only the second repeat-tracing stage.
export const SIX_STEP_SEQUENCE = [0, 1, 2, 3, 4, 5] as const
export const FIVE_STEP_SEQUENCE = [0, 1, 3, 4, 5] as const
export type TeacherSequence = typeof SIX_STEP_SEQUENCE | typeof FIVE_STEP_SEQUENCE

export function suppliedStrokes(step: number, count: number) {
  if (step === 3) return count - Math.ceil(count / 3)
  if (step === 4) return Math.floor(count / 3)
  return 0
}

// Adapted from EduGames/src/gameModules/stroke-order-slay/runtime/strokeAssessment.ts.
// These are the original Grade 2 endpoint, length and path tolerances.
function distance(a: StrokePoint, b: StrokePoint) {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}
function length(points: readonly StrokePoint[]) {
  return points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0)
}
function segmentDistance(point: StrokePoint, a: StrokePoint, b: StrokePoint) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const squared = dx * dx + dy * dy
  if (!squared) return distance(point, a)
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / squared))
  return distance(point, [a[0] + t * dx, a[1] + t * dy])
}
export function strokeMatchesGuide(drawn: readonly StrokePoint[], guide: readonly StrokePoint[]) {
  if (drawn.length < 2 || guide.length < 2) return false
  if (distance(drawn[0], guide[0]) > 18 || distance(drawn[drawn.length - 1], guide[guide.length - 1]) > 18) return false
  const guideLength = length(guide)
  const drawnLength = length(drawn)
  if (!guideLength || drawnLength < guideLength * 0.55 || drawnLength > guideLength * 1.8) return false
  let deviation = 0
  let samples = 0
  const sampleStep = Math.max(1, Math.floor(drawn.length / 18))
  for (let index = 0; index < drawn.length; index += sampleStep) {
    deviation += Math.min(...guide.slice(1).map((point, i) => segmentDistance(drawn[index], guide[i], point)))
    samples += 1
  }
  return deviation / samples <= 11
}

export function strokeFeedback(
  drawn: readonly StrokePoint[],
  guides: readonly (readonly StrokePoint[])[],
  next: number,
) {
  if (strokeMatchesGuide(drawn, guides[next])) return null
  if (strokeMatchesGuide([...drawn].reverse(), guides[next]))
    return `Go the other way. Follow stroke ${next + 1} from its number.`
  const other = guides.findIndex((guide, index) => index !== next && strokeMatchesGuide(drawn, guide))
  if (other !== -1) return `That is stroke ${other + 1}. First, follow stroke ${next + 1}.`
  return `Try stroke ${next + 1} again. Start at the number and follow the bright path.`
}

export function strokePath(points: readonly StrokePoint[]) {
  return points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ')
}
