import { grade2DeckProfile, isCanonicalDataset, validateAndClassifyPresentation, type ExistingDatasetReference, type ImportBatchOutcome, type ParserProfile, type PresentationLike } from './slidesImporter.ts'
import type { SupportedGrade } from './config.ts'
import { schoolYearToken } from './curriculum/identity.ts'
import { resumeAcquisition, revealAcquisition, startAcquisition } from './acquisition/engine.ts'
import { transitionAcquisition } from './acquisition/transition.ts'
import type {
  AcquisitionAssessment as EngineAcquisitionAssessment,
  AcquisitionPhase as EngineAcquisitionPhase,
  AcquisitionPromptKind as EngineAcquisitionPromptKind,
  AcquisitionStrategy,
  AcquisitionTargetSet,
  AcquisitionTimerConfig as EngineAcquisitionTimerConfig,
  AcquisitionTransition as EngineAcquisitionTransition,
  EngineAcquisitionFlow,
  EngineAcquisitionPrompt,
} from './acquisition/contracts.ts'
import { grade2AcquisitionStrategy } from './acquisition/strategies/grade2.ts'
import { requirePracticeProfileForGrade } from './practice/profiles/registry.ts'
import type { CurriculumStage, LifecycleSet } from './lifecycle/contracts.ts'
import { resolveLifecycle } from './lifecycle/registry.ts'
import { practicePhaseForStage } from './lifecycle/stageMapping.ts'
import type { Dataset, Word } from './domain/contracts.ts'
import { applyWarmupResponse, deriveWarmupWordStates, selectWarmupWords } from './warmup/engine.ts'
import type { ChildWordState, WarmupCategory, WarmupLifecycleSnapshot, WarmupPolicy, WarmupSelection } from './warmup/contracts.ts'

export type { Dataset, Word } from './domain/contracts.ts'
export type { ChildWordState, WarmupCategory, WarmupSelection } from './warmup/contracts.ts'

export type LifecyclePhase = 'acquisition' | 'test-review' | 'warmup'
export type PrimaryPhase = 'acquisition' | 'test-review'
export type DatasetLifecycle = PrimaryPhase | 'future' | 'mastered' | 'no-instruction'
export type RevealMethod = 'show_answer' | 'timer' | 'skip_timer'

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
  outcome?: 'completed' | 'skipped'
}

export type DistractorTargetObservation = {
  id: string
  childId: string
  sessionId: string
  datasetId: string
  wordId: string
  text: string
  poolType: 'established' | 'earned'
  correct: boolean
  revealMethod: RevealMethod
  reviewedAt: string
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
  acquisitionProgressions: AcquisitionProgressRecord[]
  distractorTargetObservations: DistractorTargetObservation[]
  datasetImportReferences?: Array<Exclude<ExistingDatasetReference, string>>
}

export type SessionAnswer = {
  word: Word
  correct: boolean
  revealMethod: RevealMethod
  acquisitionKind?: AcquisitionPromptKind
  promptId?: string
  countsTowardWeeklyScore?: boolean
  dtPoolType?: 'established' | 'earned'
}

export type AcquisitionPhase = EngineAcquisitionPhase
export type AcquisitionPromptKind = EngineAcquisitionPromptKind
export type AcquisitionTimerConfig = EngineAcquisitionTimerConfig
export type AcquisitionPrompt = EngineAcquisitionPrompt<Word>
export type AcquisitionFlow = EngineAcquisitionFlow<Word>
export type AcquisitionAssessment = EngineAcquisitionAssessment<Word, RevealMethod>
export type AcquisitionTransition = EngineAcquisitionTransition<Word, RevealMethod>

export type AcquisitionProgressRecord = {
  id: string
  childId: string
  datasetId: string
  grade: string
  flow: AcquisitionFlow
  updatedAt: string
}

export function shouldRecordAcquisitionAnswer(prompt: Pick<AcquisitionPrompt, 'kind'>) {
  return prompt.kind !== 'show-copy'
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
  currentRevealMethod?: RevealMethod
  warmupSkipped?: boolean
  testReviewSkipped?: boolean
  warmupOnly?: boolean
  cloudSessionId?: string
}

export function activePracticeWord(session: Pick<PracticeSession, 'segment' | 'acquisition' | 'queue' | 'index'>) {
  return session.segment === 'primary' && session.acquisition?.prompt ? session.acquisition.prompt.word : session.queue[session.index]
}

export const APP_STATE_KEY = 'weekly-dictation-state-v2'
export const LEGACY_ATTEMPTS_KEY = 'weekly-dictation-attempts'
export const AUDIO_PAUSE_MS = 1000
export const NORMAL_WORD_RATE = 0.25
export const NORMAL_SENTENCE_RATE = 0.55
export const GRADE_ORDER = ['Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5'] as const

export function acquisitionTimerConfigFor(grade: string) {
  const profile = requirePracticeProfileForGrade(grade)
  return { ...profile.acquisition.timers }
}

export const ESTABLISHED_DT_WORDS: Word[] = grade2AcquisitionStrategy.establishedDtTargets

export type AudioPart = { text: string; rate: number }

export function audioPartsForWord(word: Word, warmup = false): AudioPart[] {
  const multiplier = warmup ? 1.5 : 1
  const wordRate = Math.min(1, NORMAL_WORD_RATE * multiplier)
  const sentenceRate = Math.min(1, NORMAL_SENTENCE_RATE * multiplier)
  return [{ text: word.text, rate: wordRate }, ...(word.sentence.trim() ? [{ text: word.sentence, rate: sentenceRate }] : []), { text: word.text, rate: wordRate }, { text: word.text, rate: wordRate }]
}

export function timerSecondsFor(grade: string | null | undefined, segment: string | null | undefined, primaryPhase: string | null | undefined) {
  const profile = requirePracticeProfileForGrade(grade)
  const selectedSegment = segment === 'warmup' ? 'warmup' : 'primary'
  const selectedPhase = primaryPhase === 'test-review' ? 'test-review' : 'acquisition'
  const timer = profile.timers
  return selectedSegment === 'warmup' ? timer.warmup : selectedPhase === 'test-review' ? timer.testReview : profile.acquisition.timers.introductionHiddenTargetSeconds
}

export function createSessionId() {
  return `session-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
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

export type DatasetLifecycleResolution = {
  acquisition: Dataset | null
  testReview: Dataset | null
  mastered: Dataset[]
  masteredAtByDatasetId: Record<string, string>
  future: Dataset[]
  noInstruction: Dataset[]
  lifecycleByDatasetId: Record<string, DatasetLifecycle>
}

function uniqueCanonicalDatasets(datasets: Dataset[]) {
  const byId = new Map<string, Dataset>()
  for (const dataset of datasets) {
    if (isCanonicalDataset(dataset) && !byId.has(dataset.id)) byId.set(dataset.id, dataset)
  }
  return [...byId.values()].sort((left, right) => left.startDate.localeCompare(right.startDate) || left.endDate.localeCompare(right.endDate) || left.id.localeCompare(right.id))
}

function emptyDatasetLifecycleResolution(): DatasetLifecycleResolution {
  return { acquisition: null, testReview: null, mastered: [], masteredAtByDatasetId: {}, future: [], noInstruction: [], lifecycleByDatasetId: {} }
}

function lifecycleSetForDataset(dataset: Dataset): LifecycleSet {
  return {
    datasetId: dataset.id,
    grade: dataset.grade,
    schoolYearKey: schoolYearToken(dataset.schoolYear),
    activationDate: dataset.startDate,
    instructionalEndDate: dataset.endDate,
    kind: dataset.isWritingWorkshop ? 'no-instruction' : 'vocabulary',
  }
}

function compatibilityLifecycle(stage: CurriculumStage): DatasetLifecycle {
  const practicePhase = practicePhaseForStage(stage)
  if (practicePhase === 'acquisition' || practicePhase === 'test-review') return practicePhase
  if (stage.kind === 'mastery') return 'mastered'
  return stage.kind
}

export function requireDatasetLifecycle(resolution: DatasetLifecycleResolution, datasetId: string): DatasetLifecycle {
  const lifecycle = resolution.lifecycleByDatasetId[datasetId]
  if (!lifecycle) throw new Error(`Canonical dataset ${datasetId} has no lifecycle assignment.`)
  return lifecycle
}

// Grade 2 compatibility wrapper. Callers pass one grade and school-year
// collection; future grades receive their own registered lifecycle strategy.
export function resolveDatasetLifecycles(datasets: Dataset[], date = new Date()): DatasetLifecycleResolution {
  const canonical = uniqueCanonicalDatasets(datasets)
  if (canonical.length === 0) return emptyDatasetLifecycleResolution()
  const [{ grade, schoolYear }] = canonical
  const schoolYearKey = schoolYearToken(schoolYear)
  if (canonical.some((dataset) => dataset.grade !== grade || schoolYearToken(dataset.schoolYear) !== schoolYearKey)) {
    throw new Error('Lifecycle resolution requires one grade and school-year collection.')
  }
  const resolution = resolveLifecycle({
    scope: { grade, schoolYearKey, currentDateKey: localDateKey(date) },
    sets: canonical.map(lifecycleSetForDataset),
    progressionEvents: [],
  })
  const datasetsById = new Map(canonical.map((dataset) => [dataset.id, dataset]))
  const datasetsForIds = (ids: string[]) => ids.map((id) => datasetsById.get(id)).filter((dataset): dataset is Dataset => Boolean(dataset))
  const lifecycleByDatasetId = Object.fromEntries(Object.entries(resolution.assignmentByDatasetId).map(([datasetId, assignment]) => [datasetId, compatibilityLifecycle(assignment.stage)]))

  return {
    acquisition: resolution.acquisitionDatasetId ? datasetsById.get(resolution.acquisitionDatasetId) || null : null,
    testReview: datasetsById.get(resolution.testReviews.find((review) => review.cycle === 1)?.datasetId || '') || null,
    mastered: datasetsForIds(resolution.masteryDatasetIds),
    masteredAtByDatasetId: resolution.masteredAtByDatasetId,
    future: datasetsForIds(resolution.futureDatasetIds),
    noInstruction: datasetsForIds(resolution.noInstructionDatasetIds),
    lifecycleByDatasetId,
  }
}

export function datasetLifecycle(dataset: Dataset, datasets: Dataset[], date = new Date()): DatasetLifecycle {
  return requireDatasetLifecycle(resolveDatasetLifecycles(datasets, date), dataset.id)
}

export function getActiveLifecycleDatasets(datasets: Dataset[], date = new Date()) {
  const resolved = resolveDatasetLifecycles(datasets, date)
  return { acquisition: resolved.acquisition, testReview: resolved.testReview }
}

export function sortDatasetsNewestFirst(datasets: Dataset[]) {
  return [...datasets].sort((a, b) => b.startDate.localeCompare(a.startDate))
}

export function filterDatasetsForChild(datasets: Dataset[], grade: string, schoolYear: string) {
  let requestedYear: string
  try { requestedYear = schoolYearToken(schoolYear) } catch { return [] }
  return sortDatasetsNewestFirst(datasets.filter((dataset) => {
    if (!isCanonicalDataset(dataset) || dataset.grade !== grade) return false
    try { return schoolYearToken(dataset.schoolYear) === requestedYear } catch { return false }
  }))
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

function warmupPolicyForGrade(grade: string): WarmupPolicy {
  const lifecycle = requirePracticeProfileForGrade(grade).lifecycle
  return {
    warmupTargetSize: lifecycle.warmupTargetSize,
    recentReviewPromotionStreak: lifecycle.recentReviewPromotionStreak,
    erroredWordPromotionStreak: lifecycle.erroredWordPromotionStreak,
  }
}

function warmupLifecycleSnapshot(resolution: DatasetLifecycleResolution): WarmupLifecycleSnapshot {
  return {
    masteredDatasetIds: resolution.mastered.map((dataset) => dataset.id),
    masteredAtByDatasetId: resolution.masteredAtByDatasetId,
    lifecycleByDatasetId: resolution.lifecycleByDatasetId,
  }
}

export function deriveChildWordStates(options: { grade: string; schoolYear?: string; datasets: Dataset[]; results: WordResult[]; childId: string; today?: Date; existingStates?: ChildWordState[]; rotationCycleId?: number; lifecycleResolution?: DatasetLifecycleResolution }): ChildWordState[] {
  const policy = warmupPolicyForGrade(options.grade)
  const today = options.today || new Date()
  const cycle = options.rotationCycleId || 1
  const requestedSchoolYear = options.schoolYear ? schoolYearToken(options.schoolYear) : null
  const gradeDatasets = options.datasets.filter((dataset) => dataset.grade === options.grade && (!requestedSchoolYear || schoolYearToken(dataset.schoolYear) === requestedSchoolYear))
  const lifecycleResolution = options.lifecycleResolution || resolveDatasetLifecycles(gradeDatasets, today)
  return deriveWarmupWordStates({
    datasets: gradeDatasets,
    results: options.results,
    childId: options.childId,
    today,
    existingStates: options.existingStates,
    rotationCycleId: cycle,
    lifecycle: warmupLifecycleSnapshot(lifecycleResolution),
    policy,
  })
}

function shuffleSessionWords<T>(words: T[], random = Math.random) {
  const output = [...words]
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[output[index], output[swapIndex]] = [output[swapIndex], output[index]]
  }
  return output
}

export function buildWarmupSelection(options: { grade: string; datasets: Dataset[]; results: WordResult[]; childId: string; today?: Date; childWordStates?: ChildWordState[]; rotationCycleId?: number; targetSize?: number; random?: () => number; lifecycleResolution?: DatasetLifecycleResolution }): WarmupSelection {
  const policy = warmupPolicyForGrade(options.grade)
  const today = options.today || new Date()
  const gradeDatasets = options.datasets.filter((dataset) => dataset.grade === options.grade)
  const lifecycleResolution = options.lifecycleResolution || resolveDatasetLifecycles(gradeDatasets, today)
  return selectWarmupWords({
    datasets: gradeDatasets,
    results: options.results,
    childId: options.childId,
    today,
    existingStates: options.childWordStates,
    rotationCycleId: options.rotationCycleId || 1,
    lifecycle: warmupLifecycleSnapshot(lifecycleResolution),
    policy,
    targetSize: options.targetSize,
    random: options.random,
  })
}

export function createPracticeSessionForTarget(options: {
  id: string
  childId: string
  grade: string
  target: { dataset: Dataset; phase: PrimaryPhase } | null
  warmup: WarmupSelection
  startedAt: string
  cloudSessionId?: string
  acquisitionProgress?: AcquisitionFlow
  random?: () => number
}): PracticeSession {
  requirePracticeProfileForGrade(options.grade)
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
    queue: shuffleSessionWords(options.warmup.words, random),
    warmupQueue: options.warmup.words,
    primaryQueue: target?.dataset.words || [],
    index: 0,
    startedAt: options.startedAt,
    warmupAnswers: [],
    primaryAnswers: [],
    warmupCategoryByWordId,
    warmupRandomRotationWordIds: options.warmup.randomRotationWordIds,
    warmupRotationCycleId: options.warmup.rotationCycleId,
    acquisition: target?.phase === 'acquisition' ? resumeAcquisitionFlow(options.acquisitionProgress, target.dataset, options.grade, random) : undefined,
    warmupOnly: !target,
    cloudSessionId: options.cloudSessionId,
  }
}

function acquisitionTargetSetFor(dataset: Dataset): AcquisitionTargetSet<Word> {
  return { id: dataset.id, targets: dataset.words }
}

function acquisitionStrategyFor(grade: string): AcquisitionStrategy<Word> {
  return requirePracticeProfileForGrade(grade).acquisition
}

export function startAcquisitionFlow(dataset: Dataset, grade = dataset.grade, random = Math.random): AcquisitionFlow {
  const strategy = dataset.words.length === 0 ? grade2AcquisitionStrategy : acquisitionStrategyFor(grade)
  return startAcquisition<Word>(acquisitionTargetSetFor(dataset), strategy, random)
}

export function resumeAcquisitionFlow(saved: AcquisitionFlow | undefined, dataset: Dataset, grade = dataset.grade, random = Math.random) {
  if (!saved || saved.datasetId !== dataset.id) return startAcquisitionFlow(dataset, grade, random)
  if (!saved.complete && !saved.teachingComplete) return saved
  return resumeAcquisition<Word>(saved, acquisitionTargetSetFor(dataset), acquisitionStrategyFor(grade), random)
}

export function revealAcquisitionPrompt(flow: AcquisitionFlow) {
  return revealAcquisition(flow)
}

export function answerAcquisitionPrompt(flow: AcquisitionFlow, dataset: Dataset, grade: string, correct: boolean, random = Math.random): AcquisitionFlow {
  if (!flow.prompt || !flow.prompt.revealed) return flow
  return transitionAcquisitionPrompt(flow, dataset, grade, correct, 'timer', random).nextFlow
}

export function transitionAcquisitionPrompt(flow: AcquisitionFlow, dataset: Dataset, grade: string, correct: boolean, revealMethod: RevealMethod, random = Math.random): AcquisitionTransition {
  if (!flow.prompt || !flow.prompt.revealed) return { nextFlow: flow }
  return transitionAcquisition<Word, RevealMethod>(flow, acquisitionTargetSetFor(dataset), acquisitionStrategyFor(grade), { correct, revealMethod }, random)
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

function localDatasetReferences(state: AppState): ExistingDatasetReference[] {
  const storedById = new Map((state.datasetImportReferences || []).map((reference) => [reference.datasetId, reference]))
  return state.datasets.map((dataset) => storedById.get(dataset.id) || dataset.id)
}

function updatedLocalDatasetReferences(state: AppState, batch: ImportBatchOutcome, datasets: Dataset[]) {
  const references = new Map((state.datasetImportReferences || []).map((reference) => [reference.datasetId, reference]))
  for (const outcome of batch.outcomes) {
    const shouldStore = outcome.status === 'imported' || outcome.status === 'writing-workshop' || (outcome.status === 'confirmation' && outcome.refreshExistingMetadata)
    if (!shouldStore || !outcome.datasetId || !outcome.contentFingerprint || !outcome.candidateStatus || !outcome.instructionalRole) continue
    references.set(outcome.datasetId, {
      datasetId: outcome.datasetId,
      contentFingerprint: outcome.contentFingerprint,
      candidateStatus: outcome.candidateStatus,
      instructionalRole: outcome.instructionalRole,
    })
  }
  const retainedIds = new Set(datasets.map((dataset) => dataset.id))
  return [...references.values()].filter((reference) => retainedIds.has(reference.datasetId))
}

export function hydrateLocalState(state: AppState, presentation: PresentationLike, profile: ParserProfile = grade2DeckProfile): LocalHydrationResult {
  const batch = validateAndClassifyPresentation(presentation, localDatasetReferences(state), profile)
  const datasets = canonicalDatasets([...batch.datasets, ...state.datasets])
  return { state: { ...state, datasets, datasetImportReferences: updatedLocalDatasetReferences(state, batch, datasets) }, batch }
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
  return { version: 2, datasets: canonicalDatasets(importedDatasets), results: [], scores: [], warmupSessions: [], completedSessions: [], legacyRecords, childWordStates: [], monthlyRotationScores: [], rotationCycles: {}, acquisitionProgressions: [], distractorTargetObservations: [] }
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
  const datasetReferencesValid = !('datasetImportReferences' in value) || (Array.isArray(value.datasetImportReferences) && value.datasetImportReferences.every((reference) => isRecord(reference) && typeof reference.datasetId === 'string' && (!('contentFingerprint' in reference) || typeof reference.contentFingerprint === 'string') && (!('candidateStatus' in reference) || ['valid', 'no-instruction', 'malformed'].includes(String(reference.candidateStatus))) && (!('instructionalRole' in reference) || ['weekly-acquisition', 'current-confirmation', 'next-week-preview', 'unassigned'].includes(String(reference.instructionalRole)))))
  const progressionsValid = !('acquisitionProgressions' in value) || (Array.isArray(value.acquisitionProgressions) && value.acquisitionProgressions.every((progression) => isRecord(progression) && typeof progression.id === 'string' && typeof progression.childId === 'string' && typeof progression.datasetId === 'string' && typeof progression.grade === 'string' && isRecord(progression.flow) && typeof progression.updatedAt === 'string'))
  const dtObservationsValid = !('distractorTargetObservations' in value) || (Array.isArray(value.distractorTargetObservations) && value.distractorTargetObservations.every((observation) => isRecord(observation) && typeof observation.id === 'string' && typeof observation.childId === 'string' && typeof observation.sessionId === 'string' && typeof observation.datasetId === 'string' && typeof observation.wordId === 'string' && typeof observation.text === 'string' && (observation.poolType === 'established' || observation.poolType === 'earned') && typeof observation.correct === 'boolean' && typeof observation.reviewedAt === 'string'))
  return datasetsValid && resultsValid && scoresValid && warmupsValid && sessionsValid && legacyValid && statesValid && monthlyValid && cyclesValid && datasetReferencesValid && progressionsValid && dtObservationsValid
}

export function loadState(rawState: string | null, legacyRaw?: string | null, importedDatasets: Dataset[] = []): AppState {
  try {
    const parsed: unknown = rawState ? JSON.parse(rawState) : null
    if (isAppState(parsed)) {
      const normalized = { ...parsed, datasets: canonicalDatasets([...importedDatasets, ...parsed.datasets]), childWordStates: Array.isArray(parsed.childWordStates) ? parsed.childWordStates : [], monthlyRotationScores: Array.isArray(parsed.monthlyRotationScores) ? parsed.monthlyRotationScores : [], rotationCycles: isRecord(parsed.rotationCycles) ? parsed.rotationCycles as Record<string, number> : {}, acquisitionProgressions: Array.isArray(parsed.acquisitionProgressions) ? parsed.acquisitionProgressions : [], distractorTargetObservations: Array.isArray(parsed.distractorTargetObservations) ? parsed.distractorTargetObservations : [] }
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

function datasetForSession(state: AppState, session: PracticeSession) {
  const datasetIds = [session.primaryDatasetId, ...session.primaryQueue.map((word) => word.datasetId), ...session.warmupQueue.map((word) => word.datasetId)]
  return datasetIds.map((datasetId) => state.datasets.find((dataset) => dataset.id === datasetId)).find((dataset): dataset is Dataset => Boolean(dataset))
}

function materializeStateForCommit(state: AppState, session: PracticeSession, now: Date) {
  const policy = warmupPolicyForGrade(session.grade)
  const rotationCycleId = session.warmupRotationCycleId || state.rotationCycles[session.childId] || 1
  const schoolYear = datasetForSession(state, session)?.schoolYear
  let states = deriveChildWordStates({ grade: session.grade, schoolYear, datasets: state.datasets, results: state.results, childId: session.childId, existingStates: state.childWordStates, today: now, rotationCycleId })
  for (const answer of [...session.warmupAnswers, ...session.primaryAnswers.filter((item) => item.countsTowardWeeklyScore !== false)]) {
    const current = states.find((item) => item.wordId === answer.word.id)
    if (!current) continue
    const next = applyWarmupResponse(current, answer.correct, now.toISOString(), rotationCycleId, policy)
    states = states.map((item) => item.id === next.id ? next : item)
  }
  return { states, rotationCycleId }
}

function acquisitionProgressId(childId: string, datasetId: string) {
  return `${childId}::${datasetId}::tier-1-writing`
}

export function acquisitionProgressFor(state: AppState, childId: string, datasetId: string) {
  return state.acquisitionProgressions.find((progression) => progression.childId === childId && progression.datasetId === datasetId) || null
}

export function checkpointAcquisitionSession(state: AppState, session: PracticeSession, answer?: SessionAnswer, now = new Date()): AppState {
  if (!session.acquisition || session.primaryPhase !== 'acquisition') return state
  const progression: AcquisitionProgressRecord = {
    id: acquisitionProgressId(session.childId, session.primaryDatasetId),
    childId: session.childId,
    datasetId: session.primaryDatasetId,
    grade: session.grade,
    flow: session.acquisition.prompt ? { ...session.acquisition, prompt: { ...session.acquisition.prompt, revealed: false } } : session.acquisition,
    updatedAt: now.toISOString(),
  }
  const acquisitionProgressions = state.acquisitionProgressions.some((item) => item.id === progression.id)
    ? state.acquisitionProgressions.map((item) => item.id === progression.id ? progression : item)
    : [...state.acquisitionProgressions, progression]
  let results = state.results
  if (answer?.promptId && answer.countsTowardWeeklyScore && !results.some((result) => result.id === `${session.id}-acquisition-${answer.promptId}`)) {
    const dataset = state.datasets.find((item) => item.id === session.primaryDatasetId)
    results = [...results, {
      id: `${session.id}-acquisition-${answer.promptId}`,
      childId: session.childId,
      datasetId: session.primaryDatasetId,
      datasetDateRange: dataset?.dateRange || 'Unknown date range',
      wordId: answer.word.id,
      grade: session.grade,
      phase: 'acquisition',
      sessionId: session.id,
      sessionDate: localDateKey(now),
      completedAt: now.toISOString(),
      correct: answer.correct,
      revealMethod: answer.revealMethod,
      scored: true,
      completeSourceDatasetReviewed: Boolean(session.acquisition.complete),
    }]
  }
  let distractorTargetObservations = state.distractorTargetObservations
  const collectDtObservations = requirePracticeProfileForGrade(session.grade).acquisition.dtObservationMode === 'collect'
  if (collectDtObservations && answer?.promptId && answer.dtPoolType && !distractorTargetObservations.some((observation) => observation.id === `${session.id}-dt-${answer.promptId}`)) {
    distractorTargetObservations = [...distractorTargetObservations, {
      id: `${session.id}-dt-${answer.promptId}`,
      childId: session.childId,
      sessionId: session.id,
      datasetId: session.primaryDatasetId,
      wordId: answer.word.id,
      text: answer.word.text,
      poolType: answer.dtPoolType,
      correct: answer.correct,
      revealMethod: answer.revealMethod,
      reviewedAt: now.toISOString(),
    }]
  }
  return { ...state, acquisitionProgressions, results, distractorTargetObservations }
}

function commitSessionAttempts(state: AppState, session: PracticeSession, now: Date, complete: boolean): AppState {
  const warmupSessionId = `${session.id}-warmup`
  if (state.completedSessions.some((item) => item.id === session.id) || state.warmupSessions.some((item) => item.id === warmupSessionId)) return state
  const sessionDate = localDateKey(now)
  const warmupResults: WordResult[] = session.warmupAnswers.map((answer, index) => {
    const dataset = state.datasets.find((item) => item.id === answer.word.datasetId)
    return { id: `${session.id}-warmup-${answer.word.id}-${index}`, childId: session.childId, datasetId: answer.word.datasetId, datasetDateRange: dataset?.dateRange || 'Unknown date range', wordId: answer.word.id, grade: session.grade, phase: 'warmup', sessionId: session.id, sessionDate, completedAt: now.toISOString(), correct: answer.correct, revealMethod: 'timer', scored: true, completeSourceDatasetReviewed: false, warmupSessionId }
  })
  const scoredPrimaryAnswers = session.primaryPhase === 'acquisition' ? session.primaryAnswers.filter((answer) => answer.countsTowardWeeklyScore !== false) : session.primaryAnswers
  const primaryResults: WordResult[] = complete ? scoredPrimaryAnswers.map((answer, index) => {
    const dataset = state.datasets.find((item) => item.id === answer.word.datasetId)
    return { id: `${session.id}-primary-${answer.word.id}-${index}`, childId: session.childId, datasetId: answer.word.datasetId, datasetDateRange: dataset?.dateRange || 'Unknown date range', wordId: answer.word.id, grade: session.grade, phase: session.primaryPhase, sessionId: session.id, sessionDate, completedAt: now.toISOString(), correct: answer.correct, revealMethod: 'timer', scored: true, completeSourceDatasetReviewed: true }
  }) : []
  const primaryDataset = state.datasets.find((dataset) => dataset.id === session.primaryDatasetId)
  const scores: DatasetScore[] = []
  if (complete && primaryDataset && primaryDataset.words.length > 0) {
    if (session.primaryPhase === 'acquisition' && session.acquisition?.complete && scoredPrimaryAnswers.length > 0) {
      scores.push(makeScore(session, primaryDataset, scoredPrimaryAnswers, session.primaryPhase, sessionDate))
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
  const sessionSchoolYear = datasetForSession(state, session)?.schoolYear
  const datasetScopeById = new Map(state.datasets.map((dataset) => [dataset.id, { grade: dataset.grade, schoolYear: dataset.schoolYear }]))
  const priorStates = state.childWordStates.filter((item) => {
    if (item.childId !== session.childId) return true
    const datasetScope = datasetScopeById.get(item.datasetId)
    return !datasetScope || datasetScope.grade !== session.grade || Boolean(sessionSchoolYear && datasetScope.schoolYear !== sessionSchoolYear)
  })
  return { ...state, results: [...state.results, ...primaryResults.filter((result) => !state.results.some((existing) => existing.id === result.id)), ...warmupResults], scores: [...state.scores, ...safeScores], warmupSessions: session.warmupSkipped || session.warmupAnswers.length === 0 ? state.warmupSessions : [...state.warmupSessions, warmupRecord], completedSessions: complete && !session.warmupOnly ? [...state.completedSessions, { id: session.id, childId: session.childId, sessionDate, primaryDatasetId: session.primaryDatasetId, primaryPhase: session.primaryPhase, complete: true, outcome: session.testReviewSkipped ? 'skipped' : 'completed' }] : state.completedSessions, childWordStates: [...priorStates, ...materialized.states], monthlyRotationScores, rotationCycles: { ...state.rotationCycles, [session.childId]: materialized.rotationCycleId } }
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
  if ((!session.warmupSkipped && session.warmupAnswers.length !== session.warmupQueue.length) || !primaryComplete) return state
  return commitSessionAttempts(state, session, now, true)
}

export function commitPartialSession(state: AppState, session: PracticeSession, now = new Date()): AppState {
  if (session.primaryPhase !== 'acquisition' || !session.acquisition) return state
  let next = checkpointAcquisitionSession(state, session, undefined, now)
  const targetAnswers = session.primaryAnswers.filter((answer) => answer.countsTowardWeeklyScore)
  if (targetAnswers.length > 0) {
    const dataset = next.datasets.find((item) => item.id === session.primaryDatasetId)
    if (dataset && !next.scores.some((score) => score.id === `${session.id}-acquisition-${dataset.id}`)) {
      next = { ...next, scores: [...next.scores, makeScore(session, dataset, targetAnswers, 'acquisition', localDateKey(now))] }
    }
  }
  if (!session.warmupSkipped && session.warmupAnswers.length > 0 && !next.warmupSessions.some((record) => record.sessionId === session.id)) {
    const complete = session.warmupAnswers.length === session.warmupQueue.length
    const warmupSessionId = `${session.id}-warmup`
    const warmupResults: WordResult[] = session.warmupAnswers.map((answer, index) => {
      const dataset = next.datasets.find((item) => item.id === answer.word.datasetId)
      return { id: `${session.id}-warmup-${answer.word.id}-${index}`, childId: session.childId, datasetId: answer.word.datasetId, datasetDateRange: dataset?.dateRange || 'Unknown date range', wordId: answer.word.id, grade: session.grade, phase: 'warmup', sessionId: session.id, sessionDate: localDateKey(now), completedAt: now.toISOString(), correct: answer.correct, revealMethod: answer.revealMethod, scored: true, completeSourceDatasetReviewed: false, warmupSessionId }
    })
    next = { ...next, results: [...next.results, ...warmupResults.filter((result) => !next.results.some((existing) => existing.id === result.id))], warmupSessions: [...next.warmupSessions, { id: warmupSessionId, childId: session.childId, sessionId: session.id, sessionDate: localDateKey(now), completedAt: now.toISOString(), wordIds: session.warmupAnswers.map((answer) => answer.word.id), datasetIds: [...new Set(session.warmupAnswers.map((answer) => answer.word.datasetId))], completeDatasetIds: [], complete }] }
    const materialized = materializeStateForCommit(next, session, now)
    const datasetGradeById = new Map(next.datasets.map((dataset) => [dataset.id, dataset.grade]))
    const priorStates = next.childWordStates.filter((item) => {
      if (item.childId !== session.childId) return true
      const datasetGrade = datasetGradeById.get(item.datasetId)
      return !datasetGrade || datasetGrade !== session.grade
    })
    const rotationAnswers = session.warmupAnswers.filter((answer) => session.warmupRandomRotationWordIds.includes(answer.word.id))
    const monthlyRotationScores = updateMonthlyRotationScores(finalizeMonthlyRotationScores(next.monthlyRotationScores, now), session.childId, rotationMonth(now), rotationAnswers, now.toISOString())
    next = { ...next, childWordStates: [...priorStates, ...materialized.states], monthlyRotationScores, rotationCycles: { ...next.rotationCycles, [session.childId]: materialized.rotationCycleId } }
  }
  if (!next.completedSessions.some((record) => record.id === session.id)) {
    next = { ...next, completedSessions: [...next.completedSessions, { id: session.id, childId: session.childId, sessionDate: localDateKey(now), primaryDatasetId: session.primaryDatasetId, primaryPhase: 'acquisition', complete: true, outcome: 'completed' }] }
  }
  return next
}

export function commitSkippedTestReview(state: AppState, session: PracticeSession, now = new Date()) {
  if (session.primaryPhase !== 'test-review') return state
  return commitSessionAttempts(state, { ...session, primaryAnswers: [], testReviewSkipped: true }, now, true)
}

function makeScore(session: PracticeSession, dataset: Dataset, answers: SessionAnswer[], phase: LifecyclePhase, sessionDate: string, warmupSessionId?: string): DatasetScore {
  const correct = answers.filter((answer) => answer.correct).length
  return { id: `${session.id}-${phase}-${dataset.id}${warmupSessionId ? `-${warmupSessionId}` : ''}`, childId: session.childId, datasetId: dataset.id, datasetDateRange: dataset.dateRange, phase, sessionId: session.id, sessionDate, percent: Math.round((correct / answers.length) * 100), correct, wordCount: answers.length, warmupSessionId }
}
