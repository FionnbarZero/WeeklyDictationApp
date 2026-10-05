import type { PracticeTarget } from '../../domain.ts'
import { buildStrokeOrderRounds } from './rounds.ts'
import { STROKE_ORDER_ACTIVITY_IDS, type StrokeOrderPresentationConfig } from './contracts.ts'

const grade2Meanings: Record<string, string> = {
  大: 'big',
  小: 'small',
  上: 'up',
  下: 'down',
  中: 'middle',
  比如: 'for example',
  部分: 'part',
  更: 'more',
  方便: 'convenient',
  美好: 'beautiful',
}

export function grade2StrokeOrderConfig(target: PracticeTarget): StrokeOrderPresentationConfig {
  const built = buildStrokeOrderRounds(
    target.dataset.words.map((word) => ({
      id: word.id,
      text: word.text,
      meaning: grade2Meanings[word.text],
    })),
  )
  return {
    activityId: STROKE_ORDER_ACTIVITY_IDS.grade2,
    grade: 'Grade 2',
    title: 'Stroke Order',
    eyebrow: 'Grade 2 · Enter the Dojo',
    sourceId: target.dataset.id,
    sourceLabel: target.dataset.dateRange,
    rounds: built.rounds,
    unsupportedTargets: built.unsupportedTargets,
    timing: {
      copySeconds: 20,
      memorySeconds: 20,
      correctionSeconds: 20,
    },
  }
}
