import { grade2DeckProfile, isCanonicalDataset, validateAndClassifyPresentation, type ImportBatchOutcome, type ParserProfile, type PresentationLike } from './slidesImporter.ts'
import { GRADE_TIMERS, TIMER_DEFAULT_GRADE, type SupportedGrade } from './config.ts'
import { grade2PracticeProfile } from './practice/profiles/grade2.ts'

export type LifecyclePhase = 'acquisition' | 'test-review' | 'warmup'
export type PrimaryPhase = 'acquisition' | 'test-review'
export type DatasetLifecycle = LifecyclePhase | 'future' | 'archived'
export type RevealMethod = 'show_answer' | 'timer'

export type Word = {
  id: string
  text: string
  sentence: string
  datasetId: string
  grade?: string
  sourceSlideId?: string
  language?: 'mandarin' | 'english'
  tier?: 'tier-1' | 'tier-2' | 'tier-3'
  activityType?: 'dictation' | 'reading' | 'spelling'
  audio?: { storagePath?: string; voice?: string; generatedAt?: string }
}

export type Dataset = {
  id: string
  dateRange: string
  startDate: string
  endDate: string
  grade: string
  schoolYear: string
  description: string
  words: Word[]
  sourceDeckId?: string
  sourceSlideId?: string
  importStatus?: 'valid' | 'writing-workshop' | 'error'
  isWritingWorkshop?: boolean
  importedAt?: string
  lifecycle?: { firstAvailableAt?: string; archivedAt?: string }
}

export type WordResult = {
  id: string
  childId: string
  datasetId: string
  datasetDateRange: string
  wordId: string
  grade: string
  phase: LifecyclePhase
  sessionId: string
  sessionDate: string
  completedAt: string
  correct: boolean
  revealMethod: RevealMethod
  scored: boolean
  completeSourceDatasetReviewed: boolean
  warmupSessionId?: string
}

export type DatasetScore = {
  id: string
  childId: string
  datasetId: string
  datasetDateRange: string
  phase: LifecyclePhase
  sessionId: string
  sessionDate: string
  percent: number
  correct: number
  wordCount: number
  warmupSessionId?: string
}

export type WarmupSessionRecord = {
  id: string
  childId: string
  sessionId: string
  sessionDate: string
  completedAt?: string
  wordIds: string[]
  datasetIds: string[]
  completeDatasetIds: string[]
  complete: boolean
}

export type CompletedSession = {
  id: string
  childId: string
  sessionDate: string
  primaryDatasetId: string
  primaryPhase: PrimaryPhase
  complete: boolean
}

export type WarmupCategory = 'acquisition' | 'recent-review' | 'errored-word' | 'random-rotation'

export type ChildWordState = {
  id: string
  childId: string
  wordId: string
  datasetId: string
  category: WarmupCategory
  correctStreak: number
  lastReviewedAt?: string
  lastIncorrectAt?: string
  randomCycleId?: number
  randomCycleReviewed?: boolean
}

export type MonthlyRotationScore = {
  id: string
  childId: string
  month: string
  correct: number
  total: number
  percent: number
  status: 'open' | 'finalized'
  updatedAt: string
  finalizedAt?: string
}

export type LegacyRecord = {
  id: string
  childId: string
  legacySet: 'current' | 'previous'
  termId: string
  sessionId: string
  completedAt: string
  correct: boolean
  revealMethod: RevealMethod
  note: 'legacy-date-range-unknown'
}

export type AppState = {
  version: 2
  datasets: Dataset[]
  results: WordResult[]
  scores: DatasetScore[]
  warmupSessions: WarmupSessionRecord[]
  completedSessions: CompletedSession[]
  legacyRecords: LegacyRecord[]
  childWordStates: ChildWordState[]
  monthlyRotationScores: MonthlyRotationScore[]
  rotationCycles: Record<string, number>
}

export type SessionAnswer = {
  word: Word
  correct: boolean
  revealMethod: RevealMethod
}

export type AcquisitionPhase = 'introduction' | 'expanded-trials' | 'correction'
export type AcquisitionPromptKind = 'true-bm' | 'earned-bm' | 'show-copy' | 'target'

export type AcquisitionTimerConfig = {
  trueBmSeconds: number
  earnedBmSeconds: number
  introductionShowCopySeconds: number
  introductionHiddenTargetSeconds: number
  expandedStartSeconds: number
  expandedMinimumSeconds: number
  expandedDecrementSeconds: number
  correctionShowCopySeconds: number
  correctionHiddenSeconds: number
}

export type AcquisitionPrompt = {
  id: string
  kind: AcquisitionPromptKind
  phase: AcquisitionPhase
  word: Word
  targetWordId?: string
  scored: boolean
  timerSeconds: number
  revealed: boolean
}

export type AcquisitionFlow = {
  datasetId: string
  targetIndex: number
  currentTarget: Word | null
  phase: AcquisitionPhase
  step: number
  trialNumber: number
  expandedTargetAttempts: number
  earnedBmPool: Word[]
  trueBmBag: Word[]
  earnedBmBag: Word[]
  lastBmWordId?: string
  consecutiveErrors: Record<string, number>
  correctionRole?: 'current-target' | 'earned-bm'
  resumeAfterEarnedBm?: { step: number; expandedTargetAttempts: number; currentTarget: Word }
  prompt: AcquisitionPrompt | null
  complete: boolean
}

export function shouldRecordAcquisitionAnswer(prompt: Pick<AcquisitionPrompt, 'scored'>) {
  return prompt.scored
}

export type PracticeSession = {
  id: string
  childId: string
  grade: string
  primaryDatasetId: string
  primaryPhase: PrimaryPhase
  segment: 'warmup' | 'primary'
  stage: 'warmup-intro' | 'interstitial' | 'dictation' | 'review' | 'complete'
  queue: Word[]
  warmupQueue: Word[]
  primaryQueue: Word[]
  index: number
  startedAt: string
  warmupAnswers: SessionAnswer[]
  primaryAnswers: SessionAnswer[]
  warmupCategoryByWordId: Record<string, WarmupCategory>
  warmupRandomRotationWordIds: string[]
  warmupRotationCycleId: number
  acquisition?: AcquisitionFlow
  warmupSkipped?: boolean
  testReviewSkipped?: boolean
  warmupOnly?: boolean
  cloudSessionId?: string
}

export function activePracticeWord(session: Pick<PracticeSession, 'segment' | 'acquisition' | 'queue' | 'index'>) {
  return session.segment === 'primary' && session.acquisition?.prompt ? session.acquisition.prompt.word : session.queue[session.index]
}

export type WarmupSelection = {
  words: Word[]
  randomRotationWordIds: string[]
  recentReviewWordIds: string[]
  erroredWordIds: string[]
  rotationCycleId: number
}

export const APP_STATE_KEY = 'weekly-dictation-state-v2'
export const LEGACY_ATTEMPTS_KEY = 'weekly-dictation-attempts'
export const WARMUP_TARGET_SIZE = grade2PracticeProfile.lifecycle.warmupTargetSize
export const RECENT_REVIEW_PROMOTION_STREAK = grade2PracticeProfile.lifecycle.recentReviewPromotionStreak
export const ERRORED_WORD_PROMOTION_STREAK = grade2PracticeProfile.lifecycle.erroredWordPromotionStreak
export const AUDIO_PAUSE_MS = 1000
export const NORMAL_WORD_RATE = 0.25
export const NORMAL_SENTENCE_RATE = 0.55
export const GRADE_ORDER = ['Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5'] as const

export const ACQUISITION_TIMER_DEFAULTS: AcquisitionTimerConfig = {
  ...grade2PracticeProfile.acquisition.timers,
}

export const ACQUISITION_TIMER_CONFIG: Record<string, AcquisitionTimerConfig> = Object.fromEntries(
  GRADE_ORDER.map((grade) => [grade, { ...ACQUISITION_TIMER_DEFAULTS }]),
)

export function acquisitionTimerConfigFor(grade: string) {
  return ACQUISITION_TIMER_CONFIG[grade] || ACQUISITION_TIMER_DEFAULTS
}

const TRUE_BM_TEXTS = grade2PracticeProfile.acquisition.trueBmTexts

export const TRUE_BM_WORDS: Word[] = TRUE_BM_TEXTS.map((text, index) => ({
  id: `true-bm-${index + 1}`,
  text,
  sentence: '',
  datasetId: '__true-bm__',
  language: 'mandarin',
  tier: 'tier-1',
  activityType: 'dictation',
}))

export type AudioPart = { text: string; rate: number }

export function audioPartsForWord(word: Word, warmup = false): AudioPart[] {
  const multiplier = warmup ? 1.5 : 1
  const wordRate = Math.min(1, NORMAL_WORD_RATE * multiplier)
  const sentenceRate = Math.min(1, NORMAL_SENTENCE_RATE * multiplier)
  return [{ text: word.text, rate: wordRate }, ...(word.sentence.trim() ? [{ text: word.sentence, rate: sentenceRate }] : []), { text: word.text, rate: wordRate }, { text: word.text, rate: wordRate }]
}

export function timerSecondsFor(grade: string | null | undefined, segment: string | null | undefined, primaryPhase: string | null | undefined) {
  const selectedGrade = isSupportedGrade(grade) ? grade : TIMER_DEFAULT_GRADE
  const selectedSegment = segment === 'warmup' ? 'warmup' : 'primary'
  const selectedPhase = primaryPhase === 'test-review' ? 'test-review' : 'acquisition'
  const timer = GRADE_TIMERS[selectedGrade]
  return selectedSegment === 'warmup' ? timer.warmup : selectedPhase === 'test-review' ? timer.testReview : timer.acquisition
}

export function createSessionId() {
  return `session-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

function isSupportedGrade(value: unknown): value is SupportedGrade {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(GRADE_TIMERS, value)
}

export function localDateKey(date = new Date(), timeZone = 'America/Los_Angeles') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

export function dateIsBetween(date: Date, start: Date, end: Date) {
  const value = localDateKey(date)
  return value >= localDateKey(start) && value <= localDateKey(end)
}

export function datasetLifecycle(dataset: Dataset, date = new Date()): DatasetLifecycle {
  const start = parseDateKey(dataset.startDate)
  const end = parseDateKey(dataset.endDate)
  if (dateIsBetween(date, start, end)) return 'acquisition'
  if (dateIsBetween(date, addDays(start, 7), addDays(end, 7))) return 'test-review'
  return localDateKey(date) < dataset.startDate ? 'future' : 'archived'
}

export function getActiveLifecycleDatasets(datasets: Dataset[], date = new Date()) {
  const newest = (phase: 'acquisition' | 'test-review') => datasets
    .filter((dataset) => isCanonicalDataset(dataset) && !dataset.isWritingWorkshop && dataset.words.length > 0 && datasetLifecycle(dataset, date) === phase)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] || null
  return { acquisition: newest('acquisition'), testReview: newest('test-review') }
}

export function sortDatasetsNewestFirst(datasets: Dataset[]) {
  return [...datasets].sort((a, b) => b.startDate.localeCompare(a.startDate))
}

export function filterDatasetsForChild(datasets: Dataset[], grade: string, schoolYear: string) {
  const schoolYearKey = (value: string) => {
    const years = [...value.matchAll(/20\d{2}/g)].map((match) => Number(match[0]))
    return years.length >= 2 ? `${years[0]}-${String(years[1]).slice(-2)}` : years.length === 1 ? `${years[0]}-${String(years[0] + 1).slice(-2)}` : value
  }
  const requestedYear = schoolYearKey(schoolYear)
  return sortDatasetsNewestFirst(datasets.filter((dataset) => isCanonicalDataset(dataset) && dataset.grade === grade && schoolYearKey(dataset.schoolYear) === requestedYear))
}

export function nextGrade(grade: string) {
  const index = GRADE_ORDER.indexOf(grade as typeof GRADE_ORDER[number])
  return index >= 0 && index < GRADE_ORDER.length - 1 ? GRADE_ORDER[index + 1] : null
}

export function shouldSuggestGradePromotion(child: { grade: string; gradeEffectiveDate?: string }, date = new Date(), timeZone = 'America/Los_Angeles') {
  const today = localDateKey(date, timeZone)
  const augustFirst = `${today.slice(0, 4)}-08-01`
  return today >= augustFirst && Boolean(nextGrade(child.grade)) && (child.gradeEffectiveDate || '') < augustFirst
}

function uniqueWords(words: Word[]) {
  const seen = new Set<string>()
  return words.filter((word) => {
    if (seen.has(word.id)) return false
    seen.add(word.id)
    return true
  })
}

function datasetSeedCategory(dataset: Dataset, today: Date): WarmupCategory {
  const lifecycle = datasetLifecycle(dataset, today)
  if (lifecycle !== 'archived') return 'acquisition'
  const end = parseDateKey(dataset.endDate)
  return dateIsBetween(today, addDays(end, 8), addDays(end, 14)) ? 'recent-review' : 'random-rotation'
}

function archivedWarmupStart(dataset: Dataset) {
  return localDateKey(addDays(parseDateKey(dataset.endDate), 8))
}

function wordStateId(childId: string, wordId: string) {
  return `${childId}::${wordId}`
}

function stateForWord(word: Word, childId: string, dataset: Dataset | undefined, today: Date, rotationCycleId: number): ChildWordState {
  const category = dataset ? datasetSeedCategory(dataset, today) : 'random-rotation'
  return { id: wordStateId(childId, word.id), childId, wordId: word.id, datasetId: word.datasetId, category, correctStreak: 0, ...(category === 'random-rotation' ? { randomCycleId: rotationCycleId, randomCycleReviewed: false } : {}) }
}

function applyWordResponse(state: ChildWordState, correct: boolean, reviewedAt: string, rotationCycleId: number): ChildWordState {
  if (!correct) return { ...state, category: 'errored-word', correctStreak: 0, lastReviewedAt: reviewedAt, lastIncorrectAt: reviewedAt, randomCycleReviewed: state.category === 'random-rotation' ? true : state.randomCycleReviewed }
  if (state.category === 'recent-review' || state.category === 'errored-word') {
    const correctStreak = state.correctStreak + 1
    const promotionThreshold = state.category === 'recent-review' ? RECENT_REVIEW_PROMOTION_STREAK : ERRORED_WORD_PROMOTION_STREAK
    if (correctStreak >= promotionThreshold) return { ...state, category: 'random-rotation', correctStreak: 0, lastReviewedAt: reviewedAt, randomCycleId: rotationCycleId + 1, randomCycleReviewed: false }
    return { ...state, correctStreak, lastReviewedAt: reviewedAt }
  }
  if (state.category === 'random-rotation') return { ...state, correctStreak: 0, lastReviewedAt: reviewedAt, randomCycleId: rotationCycleId, randomCycleReviewed: true }
  return { ...state, correctStreak: 0, lastReviewedAt: reviewedAt }
}

function orderedResultsForWord(results: WordResult[], childId: string, wordId: string) {
  return results.filter((result) => result.childId === childId && result.wordId === wordId).sort((a, b) => a.completedAt.localeCompare(b.completedAt) || a.id.localeCompare(b.id))
}

export function deriveChildWordStates(options: { datasets: Dataset[]; results: WordResult[]; childId: string; today?: Date; existingStates?: ChildWordState[]; rotationCycleId?: number }): ChildWordState[] {
  const today = options.today || new Date()
  const cycle = options.rotationCycleId || 1
  const datasetsById = new Map(options.datasets.map((dataset) => [dataset.id, dataset]))
  const existingByWordId = new Map((options.existingStates || []).filter((state) => state.childId === options.childId).map((state) => [state.wordId, state]))
  return uniqueWords(options.datasets.flatMap((dataset) => dataset.words)).map((word): ChildWordState => {
    const existing = existingByWordId.get(word.id)
    if (existing) {
      const dataset = datasetsById.get(word.datasetId)
      const seed = dataset ? datasetSeedCategory(dataset, today) : 'random-rotation'
      if (seed === 'acquisition' && existing.category !== 'acquisition') return { ...existing, category: 'acquisition', correctStreak: 0, randomCycleId: undefined, randomCycleReviewed: undefined }
      if (seed === 'recent-review' && dataset && (!existing.lastReviewedAt || existing.lastReviewedAt.slice(0, 10) < archivedWarmupStart(dataset))) return { ...existing, category: 'recent-review', correctStreak: 0, randomCycleId: undefined, randomCycleReviewed: undefined }
      if (existing.category === 'acquisition' && seed !== 'acquisition') return { ...existing, category: seed, correctStreak: 0, randomCycleId: seed === 'random-rotation' ? cycle : undefined, randomCycleReviewed: seed === 'random-rotation' ? false : undefined }
      return existing
    }
    let state = stateForWord(word, options.childId, datasetsById.get(word.datasetId), today, cycle)
    for (const result of orderedResultsForWord(options.results, options.childId, word.id)) state = applyWordResponse(state, result.correct, result.completedAt, cycle)
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

export function buildWarmupSelection(options: { datasets: Dataset[]; results: WordResult[]; childId: string; today?: Date; childWordStates?: ChildWordState[]; rotationCycleId?: number; targetSize?: number; random?: () => number }): WarmupSelection {
  const today = options.today || new Date()
  const targetSize = options.targetSize ?? WARMUP_TARGET_SIZE
  const random = options.random || Math.random
  const states = deriveChildWordStates({ datasets: options.datasets, results: options.results, childId: options.childId, today, existingStates: options.childWordStates, rotationCycleId: options.rotationCycleId })
  const eligibleDatasets = options.datasets.filter((dataset) => isCanonicalDataset(dataset) && !dataset.isWritingWorkshop && dataset.words.length > 0 && datasetLifecycle(dataset, today) === 'archived')
  const eligibleDatasetIds = new Set(eligibleDatasets.map((dataset) => dataset.id))
  const eligibleStates = states.filter((state) => eligibleDatasetIds.has(state.datasetId))
  const wordsById = new Map(uniqueWords(eligibleDatasets.flatMap((dataset) => dataset.words)).map((word) => [word.id, word]))
  const currentCycle = options.rotationCycleId || 1
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

export function createPracticeSessionForTarget(options: {
  id: string
  childId: string
  grade: string
  target: { dataset: Dataset; phase: PrimaryPhase } | null
  warmup: WarmupSelection
  startedAt: string
  cloudSessionId?: string
  random?: () => number
}): PracticeSession {
  const random = options.random || Math.random
  const target = options.target && options.target.dataset.words.length > 0 && !options.target.dataset.isWritingWorkshop ? options.target : null
  const primaryDatasetId = target?.dataset.id || options.warmup.words[0]?.datasetId || 'warmup-only'
  const warmupCategoryByWordId = Object.fromEntries(options.warmup.words.map((word) => [
    word.id,
    options.warmup.randomRotationWordIds.includes(word.id) ? 'random-rotation' : options.warmup.erroredWordIds.includes(word.id) ? 'errored-word' : 'recent-review',
  ])) as PracticeSession['warmupCategoryByWordId']
  return {
    id: options.id,
    childId: options.childId,
    grade: options.grade,
    primaryDatasetId,
    primaryPhase: target?.phase || 'acquisition',
    segment: 'warmup',
    stage: 'warmup-intro',
    queue: shuffleWords(options.warmup.words, random),
    warmupQueue: options.warmup.words,
    primaryQueue: target?.dataset.words || [],
    index: 0,
    startedAt: options.startedAt,
    warmupAnswers: [],
    primaryAnswers: [],
    warmupCategoryByWordId,
    warmupRandomRotationWordIds: options.warmup.randomRotationWordIds,
    warmupRotationCycleId: options.warmup.rotationCycleId,
    acquisition: target?.phase === 'acquisition' ? startAcquisitionFlow(target.dataset, options.grade, random) : undefined,
    warmupOnly: !target,
    cloudSessionId: options.cloudSessionId,
  }
}

const INTRODUCTION_SEQUENCE = grade2PracticeProfile.acquisition.introductionSequence
const EXPANDED_SEQUENCE = grade2PracticeProfile.acquisition.expandedSequence
const CORRECTION_SEQUENCE = grade2PracticeProfile.acquisition.correctionSequence

function shuffledBag(words: Word[], random: () => number) {
  return shuffleWords(words, random)
}

function drawFromBag(words: Word[], bag: Word[], lastBmWordId: string | undefined, random: () => number) {
  const eligibleIds = new Set(words.map((word) => word.id))
  let nextBag = bag.filter((word) => eligibleIds.has(word.id))
  if (nextBag.length === 0) nextBag = shuffledBag(words, random)
  if (nextBag.length > 1 && nextBag[0].id === lastBmWordId) {
    const alternativeIndex = nextBag.findIndex((word) => word.id !== lastBmWordId)
    if (alternativeIndex > 0) [nextBag[0], nextBag[alternativeIndex]] = [nextBag[alternativeIndex], nextBag[0]]
  }
  const [word, ...remaining] = nextBag
  return { word, bag: remaining }
}

function bagCanAvoidRepeat(words: Word[], bag: Word[], lastBmWordId: string | undefined) {
  const eligibleIds = new Set(words.map((word) => word.id))
  const activeBag = bag.filter((word) => eligibleIds.has(word.id))
  const candidates = activeBag.length > 0 ? activeBag : words
  return candidates.some((word) => word.id !== lastBmWordId)
}

function acquisitionPromptTimer(grade: string, phase: AcquisitionPhase, kind: AcquisitionPromptKind, expandedTargetAttempts: number) {
  const config = acquisitionTimerConfigFor(grade)
  if (kind === 'true-bm') return config.trueBmSeconds
  if (kind === 'earned-bm') return config.earnedBmSeconds
  if (kind === 'show-copy') return phase === 'correction' ? config.correctionShowCopySeconds : config.introductionShowCopySeconds
  if (phase === 'introduction') return config.introductionHiddenTargetSeconds
  if (phase === 'correction') return config.correctionHiddenSeconds
  return Math.max(config.expandedMinimumSeconds, config.expandedStartSeconds - expandedTargetAttempts * config.expandedDecrementSeconds)
}

function makeAcquisitionPrompt(flow: AcquisitionFlow, grade: string, kind: AcquisitionPromptKind, word: Word, targetWordId?: string): AcquisitionFlow {
  const trialNumber = flow.trialNumber + 1
  return {
    ...flow,
    trialNumber,
    prompt: {
      id: `${flow.datasetId}-${flow.targetIndex}-${flow.phase}-${flow.step}-${trialNumber}-${kind}-${word.id}`,
      kind,
      phase: flow.phase,
      word,
      targetWordId,
      scored: kind === 'target' || kind === 'earned-bm',
      timerSeconds: acquisitionPromptTimer(grade, flow.phase, kind, flow.expandedTargetAttempts),
      revealed: false,
    },
  }
}

function trueBmPrompt(flow: AcquisitionFlow, grade: string, random: () => number) {
  const drawn = drawFromBag(TRUE_BM_WORDS, flow.trueBmBag, flow.lastBmWordId, random)
  return makeAcquisitionPrompt({ ...flow, trueBmBag: drawn.bag, lastBmWordId: drawn.word.id }, grade, 'true-bm', drawn.word)
}

function bmPrompt(flow: AcquisitionFlow, grade: string, random: () => number) {
  const preferEarned = flow.earnedBmPool.length > 0 && random() >= 0.5
  const earnedCanAvoidRepeat = bagCanAvoidRepeat(flow.earnedBmPool, flow.earnedBmBag, flow.lastBmWordId)
  if (preferEarned && earnedCanAvoidRepeat) {
    const drawn = drawFromBag(flow.earnedBmPool, flow.earnedBmBag, flow.lastBmWordId, random)
    return makeAcquisitionPrompt({
      ...flow,
      earnedBmBag: drawn.bag,
      lastBmWordId: drawn.word.id,
      resumeAfterEarnedBm: { step: flow.step + 1, expandedTargetAttempts: flow.expandedTargetAttempts, currentTarget: flow.currentTarget! },
    }, grade, 'earned-bm', drawn.word, drawn.word.id)
  }
  return trueBmPrompt(flow, grade, random)
}

function coreAcquisitionPrompt(flow: AcquisitionFlow, grade: string, random: () => number): AcquisitionFlow {
  if (!flow.currentTarget) return { ...flow, prompt: null, complete: true }
  const token = flow.phase === 'introduction' ? INTRODUCTION_SEQUENCE[flow.step] : flow.phase === 'expanded-trials' ? EXPANDED_SEQUENCE[flow.step] : CORRECTION_SEQUENCE[flow.step]
  if (!token) return flow
  if (token === 'true-bm') return trueBmPrompt(flow, grade, random)
  if (token === 'bm') return bmPrompt(flow, grade, random)
  if (token === 'show-copy') return makeAcquisitionPrompt(flow, grade, 'show-copy', flow.currentTarget, flow.currentTarget.id)
  return makeAcquisitionPrompt(flow, grade, 'target', flow.currentTarget, flow.currentTarget.id)
}

export function startAcquisitionFlow(dataset: Dataset, grade = dataset.grade, random = Math.random): AcquisitionFlow {
  const currentTarget = dataset.words[0] || null
  return coreAcquisitionPrompt({
    datasetId: dataset.id,
    targetIndex: 0,
    currentTarget,
    phase: 'introduction',
    step: 0,
    trialNumber: 0,
    expandedTargetAttempts: 0,
    earnedBmPool: [],
    trueBmBag: [],
    earnedBmBag: [],
    consecutiveErrors: {},
    prompt: null,
    complete: !currentTarget,
  }, grade, random)
}

function withEarnedWord(flow: AcquisitionFlow, word: Word) {
  return flow.earnedBmPool.some((candidate) => candidate.id === word.id) ? flow : { ...flow, earnedBmPool: [...flow.earnedBmPool, word] }
}

function withoutEarnedWord(flow: AcquisitionFlow, wordId: string) {
  return { ...flow, earnedBmPool: flow.earnedBmPool.filter((word) => word.id !== wordId), earnedBmBag: flow.earnedBmBag.filter((word) => word.id !== wordId) }
}

function resumeInterruptedTarget(flow: AcquisitionFlow, grade: string, random: () => number) {
  const resume = flow.resumeAfterEarnedBm
  if (!resume) return flow
  return coreAcquisitionPrompt({
    ...flow,
    currentTarget: resume.currentTarget,
    phase: 'expanded-trials',
    step: resume.step,
    expandedTargetAttempts: resume.expandedTargetAttempts,
    correctionRole: undefined,
    resumeAfterEarnedBm: undefined,
    prompt: null,
  }, grade, random)
}

function advanceToNextTarget(flow: AcquisitionFlow, dataset: Dataset, grade: string, random: () => number) {
  const nextIndex = flow.targetIndex + 1
  if (nextIndex >= dataset.words.length) return { ...flow, currentTarget: null, prompt: null, complete: true }
  return coreAcquisitionPrompt({ ...flow, targetIndex: nextIndex, currentTarget: dataset.words[nextIndex], phase: 'introduction', step: 0, expandedTargetAttempts: 0, correctionRole: undefined, resumeAfterEarnedBm: undefined, prompt: null, complete: false }, grade, random)
}

function completeCurrentTarget(flow: AcquisitionFlow, dataset: Dataset, grade: string, random: () => number) {
  const target = flow.currentTarget
  if (!target) return { ...flow, prompt: null, complete: true }
  const earned = withEarnedWord(flow, target)
  return flow.resumeAfterEarnedBm ? resumeInterruptedTarget(earned, grade, random) : advanceToNextTarget(earned, dataset, grade, random)
}

function errorsAfter(flow: AcquisitionFlow, wordId: string, correct: boolean) {
  return { ...flow.consecutiveErrors, [wordId]: correct ? 0 : (flow.consecutiveErrors[wordId] || 0) + 1 }
}

function restartIntroduction(flow: AcquisitionFlow, word: Word, grade: string, random: () => number) {
  return coreAcquisitionPrompt({ ...withoutEarnedWord(flow, word.id), currentTarget: word, phase: 'introduction', step: 0, expandedTargetAttempts: 0, correctionRole: undefined, prompt: null }, grade, random)
}

function enterCorrection(flow: AcquisitionFlow, word: Word, role: 'current-target' | 'earned-bm', grade: string, random: () => number) {
  return coreAcquisitionPrompt({ ...flow, currentTarget: word, phase: 'correction', step: 0, correctionRole: role, prompt: null }, grade, random)
}

export function revealAcquisitionPrompt(flow: AcquisitionFlow) {
  if (!flow.prompt) return flow
  return { ...flow, prompt: { ...flow.prompt, revealed: true } }
}

export function answerAcquisitionPrompt(flow: AcquisitionFlow, dataset: Dataset, grade: string, correct: boolean, random = Math.random): AcquisitionFlow {
  const prompt = flow.prompt
  if (!prompt || !prompt.revealed) return flow

  if (!prompt.scored) return coreAcquisitionPrompt({ ...flow, step: flow.step + 1, prompt: null }, grade, random)

  const consecutiveErrors = errorsAfter(flow, prompt.word.id, correct)
  const updated = { ...flow, consecutiveErrors }

  if (prompt.kind === 'earned-bm') {
    if (correct) return resumeInterruptedTarget(updated, grade, random)
    if (consecutiveErrors[prompt.word.id] >= 3) return restartIntroduction(updated, prompt.word, grade, random)
    return enterCorrection(updated, prompt.word, 'earned-bm', grade, random)
  }

  if (!correct && consecutiveErrors[prompt.word.id] >= 3) return restartIntroduction(updated, prompt.word, grade, random)

  if (flow.phase === 'introduction') {
    return correct
      ? coreAcquisitionPrompt({ ...updated, phase: 'expanded-trials', step: 0, expandedTargetAttempts: 1, prompt: null }, grade, random)
      : enterCorrection({ ...updated, expandedTargetAttempts: 1 }, prompt.word, 'current-target', grade, random)
  }

  if (flow.phase === 'expanded-trials') {
    const expandedTargetAttempts = flow.expandedTargetAttempts + 1
    if (!correct) return enterCorrection({ ...updated, expandedTargetAttempts }, prompt.word, 'current-target', grade, random)
    const nextStep = flow.step + 1
    return nextStep >= EXPANDED_SEQUENCE.length
      ? completeCurrentTarget({ ...updated, expandedTargetAttempts, prompt: null }, dataset, grade, random)
      : coreAcquisitionPrompt({ ...updated, step: nextStep, expandedTargetAttempts, prompt: null }, grade, random)
  }

  if (flow.step === 3) {
    return coreAcquisitionPrompt({ ...updated, step: 4, prompt: null }, grade, random)
  }

  if (correct) {
    if (flow.correctionRole === 'earned-bm') return resumeInterruptedTarget(withEarnedWord(updated, prompt.word), grade, random)
    return coreAcquisitionPrompt({ ...updated, phase: 'expanded-trials', step: 0, expandedTargetAttempts: 0, correctionRole: undefined, prompt: null }, grade, random)
  }

  return coreAcquisitionPrompt({ ...updated, step: 0, prompt: null }, grade, random)
}

function normalizeLegacyAttempt(value: unknown): LegacyRecord | null {
  if (!isRecord(value)) return null
  if (typeof value.childId !== 'string' || (value.weeklySetId !== 'current' && value.weeklySetId !== 'previous') || typeof value.termId !== 'string' || typeof value.sessionId !== 'string' || typeof value.completedAt !== 'string' || typeof value.correct !== 'boolean') return null
  return { id: `legacy-${value.sessionId}-${value.termId}`, childId: value.childId, legacySet: value.weeklySetId, termId: value.termId, sessionId: value.sessionId, completedAt: value.completedAt, correct: value.correct, revealMethod: value.revealMethod === 'timer' ? 'timer' : 'show_answer', note: 'legacy-date-range-unknown' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function canonicalDatasets(datasets: Dataset[]) {
  const seen = new Set<string>()
  return datasets.filter((dataset) => {
    if (!isCanonicalDataset(dataset) || seen.has(dataset.id)) return false
    seen.add(dataset.id)
    return true
  })
}

function discardIncompleteWarmupData(state: AppState) {
  const incomplete = state.warmupSessions.filter((session) => !session.complete)
  if (incomplete.length === 0) return state
  const sessionIds = new Set(incomplete.map((session) => session.sessionId))
  const warmupIds = new Set(incomplete.map((session) => session.id))
  return {
    ...state,
    results: state.results.filter((result) => !sessionIds.has(result.sessionId) && (!result.warmupSessionId || !warmupIds.has(result.warmupSessionId))),
    warmupSessions: state.warmupSessions.filter((session) => session.complete),
  }
}

export type LocalHydrationResult = { state: AppState; batch: ImportBatchOutcome }

export function hydrateLocalState(state: AppState, presentation: PresentationLike, profile: ParserProfile = grade2DeckProfile): LocalHydrationResult {
  const batch = validateAndClassifyPresentation(presentation, state.datasets.map((dataset) => dataset.id), profile)
  const datasets = canonicalDatasets([...batch.datasets, ...state.datasets])
  return { state: { ...state, datasets }, batch }
}

export function createInitialState(importedDatasetsOrLegacy: Dataset[] | string | null = [], legacyRaw?: string | null): AppState {
  const importedDatasets = Array.isArray(importedDatasetsOrLegacy) ? importedDatasetsOrLegacy : []
  const legacyInput = Array.isArray(importedDatasetsOrLegacy) ? legacyRaw : importedDatasetsOrLegacy || legacyRaw
  let legacyRecords: LegacyRecord[] = []
  try {
    const parsed: unknown = legacyInput ? JSON.parse(legacyInput) : []
    legacyRecords = Array.isArray(parsed) ? parsed.map(normalizeLegacyAttempt).filter((item): item is LegacyRecord => Boolean(item)) : []
  } catch {
    legacyRecords = []
  }
  return { version: 2, datasets: canonicalDatasets(importedDatasets), results: [], scores: [], warmupSessions: [], completedSessions: [], legacyRecords, childWordStates: [], monthlyRotationScores: [], rotationCycles: {} }
}

export function isAppState(value: unknown): value is AppState {
  if (!isRecord(value) || value.version !== 2 || !Array.isArray(value.datasets) || !Array.isArray(value.results) || !Array.isArray(value.scores) || !Array.isArray(value.warmupSessions) || !Array.isArray(value.completedSessions) || !Array.isArray(value.legacyRecords)) return false
  const datasetsValid = value.datasets.every((dataset) => isRecord(dataset) && typeof dataset.id === 'string' && typeof dataset.dateRange === 'string' && typeof dataset.startDate === 'string' && typeof dataset.endDate === 'string' && typeof dataset.grade === 'string' && Array.isArray(dataset.words) && dataset.words.every((word) => isRecord(word) && typeof word.id === 'string' && typeof word.text === 'string' && typeof word.sentence === 'string' && word.datasetId === dataset.id))
  const resultsValid = value.results.every((result) => isRecord(result) && typeof result.id === 'string' && typeof result.childId === 'string' && typeof result.datasetId === 'string' && typeof result.wordId === 'string' && typeof result.sessionId === 'string' && typeof result.sessionDate === 'string' && (result.phase === 'warmup' || result.phase === 'acquisition' || result.phase === 'test-review') && typeof result.correct === 'boolean' && typeof result.completeSourceDatasetReviewed === 'boolean')
  const scoresValid = value.scores.every((score) => isRecord(score) && typeof score.id === 'string' && typeof score.childId === 'string' && typeof score.datasetId === 'string' && typeof score.sessionId === 'string' && typeof score.sessionDate === 'string' && typeof score.percent === 'number')
  const warmupsValid = value.warmupSessions.every((session) => isRecord(session) && typeof session.id === 'string' && typeof session.childId === 'string' && typeof session.sessionDate === 'string' && Array.isArray(session.wordIds) && Array.isArray(session.datasetIds) && Array.isArray(session.completeDatasetIds) && typeof session.complete === 'boolean')
  const sessionsValid = value.completedSessions.every((session) => isRecord(session) && typeof session.id === 'string' && typeof session.childId === 'string' && typeof session.sessionDate === 'string' && typeof session.primaryDatasetId === 'string' && session.complete === true)
  const legacyValid = value.legacyRecords.every((record) => isRecord(record) && typeof record.id === 'string' && typeof record.childId === 'string' && typeof record.legacySet === 'string' && record.note === 'legacy-date-range-unknown')
  const statesValid = !('childWordStates' in value) || (Array.isArray(value.childWordStates) && value.childWordStates.every((state) => isRecord(state) && typeof state.id === 'string' && typeof state.childId === 'string' && typeof state.wordId === 'string' && typeof state.datasetId === 'string' && ['acquisition', 'recent-review', 'errored-word', 'random-rotation'].includes(String(state.category)) && typeof state.correctStreak === 'number'))
  const monthlyValid = !('monthlyRotationScores' in value) || (Array.isArray(value.monthlyRotationScores) && value.monthlyRotationScores.every((score) => isRecord(score) && typeof score.id === 'string' && typeof score.childId === 'string' && typeof score.month === 'string' && typeof score.correct === 'number' && typeof score.total === 'number' && typeof score.percent === 'number' && (score.status === 'open' || score.status === 'finalized') && typeof score.updatedAt === 'string'))
  const cyclesValid = !('rotationCycles' in value) || (isRecord(value.rotationCycles) && Object.values(value.rotationCycles).every((cycle) => typeof cycle === 'number' && Number.isInteger(cycle) && cycle > 0))
  return datasetsValid && resultsValid && scoresValid && warmupsValid && sessionsValid && legacyValid && statesValid && monthlyValid && cyclesValid
}

export function loadState(rawState: string | null, legacyRaw?: string | null, importedDatasets: Dataset[] = []): AppState {
  try {
    const parsed: unknown = rawState ? JSON.parse(rawState) : null
    if (isAppState(parsed)) {
      const normalized = { ...parsed, datasets: canonicalDatasets([...importedDatasets, ...parsed.datasets]), childWordStates: Array.isArray(parsed.childWordStates) ? parsed.childWordStates : [], monthlyRotationScores: Array.isArray(parsed.monthlyRotationScores) ? parsed.monthlyRotationScores : [], rotationCycles: isRecord(parsed.rotationCycles) ? parsed.rotationCycles as Record<string, number> : {} }
      return discardIncompleteWarmupData(normalized)
    }
  } catch {
    // Fall through to an empty state with any explicitly supplied importer data.
  }
  return createInitialState(importedDatasets, legacyRaw)
}

export function latestScore(scores: DatasetScore[], childId: string, datasetId: string) {
  return scores
    .map((score, index) => ({ score, index }))
    .filter(({ score }) => score.childId === childId && score.datasetId === datasetId)
    .sort((a, b) => b.score.sessionDate.localeCompare(a.score.sessionDate) || b.index - a.index)[0]?.score || null
}

export function rotationMonth(date: Date, timeZone = 'America/Los_Angeles') {
  return localDateKey(date, timeZone).slice(0, 7)
}

export function finalizeMonthlyRotationScores(scores: MonthlyRotationScore[], now = new Date()) {
  const currentMonth = rotationMonth(now)
  return scores.map((score) => score.month < currentMonth && score.status !== 'finalized' ? { ...score, status: 'finalized' as const, finalizedAt: score.finalizedAt || now.toISOString(), updatedAt: now.toISOString() } : score)
}

function updateMonthlyRotationScores(scores: MonthlyRotationScore[], childId: string, month: string, answers: SessionAnswer[], updatedAt: string) {
  if (answers.length === 0) return scores
  const existing = scores.find((score) => score.childId === childId && score.month === month)
  const correct = answers.filter((answer) => answer.correct).length
  const next = existing ? { ...existing, correct: existing.correct + correct, total: existing.total + answers.length, percent: Math.round(((existing.correct + correct) / (existing.total + answers.length)) * 100), status: existing.status === 'finalized' ? 'finalized' as const : 'open' as const, updatedAt } : { id: `${childId}-random-rotation-${month}`, childId, month, correct, total: answers.length, percent: Math.round((correct / answers.length) * 100), status: 'open' as const, updatedAt }
  return existing ? scores.map((score) => score.id === existing.id ? next : score) : [...scores, next]
}

function materializeStateForCommit(state: AppState, session: PracticeSession, now: Date) {
  const rotationCycleId = session.warmupRotationCycleId || state.rotationCycles[session.childId] || 1
  let states = deriveChildWordStates({ datasets: state.datasets, results: state.results, childId: session.childId, existingStates: state.childWordStates, today: now, rotationCycleId })
  for (const answer of [...session.warmupAnswers, ...session.primaryAnswers]) {
    const current = states.find((item) => item.wordId === answer.word.id)
    if (!current) continue
    const next = applyWordResponse(current, answer.correct, now.toISOString(), rotationCycleId)
    states = states.map((item) => item.id === next.id ? next : item)
  }
  return { states, rotationCycleId }
}

function commitSessionAttempts(state: AppState, session: PracticeSession, now: Date, complete: boolean): AppState {
  const warmupSessionId = `${session.id}-warmup`
  if (state.completedSessions.some((item) => item.id === session.id) || state.warmupSessions.some((item) => item.id === warmupSessionId)) return state
  const sessionDate = localDateKey(now)
  const warmupResults: WordResult[] = session.warmupAnswers.map((answer, index) => {
    const dataset = state.datasets.find((item) => item.id === answer.word.datasetId)
    return { id: `${session.id}-warmup-${answer.word.id}-${index}`, childId: session.childId, datasetId: answer.word.datasetId, datasetDateRange: dataset?.dateRange || 'Unknown date range', wordId: answer.word.id, grade: session.grade, phase: 'warmup', sessionId: session.id, sessionDate, completedAt: now.toISOString(), correct: answer.correct, revealMethod: 'timer', scored: true, completeSourceDatasetReviewed: false, warmupSessionId }
  })
  const primaryResults: WordResult[] = complete ? session.primaryAnswers.map((answer, index) => {
    const dataset = state.datasets.find((item) => item.id === answer.word.datasetId)
    return { id: `${session.id}-primary-${answer.word.id}-${index}`, childId: session.childId, datasetId: answer.word.datasetId, datasetDateRange: dataset?.dateRange || 'Unknown date range', wordId: answer.word.id, grade: session.grade, phase: session.primaryPhase, sessionId: session.id, sessionDate, completedAt: now.toISOString(), correct: answer.correct, revealMethod: 'timer', scored: true, completeSourceDatasetReviewed: true }
  }) : []
  const primaryDataset = state.datasets.find((dataset) => dataset.id === session.primaryDatasetId)
  const scores: DatasetScore[] = []
  if (complete && primaryDataset && primaryDataset.words.length > 0) {
    if (session.primaryPhase === 'acquisition' && session.acquisition?.complete && session.primaryAnswers.length > 0) {
      scores.push(makeScore(session, primaryDataset, session.primaryAnswers, session.primaryPhase, sessionDate))
    } else {
      const latestPrimaryAnswers = latestAnswerPerWord(session.primaryAnswers)
      if (latestPrimaryAnswers.length === primaryDataset.words.length && primaryDataset.words.every((word) => latestPrimaryAnswers.some((answer) => answer.word.id === word.id))) scores.push(makeScore(session, primaryDataset, latestPrimaryAnswers, session.primaryPhase, sessionDate))
    }
  }
  const safeScores = scores.filter((score) => !state.scores.some((existing) => existing.id === score.id))
  const warmupDatasetIds = [...new Set(session.warmupAnswers.map((answer) => answer.word.datasetId))]
  const warmupRecord: WarmupSessionRecord = { id: warmupSessionId, childId: session.childId, sessionId: session.id, sessionDate, completedAt: now.toISOString(), wordIds: session.warmupAnswers.map((answer) => answer.word.id), datasetIds: warmupDatasetIds, completeDatasetIds: [], complete }
  const rotationAnswers = session.warmupAnswers.filter((answer) => (session.warmupRandomRotationWordIds || []).includes(answer.word.id))
  const finalizedScores = finalizeMonthlyRotationScores(state.monthlyRotationScores, now)
  const monthlyRotationScores = updateMonthlyRotationScores(finalizedScores, session.childId, rotationMonth(now), rotationAnswers, now.toISOString())
  const materialized = materializeStateForCommit(state, session, now)
  const priorStates = state.childWordStates.filter((item) => item.childId !== session.childId)
  return { ...state, results: [...state.results, ...warmupResults, ...primaryResults], scores: [...state.scores, ...safeScores], warmupSessions: [...state.warmupSessions, warmupRecord], completedSessions: complete && !session.warmupOnly ? [...state.completedSessions, { id: session.id, childId: session.childId, sessionDate, primaryDatasetId: session.primaryDatasetId, primaryPhase: session.primaryPhase, complete: true }] : state.completedSessions, childWordStates: [...priorStates, ...materialized.states], monthlyRotationScores, rotationCycles: { ...state.rotationCycles, [session.childId]: materialized.rotationCycleId } }
}

function latestAnswerPerWord(answers: SessionAnswer[]) {
  const latest = new Map<string, SessionAnswer>()
  for (const answer of answers) latest.set(answer.word.id, answer)
  return [...latest.values()]
}

export function commitCompletedSession(state: AppState, session: PracticeSession, now = new Date()): AppState {
  const scoredPrimaryAnswers = latestAnswerPerWord(session.primaryAnswers)
  const primaryWordIds = new Set(session.primaryQueue.map((word) => word.id))
  const primaryComplete = session.primaryPhase === 'acquisition' && session.acquisition
    ? session.acquisition.complete
    : scoredPrimaryAnswers.length === primaryWordIds.size && [...primaryWordIds].every((wordId) => scoredPrimaryAnswers.some((answer) => answer.word.id === wordId))
  if (session.warmupAnswers.length !== session.warmupQueue.length || !primaryComplete) return state
  return commitSessionAttempts(state, session, now, true)
}

export function commitPartialSession(state: AppState, session: PracticeSession, now = new Date()): AppState {
  void session; void now
  return state
}

function makeScore(session: PracticeSession, dataset: Dataset, answers: SessionAnswer[], phase: LifecyclePhase, sessionDate: string, warmupSessionId?: string): DatasetScore {
  const correct = answers.filter((answer) => answer.correct).length
  return { id: `${session.id}-${phase}-${dataset.id}${warmupSessionId ? `-${warmupSessionId}` : ''}`, childId: session.childId, datasetId: dataset.id, datasetDateRange: dataset.dateRange, phase, sessionId: session.id, sessionDate, percent: Math.round((correct / answers.length) * 100), correct, wordCount: answers.length, warmupSessionId }
}
