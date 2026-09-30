import type { WarmupTransition, WarmupTransitionOperation } from './contracts.ts'

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalValue(entry)]))
}

export function stableWarmupSerialization(value: unknown) {
  return JSON.stringify(canonicalValue(value))
}

export function warmupDigest(value: unknown) {
  const input = stableWarmupSerialization(value)
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193) >>> 0
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0
  }
  return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`
}

export function warmupQueueEntryId(visitId: string, position: number, masteryTermId: string) {
  return `warmup-entry-v1-${warmupDigest({ visitId, position, masteryTermId })}`
}

export function warmupTransitionId(
  visitId: string,
  expectedVisitRevision: number,
  operation: WarmupTransitionOperation,
  queueEntryId: string = operation,
) {
  return `warmup-transition-v1-${warmupDigest({ visitId, expectedVisitRevision, operation, queueEntryId })}`
}

export function warmupAttemptId(transitionId: string) {
  return `warmup-attempt-v1-${warmupDigest({ transitionId })}`
}

export function warmupGraphPointId(visitId: string) {
  return `warmup-graph-v1-${warmupDigest({ visitId })}`
}

export function warmupTransitionFingerprint(transition: Omit<WarmupTransition, 'payloadFingerprint'>) {
  const { lastAppliedTransition: _receipt, ...nextVisit } = transition.nextVisit
  const nextMastery = transition.nextMastery
    ? (() => { const { lastAppliedTransition: _masteryReceipt, ...mastery } = transition.nextMastery!; return mastery })()
    : undefined
  return `warmup-checkpoint-v1-${warmupDigest({ ...transition, nextVisit, nextMastery })}`
}
