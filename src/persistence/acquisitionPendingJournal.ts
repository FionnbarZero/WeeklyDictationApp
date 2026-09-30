import type { AcquisitionCheckpoint, AcquisitionProgressEnvelope } from '../acquisition/persistence/contracts.ts'
import type { Word } from '../domain/contracts.ts'

export const ACQUISITION_PENDING_JOURNAL_KEY = 'weekly-dictation-acquisition-pending-v1'

type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'getItem' | 'setItem'>

type PendingJournal = {
  version: 1
  entries: PendingAcquisitionCommit[]
}

export type PendingAcquisitionCommit = {
  checkpoint: AcquisitionCheckpoint<Word>
  baseEnvelope: AcquisitionProgressEnvelope<Word>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function looksLikeCheckpoint(value: unknown): value is AcquisitionCheckpoint<Word> {
  return isRecord(value)
    && value.contractId === 'acquisition-persistence-v1'
    && typeof value.progressionId === 'string'
    && typeof value.transitionId === 'string'
    && typeof value.payloadFingerprint === 'string'
    && (value.operation === 'answer' || value.operation === 'resume-dt-practice')
    && typeof value.expectedRevision === 'number'
    && typeof value.nextRevision === 'number'
    && typeof value.sessionId === 'string'
    && typeof value.promptId === 'string'
    && typeof value.occurredAt === 'string'
    && Array.isArray(value.randomValues)
    && isRecord(value.nextFlow)
}

export type PendingJournalReadResult = {
  entries: PendingAcquisitionCommit[]
  error?: string
  raw?: string
}

function looksLikePendingCommit(value: unknown): value is PendingAcquisitionCommit {
  return isRecord(value)
    && looksLikeCheckpoint(value.checkpoint)
    && isRecord(value.baseEnvelope)
    && value.baseEnvelope.id === value.checkpoint.progressionId
    && value.baseEnvelope.revision === value.checkpoint.expectedRevision
}

export function readPendingAcquisitionJournal(storage: StorageReader): PendingJournalReadResult {
  const raw = storage.getItem(ACQUISITION_PENDING_JOURNAL_KEY)
  if (!raw) return { entries: [] }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.entries) || !parsed.entries.every(looksLikePendingCommit)) {
      return { entries: [], error: 'The pending Acquisition journal is malformed and was preserved for recovery.', raw }
    }
    const transitionIds = new Set<string>()
    for (const { checkpoint } of parsed.entries) {
      if (transitionIds.has(checkpoint.transitionId)) return { entries: [], error: 'The pending Acquisition journal contains repeated transition identities and was preserved for recovery.', raw }
      transitionIds.add(checkpoint.transitionId)
    }
    return { entries: parsed.entries }
  } catch {
    return { entries: [], error: 'The pending Acquisition journal could not be read and was preserved for recovery.', raw }
  }
}

function writeJournal(storage: StorageWriter, entries: PendingAcquisitionCommit[]) {
  const journal: PendingJournal = { version: 1, entries }
  storage.setItem(ACQUISITION_PENDING_JOURNAL_KEY, JSON.stringify(journal))
}

export function appendPendingAcquisitionCheckpoint(storage: StorageWriter, checkpoint: AcquisitionCheckpoint<Word>, baseEnvelope: AcquisitionProgressEnvelope<Word>) {
  const current = readPendingAcquisitionJournal(storage)
  if (current.error) throw new Error(current.error)
  if (baseEnvelope.id !== checkpoint.progressionId || baseEnvelope.revision !== checkpoint.expectedRevision) throw new Error('A pending Acquisition checkpoint must retain its exact base envelope.')
  const sameId = current.entries.find((item) => item.checkpoint.transitionId === checkpoint.transitionId)
  if (sameId) {
    if (sameId.checkpoint.payloadFingerprint !== checkpoint.payloadFingerprint) throw new Error('A pending Acquisition transition ID was reused with different content.')
    return current.entries
  }
  const entries = [...current.entries, { checkpoint, baseEnvelope }]
  writeJournal(storage, entries)
  return entries
}

export function removePendingAcquisitionCheckpoint(storage: StorageWriter, transitionId: string) {
  const current = readPendingAcquisitionJournal(storage)
  if (current.error) throw new Error(current.error)
  const entries = current.entries.filter((item) => item.checkpoint.transitionId !== transitionId)
  writeJournal(storage, entries)
  return entries
}
