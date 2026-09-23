export type LifecyclePhase = 'acquisition' | 'test-review' | 'warmup'
export type PrimaryPhase = 'acquisition' | 'test-review'
export type DatasetLifecycle = LifecyclePhase | 'future' | 'archived'
export type RevealMethod = 'show_answer' | 'timer'

export type Word = {
  id: string
  text: string
  sentence: string
  datasetId: string
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
}

export type SessionAnswer = {
  word: Word
  correct: boolean
  revealMethod: RevealMethod
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
}

export type WarmupSelection = {
  words: Word[]
  categoryAWordIds: string[]
  categoryBWordIds: string[]
  categoryCWordIds: string[]
  additionalCount: number
  roundingRule: 'ceil'
}

export const APP_STATE_KEY = 'weekly-dictation-state-v2'
export const LEGACY_ATTEMPTS_KEY = 'weekly-dictation-attempts'
export const WARMUP_ADDITIONAL_FRACTION = 0.25
export const AUDIO_PAUSE_MS = 1000
export const NORMAL_WORD_RATE = 0.25
export const NORMAL_SENTENCE_RATE = 0.55

export type AudioPart = { text: string; rate: number }

export function audioPartsForWord(word: Word, warmup = false): AudioPart[] {
  const multiplier = warmup ? 1.5 : 1
  const wordRate = Math.min(1, NORMAL_WORD_RATE * multiplier)
  const sentenceRate = Math.min(1, NORMAL_SENTENCE_RATE * multiplier)
  return [{ text: word.text, rate: wordRate }, { text: word.sentence, rate: sentenceRate }, { text: word.text, rate: wordRate }, { text: word.text, rate: wordRate }]
}

export function timerSecondsFor(segment: 'warmup' | 'primary', primaryPhase: PrimaryPhase) {
  return segment === 'warmup' ? 5 : primaryPhase === 'test-review' ? 10 : 20
}

export function createSessionId() {
  return `session-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

export const sampleDatasets: Dataset[] = [
  {
    id: '2026-08-10__2026-08-14', dateRange: '8/10–8/14', startDate: '2026-08-10', endDate: '2026-08-14', grade: 'Kindergarten', schoolYear: '2026–27', description: 'Foundations from this date range',
    words: [
      { id: '2026-08-10__2026-08-14-1', text: '太阳', sentence: '太阳从东方升起。', datasetId: '2026-08-10__2026-08-14' },
      { id: '2026-08-10__2026-08-14-2', text: '花', sentence: '花园里有很多花。', datasetId: '2026-08-10__2026-08-14' },
      { id: '2026-08-10__2026-08-14-3', text: '水', sentence: '请给我一杯水。', datasetId: '2026-08-10__2026-08-14' },
      { id: '2026-08-10__2026-08-14-4', text: '家', sentence: '我喜欢我的家。', datasetId: '2026-08-10__2026-08-14' },
      { id: '2026-08-10__2026-08-14-5', text: '书', sentence: '这本书很有趣。', datasetId: '2026-08-10__2026-08-14' },
    ],
  },
  {
    id: '2026-08-17__2026-08-21', dateRange: '8/17–8/21', startDate: '2026-08-17', endDate: '2026-08-21', grade: 'Kindergarten', schoolYear: '2026–27', description: 'Foundations from this date range',
    words: [
      { id: '2026-08-17__2026-08-21-1', text: '苹果', sentence: '我喜欢吃苹果。', datasetId: '2026-08-17__2026-08-21' },
      { id: '2026-08-17__2026-08-21-2', text: '香蕉', sentence: '香蕉是黄色的。', datasetId: '2026-08-17__2026-08-21' },
      { id: '2026-08-17__2026-08-21-3', text: '牛奶', sentence: '早上我喝牛奶。', datasetId: '2026-08-17__2026-08-21' },
      { id: '2026-08-17__2026-08-21-4', text: '面包', sentence: '面包在桌子上。', datasetId: '2026-08-17__2026-08-21' },
    ],
  },
  {
    id: '2026-08-24__2026-08-28', dateRange: '8/24–8/28', startDate: '2026-08-24', endDate: '2026-08-28', grade: 'Kindergarten', schoolYear: '2026–27', description: 'Foundations from this date range',
    words: [
      { id: '2026-08-24__2026-08-28-1', text: '红色', sentence: '我喜欢红色的花。', datasetId: '2026-08-24__2026-08-28' },
      { id: '2026-08-24__2026-08-28-2', text: '蓝色', sentence: '天空是蓝色的。', datasetId: '2026-08-24__2026-08-28' },
      { id: '2026-08-24__2026-08-28-3', text: '黄色', sentence: '小鸭子是黄色的。', datasetId: '2026-08-24__2026-08-28' },
      { id: '2026-08-24__2026-08-28-4', text: '绿色', sentence: '树叶是绿色的。', datasetId: '2026-08-24__2026-08-28' },
      { id: '2026-08-24__2026-08-28-5', text: '大', sentence: '这只狗很大。', datasetId: '2026-08-24__2026-08-28' },
      { id: '2026-08-24__2026-08-28-6', text: '小', sentence: '这只猫很小。', datasetId: '2026-08-24__2026-08-28' },
      { id: '2026-08-24__2026-08-28-7', text: '新', sentence: '这是我的新书。', datasetId: '2026-08-24__2026-08-28' },
    ],
  },
  {
    id: '2026-08-31__2026-09-04', dateRange: '8/31–9/4', startDate: '2026-08-31', endDate: '2026-09-04', grade: 'Kindergarten', schoolYear: '2026–27', description: 'Foundations from this date range',
    words: [
      { id: '2026-08-31__2026-09-04-1', text: '月亮', sentence: '晚上可以看见月亮。', datasetId: '2026-08-31__2026-09-04' },
      { id: '2026-08-31__2026-09-04-2', text: '小鸟', sentence: '小鸟在树上唱歌。', datasetId: '2026-08-31__2026-09-04' },
      { id: '2026-08-31__2026-09-04-3', text: '回家', sentence: '放学以后我们回家。', datasetId: '2026-08-31__2026-09-04' },
      { id: '2026-08-31__2026-09-04-4', text: '天气', sentence: '今天的天气很好。', datasetId: '2026-08-31__2026-09-04' },
    ],
  },
  {
    id: '2026-09-07__2026-09-11', dateRange: '9/7–9/11', startDate: '2026-09-07', endDate: '2026-09-11', grade: 'Kindergarten', schoolYear: '2026–27', description: 'Review words from this date range',
    words: [
      { id: '2026-09-07__2026-09-11-1', text: '星期五', sentence: '星期五我们回家。', datasetId: '2026-09-07__2026-09-11' },
      { id: '2026-09-07__2026-09-11-2', text: '同学', sentence: '我的同学很友好。', datasetId: '2026-09-07__2026-09-11' },
      { id: '2026-09-07__2026-09-11-3', text: '看见', sentence: '我看见一只小猫。', datasetId: '2026-09-07__2026-09-11' },
      { id: '2026-09-07__2026-09-11-4', text: '喜欢', sentence: '我喜欢吃苹果。', datasetId: '2026-09-07__2026-09-11' },
      { id: '2026-09-07__2026-09-11-5', text: '什么', sentence: '你叫什么名字？', datasetId: '2026-09-07__2026-09-11' },
      { id: '2026-09-07__2026-09-11-6', text: '高兴', sentence: '我今天很高兴。', datasetId: '2026-09-07__2026-09-11' },
    ],
  },
  {
    id: '2026-09-14__2026-09-18', dateRange: '9/14–9/18', startDate: '2026-09-14', endDate: '2026-09-18', grade: 'Kindergarten', schoolYear: '2026–27', description: 'Words learned during this date range',
    words: [
      { id: '2026-09-14__2026-09-18-1', text: '星期一', sentence: '今天是星期一。', datasetId: '2026-09-14__2026-09-18' },
      { id: '2026-09-14__2026-09-18-2', text: '学校', sentence: '我们每天去学校。', datasetId: '2026-09-14__2026-09-18' },
      { id: '2026-09-14__2026-09-18-3', text: '老师', sentence: '老师在教室里。', datasetId: '2026-09-14__2026-09-18' },
      { id: '2026-09-14__2026-09-18-4', text: '朋友', sentence: '我有一个好朋友。', datasetId: '2026-09-14__2026-09-18' },
      { id: '2026-09-14__2026-09-18-5', text: '早上', sentence: '早上好！', datasetId: '2026-09-14__2026-09-18' },
      { id: '2026-09-14__2026-09-18-6', text: '一起', sentence: '我们一起学习。', datasetId: '2026-09-14__2026-09-18' },
    ],
  },
]

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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

export function getPrimaryDataset(datasets: Dataset[], date = new Date()) {
  const candidates = datasets
    .map((dataset) => ({ dataset, phase: datasetLifecycle(dataset, date) }))
    .filter((item): item is { dataset: Dataset; phase: 'acquisition' | 'test-review' } => item.phase === 'acquisition' || item.phase === 'test-review')
    .sort((a, b) => b.dataset.startDate.localeCompare(a.dataset.startDate))
  return candidates[0] || null
}

export function sortDatasetsNewestFirst(datasets: Dataset[]) {
  return [...datasets].sort((a, b) => b.startDate.localeCompare(a.startDate))
}

function resultDate(result: WordResult) {
  return parseDateKey(result.sessionDate)
}

function uniqueWords(words: Word[]) {
  const seen = new Set<string>()
  return words.filter((word) => {
    if (seen.has(word.id)) return false
    seen.add(word.id)
    return true
  })
}

export function buildWarmupSelection(options: { datasets: Dataset[]; results: WordResult[]; warmupSessions: WarmupSessionRecord[]; childId: string; today?: Date }): WarmupSelection {
  const today = options.today || new Date()
  const cutoff = addDays(today, -6)
  const datasetsById = new Map(options.datasets.map((dataset) => [dataset.id, dataset]))
  const previousAcquisition = options.datasets.filter((dataset) => datasetLifecycle(dataset, today) === 'test-review')
  const categoryA = uniqueWords(previousAcquisition.flatMap((dataset) => dataset.words))
  const recentErrors = options.results.filter((result) => result.childId === options.childId && !result.correct && resultDate(result) >= cutoff && resultDate(result) <= today)
  const errorDatasetIds = new Set(recentErrors.map((result) => result.datasetId))
  const categoryB = uniqueWords([...errorDatasetIds].flatMap((id) => datasetsById.get(id)?.words || []))
  const base = uniqueWords([...categoryA, ...categoryB])
  const baseIds = new Set(base.map((word) => word.id))
  const recentWarmups = options.warmupSessions.filter((session) => session.childId === options.childId && session.complete).sort((a, b) => b.sessionDate.localeCompare(a.sessionDate)).slice(0, 3)
  const recentWarmupIds = new Set(recentWarmups.map((session) => session.id))
  const warmupErrors = new Set(options.results.filter((result) => result.childId === options.childId && result.phase === 'warmup' && !result.correct && result.warmupSessionId && recentWarmupIds.has(result.warmupSessionId)).map((result) => result.wordId))
  const candidates = options.datasets.flatMap((dataset) => dataset.words).filter((word) => !baseIds.has(word.id) && !warmupErrors.has(word.id)).sort((a, b) => {
    const aDataset = datasetsById.get(a.datasetId)
    const bDataset = datasetsById.get(b.datasetId)
    return (bDataset?.startDate || '').localeCompare(aDataset?.startDate || '') || a.id.localeCompare(b.id)
  })
  const additionalCount = base.length > 0 ? Math.ceil(base.length * WARMUP_ADDITIONAL_FRACTION) : candidates.length > 0 ? 1 : 0
  const categoryC = candidates.slice(0, additionalCount)
  return {
    words: uniqueWords([...base, ...categoryC]),
    categoryAWordIds: categoryA.map((word) => word.id),
    categoryBWordIds: categoryB.map((word) => word.id),
    categoryCWordIds: categoryC.map((word) => word.id),
    additionalCount,
    roundingRule: 'ceil',
  }
}

function normalizeLegacyAttempt(value: unknown): LegacyRecord | null {
  if (!isRecord(value)) return null
  if (typeof value.childId !== 'string' || (value.weeklySetId !== 'current' && value.weeklySetId !== 'previous') || typeof value.termId !== 'string' || typeof value.sessionId !== 'string' || typeof value.completedAt !== 'string' || typeof value.correct !== 'boolean') return null
  return { id: `legacy-${value.sessionId}-${value.termId}`, childId: value.childId, legacySet: value.weeklySetId, termId: value.termId, sessionId: value.sessionId, completedAt: value.completedAt, correct: value.correct, revealMethod: value.revealMethod === 'timer' ? 'timer' : 'show_answer', note: 'legacy-date-range-unknown' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function createInitialState(legacyRaw?: string | null): AppState {
  let legacyRecords: LegacyRecord[] = []
  try {
    const parsed: unknown = legacyRaw ? JSON.parse(legacyRaw) : []
    legacyRecords = Array.isArray(parsed) ? parsed.map(normalizeLegacyAttempt).filter((item): item is LegacyRecord => Boolean(item)) : []
  } catch {
    legacyRecords = []
  }
  return { version: 2, datasets: sampleDatasets, results: [], scores: [], warmupSessions: [], completedSessions: [], legacyRecords }
}

export function isAppState(value: unknown): value is AppState {
  if (!isRecord(value) || value.version !== 2 || !Array.isArray(value.datasets) || !Array.isArray(value.results) || !Array.isArray(value.scores) || !Array.isArray(value.warmupSessions) || !Array.isArray(value.completedSessions) || !Array.isArray(value.legacyRecords)) return false
  const datasetsValid = value.datasets.every((dataset) => isRecord(dataset) && typeof dataset.id === 'string' && typeof dataset.dateRange === 'string' && typeof dataset.startDate === 'string' && typeof dataset.endDate === 'string' && typeof dataset.grade === 'string' && Array.isArray(dataset.words) && dataset.words.every((word) => isRecord(word) && typeof word.id === 'string' && typeof word.text === 'string' && typeof word.sentence === 'string' && word.datasetId === dataset.id))
  const resultsValid = value.results.every((result) => isRecord(result) && typeof result.id === 'string' && typeof result.childId === 'string' && typeof result.datasetId === 'string' && typeof result.wordId === 'string' && typeof result.sessionId === 'string' && typeof result.sessionDate === 'string' && (result.phase === 'warmup' || result.phase === 'acquisition' || result.phase === 'test-review') && typeof result.correct === 'boolean' && typeof result.completeSourceDatasetReviewed === 'boolean')
  const scoresValid = value.scores.every((score) => isRecord(score) && typeof score.id === 'string' && typeof score.childId === 'string' && typeof score.datasetId === 'string' && typeof score.sessionId === 'string' && typeof score.sessionDate === 'string' && typeof score.percent === 'number')
  const warmupsValid = value.warmupSessions.every((session) => isRecord(session) && typeof session.id === 'string' && typeof session.childId === 'string' && typeof session.sessionDate === 'string' && Array.isArray(session.wordIds) && Array.isArray(session.datasetIds) && Array.isArray(session.completeDatasetIds) && session.complete === true)
  const sessionsValid = value.completedSessions.every((session) => isRecord(session) && typeof session.id === 'string' && typeof session.childId === 'string' && typeof session.sessionDate === 'string' && typeof session.primaryDatasetId === 'string' && session.complete === true)
  const legacyValid = value.legacyRecords.every((record) => isRecord(record) && typeof record.id === 'string' && typeof record.childId === 'string' && typeof record.legacySet === 'string' && record.note === 'legacy-date-range-unknown')
  return datasetsValid && resultsValid && scoresValid && warmupsValid && sessionsValid && legacyValid
}

export function loadState(rawState: string | null, legacyRaw?: string | null): AppState {
  try {
    const parsed: unknown = rawState ? JSON.parse(rawState) : null
    if (isAppState(parsed)) {
      const knownIds = new Set(parsed.datasets.map((dataset) => dataset.id))
      return { ...parsed, datasets: [...parsed.datasets, ...sampleDatasets.filter((dataset) => !knownIds.has(dataset.id))] }
    }
  } catch {
    // Fall through to a safe sample-data state.
  }
  return createInitialState(legacyRaw)
}

export function latestScore(scores: DatasetScore[], childId: string, datasetId: string) {
  return scores.filter((score) => score.childId === childId && score.datasetId === datasetId).sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))[0] || null
}

export function commitCompletedSession(state: AppState, session: PracticeSession, now = new Date()): AppState {
  if (state.completedSessions.some((item) => item.id === session.id)) return state
  if (session.warmupAnswers.length !== session.warmupQueue.length || session.primaryAnswers.length !== session.primaryQueue.length) return state
  const sessionDate = localDateKey(now)
  const warmupSessionId = `${session.id}-warmup`
  const warmupCompleteDatasetIds = new Set(session.warmupQueue.map((word) => word.datasetId).filter((datasetId) => {
    const dataset = state.datasets.find((item) => item.id === datasetId)
    const answers = session.warmupAnswers.filter((answer) => answer.word.datasetId === datasetId)
    return Boolean(dataset && answers.length === dataset.words.length && new Set(answers.map((answer) => answer.word.id)).size === dataset.words.length)
  }))
  const warmupResults: WordResult[] = session.warmupAnswers.map((answer, index) => {
    const dataset = state.datasets.find((item) => item.id === answer.word.datasetId)
    return { id: `${session.id}-warmup-${answer.word.id}-${index}`, childId: session.childId, datasetId: answer.word.datasetId, datasetDateRange: dataset?.dateRange || 'Unknown date range', wordId: answer.word.id, grade: session.grade, phase: 'warmup', sessionId: session.id, sessionDate, completedAt: now.toISOString(), correct: answer.correct, revealMethod: 'timer', scored: true, completeSourceDatasetReviewed: warmupCompleteDatasetIds.has(answer.word.datasetId), warmupSessionId }
  })
  const primaryResults: WordResult[] = session.primaryAnswers.map((answer, index) => {
    const dataset = state.datasets.find((item) => item.id === answer.word.datasetId)
    return { id: `${session.id}-primary-${answer.word.id}-${index}`, childId: session.childId, datasetId: answer.word.datasetId, datasetDateRange: dataset?.dateRange || 'Unknown date range', wordId: answer.word.id, grade: session.grade, phase: session.primaryPhase, sessionId: session.id, sessionDate, completedAt: now.toISOString(), correct: answer.correct, revealMethod: 'timer', scored: true, completeSourceDatasetReviewed: true }
  })
  const newResults = [...warmupResults, ...primaryResults]
  const scores: DatasetScore[] = []
  const primaryDataset = state.datasets.find((dataset) => dataset.id === session.primaryDatasetId)
  if (primaryDataset && session.primaryAnswers.length === primaryDataset.words.length && new Set(session.primaryAnswers.map((answer) => answer.word.id)).size === primaryDataset.words.length) {
    scores.push(makeScore(session, primaryDataset, session.primaryAnswers, session.primaryPhase, sessionDate))
  }
  const warmupDatasetIds = [...new Set(session.warmupAnswers.map((answer) => answer.word.datasetId))]
  warmupDatasetIds.forEach((datasetId) => {
    const dataset = state.datasets.find((item) => item.id === datasetId)
    const answers = session.warmupAnswers.filter((answer) => answer.word.datasetId === datasetId)
    if (dataset && answers.length === dataset.words.length && new Set(answers.map((answer) => answer.word.id)).size === dataset.words.length) scores.push(makeScore(session, dataset, answers, 'warmup', sessionDate, warmupSessionId))
  })
  const safeScores = scores.filter((score) => !state.scores.some((existing) => existing.id === score.id))
  const warmupRecord: WarmupSessionRecord = { id: warmupSessionId, childId: session.childId, sessionId: session.id, sessionDate, wordIds: session.warmupAnswers.map((answer) => answer.word.id), datasetIds: warmupDatasetIds, completeDatasetIds: [...warmupCompleteDatasetIds], complete: true }
  return {
    ...state,
    results: [...state.results, ...newResults],
    scores: [...state.scores, ...safeScores],
    warmupSessions: [...state.warmupSessions, warmupRecord],
    completedSessions: [...state.completedSessions, { id: session.id, childId: session.childId, sessionDate, primaryDatasetId: session.primaryDatasetId, primaryPhase: session.primaryPhase, complete: true }],
  }
}

function makeScore(session: PracticeSession, dataset: Dataset, answers: SessionAnswer[], phase: LifecyclePhase, sessionDate: string, warmupSessionId?: string): DatasetScore {
  const correct = answers.filter((answer) => answer.correct).length
  return { id: `${session.id}-${phase}-${dataset.id}${warmupSessionId ? `-${warmupSessionId}` : ''}`, childId: session.childId, datasetId: dataset.id, datasetDateRange: dataset.dateRange, phase, sessionId: session.id, sessionDate, percent: Math.round((correct / answers.length) * 100), correct, wordCount: answers.length, warmupSessionId }
}
