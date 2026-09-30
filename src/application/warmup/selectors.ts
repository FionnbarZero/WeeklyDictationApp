import type { AppState, Dataset } from '../../domain.ts'
import type { WarmupVisit } from '../../warmup/visits/contracts.ts'

export function wordForWarmupVisitEntry(state: AppState, visit: WarmupVisit, position = visit.nextPosition) {
  const entry = visit.queue[position]
  if (!entry) return null
  return state.datasets.find((dataset) => dataset.id === entry.prompt.datasetId)?.words.find((word) => word.id === entry.prompt.wordId) || null
}

export function wordsForWarmupVisit(state: AppState, visit: WarmupVisit) {
  const words = visit.queue.map((entry) => state.datasets.find((dataset) => dataset.id === entry.prompt.datasetId)?.words.find((word) => word.id === entry.prompt.wordId))
  if (words.some((word) => !word)) throw new Error('A saved Warmup queue references a canonical word that is not available. The queue was not shifted or resumed unsafely.')
  return words as Dataset['words']
}
