import type { WeeklyDatasetCandidate } from '../../curriculum/model.ts'
import { buildStrokeOrderRounds } from './rounds.ts'
import { STROKE_ORDER_ACTIVITY_IDS, type StrokeOrderPresentationConfig } from './contracts.ts'

const kindergartenMeanings: Record<string, string> = {
  一: 'one',
  二: 'two',
  三: 'three',
  人: 'person',
  四: 'four',
  五: 'five',
  六: 'six',
  心: 'heart',
  七: 'seven',
  八: 'eight',
  水: 'water',
  九: 'nine',
  十: 'ten',
  白: 'white',
  牛: 'cow',
  羊: 'sheep',
}

export function kindergartenStrokeOrderConfig(candidate: WeeklyDatasetCandidate): StrokeOrderPresentationConfig {
  const targets = candidate.tier1.map((target) => ({
    id: target.targetOccurrenceId || `${candidate.source.sourceUnitId}:${target.sourcePosition}`,
    text: target.text,
    meaning: kindergartenMeanings[target.text],
  }))
  const built = buildStrokeOrderRounds(targets)
  return {
    activityId: STROKE_ORDER_ACTIVITY_IDS.kindergarten,
    grade: 'Kindergarten',
    title: 'Stroke Order',
    eyebrow: 'Kindergarten · Enter the Dojo',
    sourceId: candidate.datasetId || candidate.source.sourceUnitId,
    sourceLabel: candidate.rawDate || candidate.dateRangeLabel || 'Current week',
    rounds: built.rounds,
    unsupportedTargets: built.unsupportedTargets,
    timing: {
      copySeconds: 10,
      memorySeconds: 10,
      correctionSeconds: 10,
    },
  }
}
