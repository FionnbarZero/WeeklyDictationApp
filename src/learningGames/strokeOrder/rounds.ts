import { strokeMedians } from './strokeAssets.ts'
import { grade5StrokeMedians } from './grade5StrokeAssets.ts'
import type { StrokeOrderRound, StrokePoint } from './contracts.ts'

type StrokeTarget = {
  readonly id: string
  readonly text: string
  readonly meaning?: string
}

type CharacterMedians = readonly (readonly (readonly number[])[])[]

const cellSize = 100
const characterScale = 0.09
const characterInset = 5
const hanziBaseline = 900
const mediansByCharacter = { ...strokeMedians, ...grade5StrokeMedians } as Record<string, CharacterMedians | undefined>

function mapMedian(points: readonly (readonly number[])[], characterIndex: number): readonly StrokePoint[] {
  return points.map(
    (point) =>
      [
        characterIndex * cellSize + characterInset + point[0] * characterScale,
        characterInset + (hanziBaseline - point[1]) * characterScale,
      ] as const,
  )
}

export function strokeAssetIsAvailable(text: string) {
  return [...text].length > 0 && [...text].every((character) => Boolean(mediansByCharacter[character]))
}

function roundForTarget(target: StrokeTarget): StrokeOrderRound {
  const characters = [...target.text]
  const medians = characters.map((character) => mediansByCharacter[character]!)
  return {
    id: `stroke-order:${target.id}`,
    targetId: target.id,
    targetText: target.text,
    meaning: target.meaning || 'writing target',
    audioText: target.text,
    strokes: medians.flatMap((characterStrokes, characterIndex) =>
      characterStrokes.map((median) => mapMedian(median, characterIndex)),
    ),
    strokeLabels: medians.flatMap((characterStrokes) => characterStrokes.map((_, index) => index + 1)),
  }
}

export function buildStrokeOrderRounds(targets: readonly StrokeTarget[]) {
  const unsupportedTargets = targets
    .filter((target) => !strokeAssetIsAvailable(target.text))
    .map((target) => target.text)

  return {
    // Fail the whole cohort closed instead of silently teaching only part of a week.
    rounds: unsupportedTargets.length > 0 ? [] : targets.map(roundForTarget),
    unsupportedTargets,
  }
}
