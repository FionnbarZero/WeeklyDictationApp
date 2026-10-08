/** Deterministic ordering for competing unfinished activity checkpoints.
 *
 * This policy never combines fields from two checkpoints. A checkpoint only
 * wins when it contains a trusted reviewed-answer timestamp; teaching-only
 * visits and timestamps implausibly far in the future cannot supersede a
 * reviewed checkpoint. Equal timestamps use an immutable caller-supplied key.
 */
export const DEFAULT_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000

export type CheckpointCandidate = {
  id: string
  reviewedAt?: string
}

export type CheckpointConflictOptions = {
  referenceNow: string
  maxFutureSkewMs?: number
}

export type CheckpointWinnerReason = 'reviewed-answer' | 'only-reviewed-answer' | 'tie-break' | 'no-reviewed-answer'

export type CheckpointWinner = {
  winner: CheckpointCandidate | null
  reason: CheckpointWinnerReason
}

function timestamp(value: string | undefined, options: CheckpointConflictOptions) {
  if (!value || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) return null
  const parsed = Date.parse(value)
  const reference = Date.parse(options.referenceNow)
  const maxFutureSkewMs = options.maxFutureSkewMs ?? DEFAULT_MAX_FUTURE_SKEW_MS
  if (Number.isNaN(reference) || !Number.isFinite(maxFutureSkewMs) || maxFutureSkewMs < 0) throw new Error('Checkpoint conflict clock policy is invalid.')
  return parsed > reference + maxFutureSkewMs ? null : parsed
}

function compareCandidates(a: CheckpointCandidate, b: CheckpointCandidate, options: CheckpointConflictOptions) {
  const aTime = timestamp(a.reviewedAt, options)
  const bTime = timestamp(b.reviewedAt, options)
  if (aTime === null && bTime === null) return a.id.localeCompare(b.id)
  if (aTime === null) return -1
  if (bTime === null) return 1
  return aTime === bTime ? a.id.localeCompare(b.id) : aTime - bTime
}

export function chooseCheckpointWinner(candidates: readonly CheckpointCandidate[], options: CheckpointConflictOptions): CheckpointWinner | null {
  if (candidates.length === 0) return null
  if (candidates.some(candidate => !candidate.id)) throw new Error('Checkpoint conflict candidates require stable identities.')
  const trusted = candidates.filter(candidate => timestamp(candidate.reviewedAt, options) !== null)
  if (trusted.length === 0) return { winner: null, reason: 'no-reviewed-answer' }
  const ranked = [...candidates].sort((a, b) => compareCandidates(a, b, options))
  const winner = ranked[ranked.length - 1]
  const reason: CheckpointWinnerReason = trusted.length === 0
    ? 'no-reviewed-answer'
    : trusted.length === 1
      ? 'only-reviewed-answer'
      : ranked.length > 1 && timestamp(ranked[ranked.length - 1].reviewedAt, options) === timestamp(ranked[ranked.length - 2].reviewedAt, options)
        ? 'tie-break'
        : 'reviewed-answer'
  return { winner, reason }
}
