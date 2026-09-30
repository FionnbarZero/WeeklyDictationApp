import type { VersionedChildMasteryState, WarmupTransition, WarmupVisit } from '../../warmup/visits/contracts.ts'

export const WARMUP_PENDING_JOURNAL_KEY = 'weekly-dictation-warmup-pending-v1'

type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'getItem' | 'setItem'>

export type PendingWarmupCommit = {
  transition: WarmupTransition
  baseVisit: WarmupVisit
  baseMastery?: VersionedChildMasteryState
}

type WarmupPendingJournal = {
  version: 1
  entries: PendingWarmupCommit[]
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function looksLikeTransition(value: unknown): value is WarmupTransition {
  return record(value)
    && value.contractId === 'adaptive-warmup-visit-v1'
    && typeof value.visitId === 'string'
    && typeof value.transitionId === 'string'
    && typeof value.payloadFingerprint === 'string'
    && ['answer', 'mark-unavailable', 'finalize-partial', 'skip'].includes(String(value.operation))
    && typeof value.expectedVisitRevision === 'number'
    && typeof value.nextVisitRevision === 'number'
    && typeof value.occurredAt === 'string'
    && record(value.nextVisit)
}

function looksLikePendingCommit(value: unknown): value is PendingWarmupCommit {
  if (!record(value) || !looksLikeTransition(value.transition) || !record(value.baseVisit)) return false
  if (value.baseVisit.id !== value.transition.visitId || value.baseVisit.revision !== value.transition.expectedVisitRevision) return false
  if (value.transition.operation === 'answer') {
    return record(value.baseMastery)
      && value.baseMastery.revision === value.transition.expectedMasteryRevision
      && record(value.baseMastery.state)
  }
  return value.baseMastery === undefined
}

export type PendingWarmupJournalReadResult = {
  entries: PendingWarmupCommit[]
  error?: string
  raw?: string
}

export function readPendingWarmupJournal(storage: StorageReader): PendingWarmupJournalReadResult {
  const raw = storage.getItem(WARMUP_PENDING_JOURNAL_KEY)
  if (!raw) return { entries: [] }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!record(parsed) || parsed.version !== 1 || !Array.isArray(parsed.entries) || !parsed.entries.every(looksLikePendingCommit)) {
      return { entries: [], error: 'The pending Warmup journal is malformed and was preserved for recovery.', raw }
    }
    const ids = new Set<string>()
    for (const { transition } of parsed.entries) {
      if (ids.has(transition.transitionId)) return { entries: [], error: 'The pending Warmup journal contains repeated transition identities and was preserved for recovery.', raw }
      ids.add(transition.transitionId)
    }
    return { entries: parsed.entries }
  } catch {
    return { entries: [], error: 'The pending Warmup journal could not be read and was preserved for recovery.', raw }
  }
}

function writeJournal(storage: StorageWriter, entries: PendingWarmupCommit[]) {
  const journal: WarmupPendingJournal = { version: 1, entries }
  storage.setItem(WARMUP_PENDING_JOURNAL_KEY, JSON.stringify(journal))
}

export function appendPendingWarmupTransition(
  storage: StorageWriter,
  transition: WarmupTransition,
  baseVisit: WarmupVisit,
  baseMastery?: VersionedChildMasteryState,
) {
  const current = readPendingWarmupJournal(storage)
  if (current.error) throw new Error(current.error)
  const entry: PendingWarmupCommit = { transition, baseVisit, ...(baseMastery ? { baseMastery } : {}) }
  if (!looksLikePendingCommit(entry)) throw new Error('A pending Warmup transition must retain its exact base visit and mastery revision.')
  const sameId = current.entries.find((candidate) => candidate.transition.transitionId === transition.transitionId)
  if (sameId) {
    if (sameId.transition.payloadFingerprint !== transition.payloadFingerprint) throw new Error('A pending Warmup transition ID was reused with different content.')
    return current.entries
  }
  const entries = [...current.entries, entry]
  writeJournal(storage, entries)
  return entries
}

export function removePendingWarmupTransition(storage: StorageWriter, transitionId: string) {
  const current = readPendingWarmupJournal(storage)
  if (current.error) throw new Error(current.error)
  const entries = current.entries.filter((entry) => entry.transition.transitionId !== transitionId)
  writeJournal(storage, entries)
  return entries
}
