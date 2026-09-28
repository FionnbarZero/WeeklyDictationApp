import type { Dataset, Word } from '../domain/contracts.ts'
import type {
  ChildWordState,
  WarmupCategory,
  WarmupLifecycleSnapshot,
  WarmupPolicy,
  WarmupResultEvidence,
  WarmupSelection,
} from './contracts.ts'

type DeriveWarmupWordStatesOptions = {
  datasets: Dataset[]
  results: WarmupResultEvidence[]
  childId: string
  today: Date
  existingStates?: ChildWordState[]
  rotationCycleId: number
  lifecycle: WarmupLifecycleSnapshot
  policy: WarmupPolicy
}

type SelectWarmupWordsOptions = DeriveWarmupWordStatesOptions & {
  targetSize?: number
  random?: () => number
}

function localDateKey(date: Date, timeZone = 'America/Los_Angeles') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function dateIsBetween(date: Date, start: Date, end: Date) {
  const value = localDateKey(date)
  return value >= localDateKey(start) && value <= localDateKey(end)
}

function uniqueWords(words: Word[]) {
  const seen = new Set<string>()
  return words.filter((word) => {
    if (seen.has(word.id)) return false
    seen.add(word.id)
    return true
  })
}

function datasetSeedCategory(dataset: Dataset, lifecycle: WarmupLifecycleSnapshot, today: Date): WarmupCategory {
  if (lifecycle.lifecycleByDatasetId[dataset.id] !== 'mastered') return 'acquisition'
  const masteredAt = lifecycle.masteredAtByDatasetId[dataset.id]
  if (!masteredAt) return 'random-rotation'
  const start = parseDateKey(masteredAt)
  return dateIsBetween(today, start, addDays(start, 6)) ? 'recent-review' : 'random-rotation'
}

function wordStateId(childId: string, wordId: string) {
  return `${childId}::${wordId}`
}

function stateForWord(word: Word, childId: string, category: WarmupCategory, rotationCycleId: number): ChildWordState {
  return { id: wordStateId(childId, word.id), childId, wordId: word.id, datasetId: word.datasetId, category, correctStreak: 0, ...(category === 'random-rotation' ? { randomCycleId: rotationCycleId, randomCycleReviewed: false } : {}) }
}

export function applyWarmupResponse(state: ChildWordState, correct: boolean, reviewedAt: string, rotationCycleId: number, policy: WarmupPolicy): ChildWordState {
  if (!correct) return { ...state, category: 'errored-word', correctStreak: 0, lastReviewedAt: reviewedAt, lastIncorrectAt: reviewedAt, randomCycleReviewed: state.category === 'random-rotation' ? true : state.randomCycleReviewed }
  if (state.category === 'recent-review' || state.category === 'errored-word') {
    const correctStreak = state.correctStreak + 1
    const promotionThreshold = state.category === 'recent-review' ? policy.recentReviewPromotionStreak : policy.erroredWordPromotionStreak
    if (correctStreak >= promotionThreshold) return { ...state, category: 'random-rotation', correctStreak: 0, lastReviewedAt: reviewedAt, randomCycleId: rotationCycleId + 1, randomCycleReviewed: false }
    return { ...state, correctStreak, lastReviewedAt: reviewedAt }
  }
  if (state.category === 'random-rotation') return { ...state, correctStreak: 0, lastReviewedAt: reviewedAt, randomCycleId: rotationCycleId, randomCycleReviewed: true }
  return { ...state, correctStreak: 0, lastReviewedAt: reviewedAt }
}

function orderedResultsForWord(results: WarmupResultEvidence[], childId: string, wordId: string) {
  return results.filter((result) => result.childId === childId && result.wordId === wordId).sort((a, b) => a.completedAt.localeCompare(b.completedAt) || a.id.localeCompare(b.id))
}

export function deriveWarmupWordStates(options: DeriveWarmupWordStatesOptions): ChildWordState[] {
  const datasetsById = new Map(options.datasets.map((dataset) => [dataset.id, dataset]))
  const existingByWordId = new Map((options.existingStates || []).filter((state) => state.childId === options.childId).map((state) => [state.wordId, state]))
  return uniqueWords(options.datasets.flatMap((dataset) => dataset.words)).map((word): ChildWordState => {
    const existing = existingByWordId.get(word.id)
    if (existing) {
      const dataset = datasetsById.get(word.datasetId)
      const seed = dataset ? datasetSeedCategory(dataset, options.lifecycle, options.today) : 'random-rotation'
      if (seed === 'acquisition' && existing.category !== 'acquisition') return { ...existing, category: 'acquisition', correctStreak: 0, randomCycleId: undefined, randomCycleReviewed: undefined }
      if (seed === 'recent-review' && dataset && (!existing.lastReviewedAt || existing.lastReviewedAt.slice(0, 10) < options.lifecycle.masteredAtByDatasetId[dataset.id])) return { ...existing, category: 'recent-review', correctStreak: 0, randomCycleId: undefined, randomCycleReviewed: undefined }
      if (existing.category === 'acquisition' && seed !== 'acquisition') return { ...existing, category: seed, correctStreak: 0, randomCycleId: seed === 'random-rotation' ? options.rotationCycleId : undefined, randomCycleReviewed: seed === 'random-rotation' ? false : undefined }
      return existing
    }
    const dataset = datasetsById.get(word.datasetId)
    let state = stateForWord(word, options.childId, dataset ? datasetSeedCategory(dataset, options.lifecycle, options.today) : 'random-rotation', options.rotationCycleId)
    for (const result of orderedResultsForWord(options.results, options.childId, word.id)) state = applyWarmupResponse(state, result.correct, result.completedAt, options.rotationCycleId, options.policy)
    return state
  })
}

function shuffleWords<T>(words: T[], random = Math.random) {
  const output = [...words]
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[output[index], output[swapIndex]] = [output[swapIndex], output[index]]
  }
  return output
}

function takeWords(words: Word[], count: number, random = Math.random) {
  return shuffleWords(words, random).slice(0, Math.max(0, count))
}

export function selectWarmupWords(options: SelectWarmupWordsOptions): WarmupSelection {
  const targetSize = options.targetSize ?? options.policy.warmupTargetSize
  const random = options.random || Math.random
  const states = deriveWarmupWordStates(options)
  const masteredDatasetIds = new Set(options.lifecycle.masteredDatasetIds)
  const eligibleDatasets = options.datasets.filter((dataset) => masteredDatasetIds.has(dataset.id))
  const eligibleDatasetIds = new Set(eligibleDatasets.map((dataset) => dataset.id))
  const eligibleStates = states.filter((state) => eligibleDatasetIds.has(state.datasetId))
  const wordsById = new Map(uniqueWords(eligibleDatasets.flatMap((dataset) => dataset.words)).map((word) => [word.id, word]))
  const currentCycle = options.rotationCycleId
  const rotationStates = eligibleStates.filter((state) => state.category === 'random-rotation' && (state.randomCycleId || currentCycle) <= currentCycle)
  const allRotationReviewed = rotationStates.length > 0 && rotationStates.every((state) => state.randomCycleId === currentCycle && state.randomCycleReviewed)
  const rotationCycleId = allRotationReviewed ? currentCycle + 1 : currentCycle
  const effectiveRotationStates = allRotationReviewed ? eligibleStates.filter((state) => state.category === 'random-rotation') : rotationStates
  const unreviewedRotationStates = effectiveRotationStates.filter((state) => state.randomCycleId !== rotationCycleId || !state.randomCycleReviewed)
  const rotationPool = shuffleWords(unreviewedRotationStates.map((state) => wordsById.get(state.wordId)).filter((word): word is Word => Boolean(word)), random)
  const recentPool = shuffleWords(eligibleStates.filter((state) => state.category === 'recent-review').map((state) => wordsById.get(state.wordId)).filter((word): word is Word => Boolean(word)), random)
  const erroredPool = shuffleWords(eligibleStates.filter((state) => state.category === 'errored-word').map((state) => wordsById.get(state.wordId)).filter((word): word is Word => Boolean(word)), random)
  const selectedRotation = takeWords(rotationPool, Math.ceil(targetSize * 0.5), random)
  const selectedRecent = takeWords(recentPool, Math.ceil(targetSize * 0.25), random)
  const selectedErrored = takeWords(erroredPool, targetSize - Math.ceil(targetSize * 0.5) - Math.ceil(targetSize * 0.25), random)
  const selected = [...selectedRotation, ...selectedRecent, ...selectedErrored]
  const selectedIds = new Set(selected.map((word) => word.id))
  const fillUnique = (pool: Word[]) => { for (const word of pool) { if (selected.length >= targetSize || selectedIds.has(word.id)) continue; selected.push(word); selectedIds.add(word.id) } }
  fillUnique(rotationPool); fillUnique(erroredPool); fillUnique(recentPool)
  if (selected.length < targetSize && rotationPool.length > 0) { let repeatIndex = 0; while (selected.length < targetSize) { selected.push(rotationPool[repeatIndex % rotationPool.length]); repeatIndex += 1 } }
  const selectedUnique = uniqueWords(selected)
  const rotationIds = selected.filter((word) => rotationPool.some((candidate) => candidate.id === word.id)).map((word) => word.id)
  const recentIds = selected.filter((word) => recentPool.some((candidate) => candidate.id === word.id)).map((word) => word.id)
  const erroredIds = selected.filter((word) => erroredPool.some((candidate) => candidate.id === word.id)).map((word) => word.id)
  return { words: selected.length < targetSize && rotationPool.length === 0 ? selectedUnique : selected, randomRotationWordIds: rotationIds, recentReviewWordIds: recentIds, erroredWordIds: erroredIds, rotationCycleId }
}
