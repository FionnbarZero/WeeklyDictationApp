import type { WarmupVisit, WarmupVisitQueueEntry } from '../../warmup/visits/contracts.ts'
import {
  CLOUD_WARMUP_QUEUE_ENTRY_CONTRACT_ID,
  type CloudWarmupDecodeResult,
  type CloudWarmupQueueEntry,
  type CloudWarmupVisit,
} from './cloudContracts.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function queueEntryFromCloud(record: CloudWarmupQueueEntry): WarmupVisitQueueEntry {
  const {
    schemaVersion: _schemaVersion,
    contractId: _contractId,
    visitId: _visitId,
    childId: _childId,
    lastAppliedTransitionId: _transitionId,
    ...entry
  } = record
  return entry
}

export function encodeCloudWarmupVisit(visit: WarmupVisit): {
  visit: CloudWarmupVisit
  queueEntries: CloudWarmupQueueEntry[]
} {
  const { queue, ...metadata } = visit
  return {
    visit: { ...metadata, queueEntryIds: queue.map((entry) => entry.id) },
    queueEntries: queue.map((entry) => ({
      schemaVersion: 1,
      contractId: CLOUD_WARMUP_QUEUE_ENTRY_CONTRACT_ID,
      visitId: visit.id,
      childId: visit.childId,
      ...entry,
    })),
  }
}

export function encodeChangedCloudWarmupQueueEntry(visit: WarmupVisit, queueEntryId: string): CloudWarmupQueueEntry {
  const entry = visit.queue.find((candidate) => candidate.id === queueEntryId)
  const transitionId = visit.lastAppliedTransition?.transitionId
  if (!entry || !transitionId) throw new Error('The Warmup transition does not contain its changed queue entry and receipt.')
  return {
    schemaVersion: 1,
    contractId: CLOUD_WARMUP_QUEUE_ENTRY_CONTRACT_ID,
    visitId: visit.id,
    childId: visit.childId,
    ...entry,
    lastAppliedTransitionId: transitionId,
  }
}

function validQueueRecordShape(value: unknown): value is CloudWarmupQueueEntry {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || value.contractId !== CLOUD_WARMUP_QUEUE_ENTRY_CONTRACT_ID
    || typeof value.id !== 'string'
    || typeof value.visitId !== 'string'
    || typeof value.childId !== 'string'
    || !Number.isInteger(value.position)
    || typeof value.masteryTermId !== 'string'
    || !Array.isArray(value.occurrenceIds)
    || !isRecord(value.prompt)
    || !['pending', 'answered', 'unavailable'].includes(String(value.status))) return false
  if (value.status === 'pending') return !('attemptId' in value) && !('unavailableReason' in value)
  if (value.status === 'answered') return typeof value.attemptId === 'string' && !('unavailableReason' in value)
  return value.unavailableReason === 'active-curriculum-occurrence' && !('attemptId' in value)
}

export function decodeCloudWarmupVisits(
  rawVisits: readonly CloudWarmupVisit[],
  rawQueueEntries: readonly CloudWarmupQueueEntry[],
): CloudWarmupDecodeResult {
  const issues: CloudWarmupDecodeResult['issues'][number][] = []
  const entryGroups = new Map<string, CloudWarmupQueueEntry[]>()
  for (const raw of rawQueueEntries) {
    const recordId = isRecord(raw) && typeof raw.id === 'string' ? raw.id : 'unknown'
    if (!validQueueRecordShape(raw)) {
      issues.push({ collection: 'queue-entries', recordId, reason: 'The cloud Warmup queue entry is malformed.', raw })
      continue
    }
    entryGroups.set(raw.id, [...(entryGroups.get(raw.id) || []), raw])
  }

  const usedEntryIds = new Set<string>()
  const seenVisitIds = new Set<string>()
  const visits: WarmupVisit[] = []
  for (const raw of rawVisits) {
    const recordId = isRecord(raw) && typeof raw.id === 'string' ? raw.id : 'unknown'
    if (!isRecord(raw)
      || typeof raw.id !== 'string'
      || typeof raw.childId !== 'string'
      || !Array.isArray(raw.queueEntryIds)
      || !raw.queueEntryIds.every((id) => typeof id === 'string')
      || new Set(raw.queueEntryIds).size !== raw.queueEntryIds.length
      || raw.queueEntryIds.length !== raw.assignedQueueSize
      || seenVisitIds.has(raw.id)) {
      issues.push({ collection: 'visits', recordId, reason: 'The cloud Warmup visit metadata is malformed or duplicated.', raw })
      continue
    }
    const records = raw.queueEntryIds.map((id) => entryGroups.get(id) || [])
    const queueIsComplete = records.every((group, position) => group.length === 1
      && group[0].visitId === raw.id
      && group[0].childId === raw.childId
      && group[0].position === position)
    if (!queueIsComplete) {
      issues.push({ collection: 'visits', recordId, reason: 'The cloud Warmup visit queue is missing, duplicated, reordered, or belongs to another visit.', raw })
      continue
    }
    const queue = records.map((group) => queueEntryFromCloud(group[0]))
    const { queueEntryIds: _queueEntryIds, ...metadata } = raw
    visits.push({ ...metadata, queue } as WarmupVisit)
    seenVisitIds.add(raw.id)
    raw.queueEntryIds.forEach((id) => usedEntryIds.add(id))
  }

  for (const [id, records] of entryGroups) {
    if (!usedEntryIds.has(id)) issues.push({
      collection: 'queue-entries',
      recordId: id,
      reason: records.length > 1 ? 'The cloud Warmup queue-entry identity is duplicated.' : 'The cloud Warmup queue entry is orphaned.',
      raw: records,
    })
  }
  return { visits, issues }
}
