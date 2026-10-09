import { serializeGameRecord as canonical } from './serialization.ts'
import { chooseCheckpointWinner } from '../familyBeta/checkpointConflict.ts'
import { BETA_GRADES, makeResult, type BetaProfile, type BetaResult } from '../familyBeta/model.ts'
import type { LearningModuleAttempt, LearningModulePack } from './contracts.ts'
import { assertGamePack, reviewGameAnswer } from './review.ts'

export const GAME_PROGRESS_SCHEMA = 'ninja-game-progress-v1'
export const GAME_PROGRESS_BYTES = 200_000
export const GAME_REVIEW_LIMIT = 100_000
export type GameScope = {
  childId: string
  grade: BetaProfile['grade']
  week: string
  gameId: LearningModulePack['moduleId']
}
export type GamePromptProgress = { promptId: string; targetId: string; attempted: number; correct: number }
export type GameCheckpoint = {
  schema: typeof GAME_PROGRESS_SCHEMA
  scope: GameScope
  runId: string
  attemptId: string
  writerId: string
  revision: number
  startedAt: string
  reviewedAt: string | null
  pack: LearningModulePack
  prompts: GamePromptProgress[]
  cleared: string[]
  remainingMs: number | null
  cycle: number
}
export type GameCompletion = {
  schema: 'ninja-game-completion-v1'
  phase: 'reinforcement'
  checkpoint: GameCheckpoint
  result: BetaResult
  targets: { targetId: string; datasetId: string; tier: string; attempted: number; correct: number }[]
}

const supported = ['memory-flip', 'speed-match', 'context-gap-dash', 'sentence-scramble']
const id = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,160}$/.test(value)
const iso = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
const integer = (value: unknown, min: number, max: number): value is number =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b)
const text = (value: unknown, required = true) => {
  if (value === undefined && !required) return
  if (typeof value !== 'string' || (required && !value.length) || value.length > 4000 || /^(blob:|data:)/.test(value))
    throw new Error('Invalid pinned game text.')
}
function keys(value: object, allowed: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new Error('Unsupported game record fields. Saved work was not changed.')
}
function bounded(value: unknown) {
  if (new TextEncoder().encode(JSON.stringify(value)).length > GAME_PROGRESS_BYTES)
    throw new Error('The game record exceeds its safe storage limit.')
}

/** Pin an allowlisted teaching pack, never module/UI state or response material.
 * Old schema/strategy versions must get a versioned reader, not reinterpretation. */
function validatePack(pack: LearningModulePack) {
  bounded(pack)
  keys(pack, ['moduleId', 'title', 'cohort', 'scopeNote', 'selection', 'pairs', 'rounds'])
  if (!supported.includes(pack.moduleId)) throw new Error('This game persistence adapter is coming soon.')
  const cohort = pack.cohort
  keys(cohort, ['id', 'label', 'grade', 'schoolYear', 'terms', 'provenance'])
  if (
    !Array.isArray(cohort.terms) ||
    cohort.terms.length < 1 ||
    cohort.terms.length > 500 ||
    !Array.isArray(cohort.provenance) ||
    cohort.provenance.length < 1 ||
    cohort.provenance.length > 8 ||
    !BETA_GRADES.includes(cohort.grade as BetaProfile['grade']) ||
    typeof cohort.schoolYear !== 'string' ||
    !cohort.schoolYear ||
    cohort.schoolYear.length > 32
  )
    throw new Error('Invalid pinned game curriculum.')
  for (const value of [pack.title, cohort.id, cohort.label]) text(value)
  text(pack.scopeNote, false)
  for (const term of cohort.terms) {
    keys(term, [
      'occurrenceId',
      'datasetId',
      'text',
      'tier',
      'meaning',
      'supplementalVersion',
      'pinyinText',
      'pinyinSteps',
      'context',
    ])
    for (const value of [term.meaning, term.supplementalVersion, term.pinyinText]) text(value, false)
    if (term.context) {
      keys(term.context, ['sentence', 'tokens'])
      text(term.context.sentence)
      if (!Array.isArray(term.context.tokens)) throw new Error('Invalid context tokens.')
      term.context.tokens.forEach((token: unknown) => text(token))
    }
    if (term.pinyinSteps !== undefined && !Array.isArray(term.pinyinSteps)) throw new Error('Invalid Pinyin steps.')
    for (const step of term.pinyinSteps || []) {
      keys(step, ['pinyin', 'candidates'])
      text(step.pinyin)
      if (!Array.isArray(step.candidates)) throw new Error('Invalid Pinyin choices.')
      step.candidates.forEach((candidate: unknown) => text(candidate))
    }
    if (
      typeof term.occurrenceId !== 'string' ||
      !term.occurrenceId ||
      typeof term.text !== 'string' ||
      !term.text ||
      !['tier-1', 'tier-2'].includes(term.tier) ||
      !cohort.provenance.some((source) => source.datasetId === term.datasetId)
    )
      throw new Error('Invalid pinned game target.')
  }
  if (new Set(cohort.terms.map((term) => term.occurrenceId)).size !== cohort.terms.length)
    throw new Error('Duplicate pinned targets.')
  for (const source of cohort.provenance) {
    keys(source, ['datasetId', 'contentFingerprint', 'source'])
    keys(source.source, ['sourceType', 'sourceDocumentId', 'sourceUnitId', 'adapterId'])
    if (!['google-sheets', 'google-slides'].includes(source.source.sourceType))
      throw new Error('Invalid curriculum source type.')
    for (const value of [source.source.sourceDocumentId, source.source.sourceUnitId, source.source.adapterId])
      text(value)
    if (
      typeof source.datasetId !== 'string' ||
      !/^[A-Za-z0-9_:-]{1,300}$/.test(source.datasetId) ||
      typeof source.contentFingerprint !== 'string' ||
      !source.contentFingerprint
    )
      throw new Error('Pinned game provenance is incomplete.')
  }
  if (new Set(cohort.provenance.map((source) => source.datasetId)).size !== cohort.provenance.length)
    throw new Error('Duplicate game curriculum sources.')
  keys(pack.selection!, ['policyVersion', 'visit', 'available', 'eligible', 'included'])
  if (!integer(pack.selection?.visit, 0, GAME_REVIEW_LIMIT)) throw new Error('Invalid game coverage visit.')
  const prompts = 'pairs' in pack ? pack.pairs : pack.rounds
  if (
    'pairs' in pack !== ['memory-flip', 'speed-match'].includes(pack.moduleId) ||
    ('pairs' in pack && 'rounds' in pack)
  )
    throw new Error('Game prompt type mismatch.')
  if (
    !Array.isArray(prompts) ||
    prompts.length < 1 ||
    prompts.length > 64 ||
    new Set(prompts.map((prompt) => prompt.id)).size !== prompts.length
  )
    throw new Error('Invalid game prompt set.')
  for (const prompt of prompts) {
    if ('left' in prompt) {
      keys(prompt, ['id', 'targetId', 'left', 'right'])
      keys(prompt.left, ['id', 'label', 'accessibleLabel'])
      keys(prompt.right, ['id', 'label', 'accessibleLabel'])
    } else {
      keys(prompt, [
        'id',
        'targetId',
        'targetText',
        'cueText',
        'audioText',
        'choices',
        'correctChoiceId',
        'sentenceBefore',
        'sentenceAfter',
        'tokens',
        'correctTokenIds',
      ])
      const choices = 'tokens' in prompt ? prompt.tokens : 'choices' in prompt ? prompt.choices : []
      for (const choice of choices) keys(choice, ['id', 'label', 'accessibleLabel'])
    }
  }
  // Reject non-scalar leaves and unexpectedly large text anywhere in the
  // allowlisted pack; a typed object is not a runtime validation boundary.
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      if (value.length > 4000 || /^(blob:|data:)/.test(value)) throw new Error('Invalid game content text.')
    } else if (Array.isArray(value)) {
      if (value.length > 500) throw new Error('Invalid game content collection.')
      value.forEach(visit)
    } else if (value && typeof value === 'object') Object.values(value).forEach(visit)
    else if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value)))
      throw new Error('Invalid game content value.')
  }
  visit(pack)
  assertGamePack(pack)
}

export function gameScopeKey(scope: GameScope) {
  keys(scope, ['childId', 'grade', 'week', 'gameId'])
  if (
    !id(scope.childId) ||
    !BETA_GRADES.includes(scope.grade) ||
    !supported.includes(scope.gameId) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(scope.week) ||
    !Number.isFinite(Date.parse(`${scope.week}T00:00:00Z`)) ||
    new Date(`${scope.week}T00:00:00Z`).toISOString().slice(0, 10) !== scope.week
  )
    throw new Error('Invalid game activity scope.')
  return canonical(scope)
}

export function validateGameCheckpoint(value: GameCheckpoint): GameCheckpoint {
  bounded(value)
  keys(value, [
    'schema',
    'scope',
    'runId',
    'attemptId',
    'writerId',
    'revision',
    'startedAt',
    'reviewedAt',
    'pack',
    'prompts',
    'cleared',
    'remainingMs',
    'cycle',
  ])
  gameScopeKey(value.scope)
  validatePack(value.pack)
  if (
    value.schema !== GAME_PROGRESS_SCHEMA ||
    !id(value.runId) ||
    !id(value.attemptId) ||
    !id(value.writerId) ||
    !integer(value.revision, 0, 1_000_000) ||
    !integer(value.cycle, 0, GAME_REVIEW_LIMIT) ||
    !iso(value.startedAt) ||
    (value.reviewedAt !== null && !iso(value.reviewedAt)) ||
    value.pack.moduleId !== value.scope.gameId ||
    value.pack.cohort.grade !== value.scope.grade
  )
    throw new Error('Invalid game checkpoint identity.')
  const prompts = 'pairs' in value.pack ? value.pack.pairs : value.pack.rounds
  if (
    !Array.isArray(value.prompts) ||
    value.prompts.length !== prompts.length ||
    !Array.isArray(value.cleared) ||
    value.cleared.length > prompts.length ||
    new Set(value.cleared).size !== value.cleared.length
  )
    throw new Error('Invalid reviewed game progress.')
  value.prompts.forEach((progress, index) => {
    keys(progress, ['promptId', 'targetId', 'attempted', 'correct'])
    if (
      progress.promptId !== prompts[index].id ||
      progress.targetId !== prompts[index].targetId ||
      !integer(progress.attempted, 0, GAME_REVIEW_LIMIT) ||
      !integer(progress.correct, 0, progress.attempted)
    )
      throw new Error('Game progress does not match its pinned prompts.')
  })
  const total = value.prompts.reduce((count, progress) => count + progress.attempted, 0)
  if (
    total > GAME_REVIEW_LIMIT ||
    (total === 0) !== (value.reviewedAt === null) ||
    total > value.revision ||
    value.cleared.some(
      (promptId) =>
        !value.prompts.some(
          (prompt) =>
            prompt.promptId === promptId &&
            (value.scope.gameId === 'context-gap-dash' ? prompt.attempted > 0 : prompt.correct > 0),
        ),
    )
  )
    throw new Error('Game progress counters are inconsistent.')
  if (
    value.scope.gameId === 'speed-match'
      ? !integer(value.remainingMs, 0, 60_000)
      : value.remainingMs !== null || value.cycle !== 0
  )
    throw new Error('Invalid game timer checkpoint.')
  if (value.scope.gameId === 'context-gap-dash' || value.scope.gameId === 'sentence-scramble') {
    if (
      !same(
        value.cleared,
        prompts.slice(0, value.cleared.length).map((prompt) => prompt.id),
      ) ||
      value.prompts.some((prompt, index) => index > value.cleared.length && prompt.attempted !== 0)
    )
      throw new Error('Game sequence progress is out of order.')
  }
  if (
    value.scope.gameId !== 'speed-match' &&
    value.prompts.some((prompt) =>
      value.scope.gameId === 'context-gap-dash'
        ? prompt.attempted > 1 || prompt.attempted > 0 !== value.cleared.includes(prompt.promptId)
        : prompt.correct > 1 || prompt.correct > 0 !== value.cleared.includes(prompt.promptId),
    )
  )
    throw new Error('Game cleared prompts disagree with reviewed progress.')
  return value
}

export function startGameCheckpoint(
  scope: GameScope,
  pack: LearningModulePack,
  attemptId: string,
  writerId: string,
  now: string,
): GameCheckpoint {
  const prompts = 'pairs' in pack ? pack.pairs : pack.rounds
  return validateGameCheckpoint({
    schema: GAME_PROGRESS_SCHEMA,
    scope,
    pack: structuredClone(pack),
    runId: attemptId,
    attemptId,
    writerId,
    revision: 0,
    startedAt: now,
    reviewedAt: null,
    prompts: prompts.map((prompt) => ({ promptId: prompt.id, targetId: prompt.targetId, attempted: 0, correct: 0 })),
    cleared: [],
    remainingMs: scope.gameId === 'speed-match' ? 60_000 : null,
    cycle: 0,
  })
}

export function gameCheckpointComplete(value: GameCheckpoint) {
  validateGameCheckpoint(value)
  return value.cleared.length === value.prompts.length
}

/** Called before the module advances. No response is copied into this record. */
export function checkpointGameAnswer(
  value: GameCheckpoint,
  attempt: LearningModuleAttempt,
  reviewedAt: string,
  remainingMs = value.remainingMs,
) {
  validateGameCheckpoint(value)
  if (
    !iso(reviewedAt) ||
    gameCheckpointComplete(value) ||
    value.cleared.includes(attempt.promptId) ||
    value.remainingMs === 0 ||
    (value.remainingMs !== null && (remainingMs === null || remainingMs > value.remainingMs))
  )
    throw new Error('This game prompt is no longer available for assessment.')
  if (
    (value.scope.gameId === 'context-gap-dash' || value.scope.gameId === 'sentence-scramble') &&
    attempt.promptId !== value.prompts[value.cleared.length]?.promptId
  )
    throw new Error('Review the current game prompt first.')
  const reviewed = reviewGameAnswer(value.pack, attempt)
  return validateGameCheckpoint({
    ...value,
    reviewedAt,
    remainingMs,
    revision: value.revision + 1,
    prompts: value.prompts.map((prompt) =>
      prompt.promptId === reviewed.promptId
        ? { ...prompt, attempted: prompt.attempted + 1, correct: prompt.correct + Number(reviewed.correct) }
        : prompt,
    ),
    cleared:
      reviewed.correct || value.scope.gameId === 'context-gap-dash'
        ? [...value.cleared, reviewed.promptId]
        : value.cleared,
  })
}

/** Navigation/reporting never increases the timer or changes reviewedAt. */
export function checkpointGameTimer(value: GameCheckpoint, remainingMs: number) {
  validateGameCheckpoint(value)
  if (value.remainingMs === null || remainingMs > value.remainingMs || gameCheckpointComplete(value))
    throw new Error('Invalid game timer transition.')
  return validateGameCheckpoint({ ...value, remainingMs, revision: value.revision + 1 })
}

export function retryTimedGame(value: GameCheckpoint) {
  validateGameCheckpoint(value)
  if (value.scope.gameId !== 'speed-match' || value.remainingMs !== 0 || gameCheckpointComplete(value))
    throw new Error('Only an expired unfinished Shuriken round can restart.')
  return validateGameCheckpoint({
    ...value,
    remainingMs: 60_000,
    cleared: [],
    cycle: value.cycle + 1,
    revision: value.revision + 1,
  })
}

/** A new writer forks identity BEFORE its first answer, preserving two distinct
 * completed continuations. A reload by the same writer retains its identity. */
export function continueGameCheckpoint(value: GameCheckpoint, writerId: string, attemptId: string) {
  validateGameCheckpoint(value)
  if (writerId === value.writerId) return value
  if (gameCheckpointComplete(value)) throw new Error('A completed game cannot be forked into another score.')
  if (attemptId === value.attemptId || attemptId === value.runId)
    throw new Error('A new writer needs a fresh attempt identity.')
  return validateGameCheckpoint({ ...value, writerId, attemptId, revision: value.revision + 1 })
}

/** Whole unfinished snapshot only. Completion ledgers are NEVER inputs here. */
export function reconcileGameCheckpoints(local: GameCheckpoint, remote: GameCheckpoint, referenceNow: string) {
  validateGameCheckpoint(local)
  validateGameCheckpoint(remote)
  if (gameScopeKey(local.scope) !== gameScopeKey(remote.scope))
    throw new Error('Cannot reconcile different game activities.')
  if (same(local, remote)) return local
  const tieKeys = [local, remote].map(
    (value) => `${value.writerId}:${value.attemptId}:${String(value.revision).padStart(7, '0')}:${canonical(value)}`,
  )
  // Avoid locale-dependent collation of pinned Chinese text. Equal-time
  // answers and timer updates by the same writer retain the later revision.
  const ids = tieKeys[0] < tieKeys[1] ? ['0', '1'] : ['1', '0']
  const candidates = [local, remote].map((value, index) => ({
    id: ids[index],
    reviewedAt: value.reviewedAt || undefined,
  }))
  const selected = chooseCheckpointWinner(candidates, { referenceNow })?.winner
  if (!selected && local.reviewedAt === null && remote.reviewedAt === null) return ids[0] === '1' ? local : remote // Neither copy contains an answer to lose.
  if (!selected)
    throw new Error('Competing game checkpoints have no trusted reviewed answer. Both copies were preserved.')
  return candidates[0].id === selected.id ? local : remote
}

export function completeGameCheckpoint(value: GameCheckpoint, now: string): GameCompletion {
  if (!gameCheckpointComplete(value)) throw new Error('Finish the selected game targets before saving a completion.')
  const targets = value.prompts.map((prompt) => {
    const term = value.pack.cohort.terms.find((term) => term.occurrenceId === prompt.targetId)!
    return {
      targetId: term.occurrenceId,
      datasetId: term.datasetId!,
      tier: term.tier,
      attempted: prompt.attempted,
      correct: prompt.correct,
    }
  })
  const result = makeResult(
    { id: value.scope.childId, grade: value.scope.grade, nickname: '', active: true },
    {
      id: value.attemptId,
      activity: value.pack.title,
      channel: 'game',
      schoolYear: value.pack.cohort.schoolYear,
      datasetIds: value.pack.cohort.provenance.map((source) => source.datasetId),
      correct: targets.reduce((n, target) => n + target.correct, 0),
      attempted: targets.reduce((n, target) => n + target.attempted, 0),
    },
    new Date(now),
  )
  const completion: GameCompletion = {
    schema: 'ninja-game-completion-v1',
    phase: 'reinforcement',
    checkpoint: structuredClone(value),
    result,
    targets,
  }
  bounded(completion)
  return completion
}

export function validateGameCompletion(value: GameCompletion) {
  keys(value, ['schema', 'phase', 'checkpoint', 'result', 'targets'])
  bounded(value)
  if (!same(value, completeGameCheckpoint(value.checkpoint, value.result.completedAt)))
    throw new Error('The detailed game result differs from its reviewed checkpoint.')
  return value
}

export { canonical as serializeGameRecord }
