import { classifyCandidateCollision } from './canonical.ts'
import type { CandidateStatus, InstructionalRole, WeeklyDatasetCandidate } from './model.ts'

export type ExistingDatasetReference = string | {
  datasetId: string
  contentFingerprint?: string
  candidateStatus?: CandidateStatus
  instructionalRole?: InstructionalRole
}

export type CandidateClassificationStatus = 'selected' | 'duplicate' | 'confirmation' | 'conflict' | 'malformed'
export type CandidateClassificationReason =
  | 'selected'
  | 'candidate-malformed'
  | 'same-week-conflict'
  | 'existing-conflict'
  | 'existing-duplicate'
  | 'existing-confirmation-current'
  | 'existing-confirmation-preview'
  | 'same-week-duplicate'
  | 'same-week-confirmation'

export type CandidateClassificationDecision = {
  candidate: WeeklyDatasetCandidate
  status: CandidateClassificationStatus
  reason: CandidateClassificationReason
  refreshExistingMetadata?: boolean
}

export type CandidateClassificationBatch = {
  decisions: CandidateClassificationDecision[]
  selectedCandidates: WeeklyDatasetCandidate[]
}

function isCurrentInstructionalRole(role: InstructionalRole | undefined) {
  return role === 'weekly-acquisition' || role === 'current-confirmation'
}

function instructionalRolePriority(role: InstructionalRole) {
  if (isCurrentInstructionalRole(role)) return 2
  if (role === 'next-week-preview') return 1
  return 0
}

function classifyExistingDataset(existing: Exclude<ExistingDatasetReference, string>, candidate: WeeklyDatasetCandidate) {
  if (existing.contentFingerprint && existing.contentFingerprint !== candidate.contentFingerprint) return 'conflict' as const
  if (existing.candidateStatus && existing.candidateStatus !== candidate.status) return 'conflict' as const
  const previewAndCurrent = (existing.instructionalRole === 'next-week-preview' && isCurrentInstructionalRole(candidate.instructionalRole)) ||
    (candidate.instructionalRole === 'next-week-preview' && isCurrentInstructionalRole(existing.instructionalRole))
  return previewAndCurrent ? 'confirmation' as const : 'duplicate' as const
}

function candidateIsMalformed(candidate: WeeklyDatasetCandidate) {
  return candidate.status === 'malformed' || !candidate.datasetId || candidate.validationOutcomes.some((outcome) => outcome.severity === 'error')
}

export function classifyWeeklyDatasetCandidates(candidates: WeeklyDatasetCandidate[], existingDatasetReferences: ExistingDatasetReference[] = []): CandidateClassificationBatch {
  const existingByDatasetId = new Map(existingDatasetReferences.map((reference) => typeof reference === 'string' ? [reference, { datasetId: reference }] : [reference.datasetId, reference]))
  const decisions: Array<CandidateClassificationDecision | null> = candidates.map((candidate) => candidateIsMalformed(candidate)
    ? { candidate, status: 'malformed', reason: 'candidate-malformed' }
    : null)
  const selectedCandidates: WeeklyDatasetCandidate[] = []
  const grouped = new Map<string, Array<{ candidate: WeeklyDatasetCandidate; candidateIndex: number }>>()

  candidates.forEach((candidate, candidateIndex) => {
    if (decisions[candidateIndex] || !candidate.datasetId) return
    const entries = grouped.get(candidate.datasetId) || []
    entries.push({ candidate, candidateIndex })
    grouped.set(candidate.datasetId, entries)
  })

  for (const [datasetId, entries] of grouped) {
    const first = entries[0].candidate
    const sourceConflict = entries.some(({ candidate }) => candidate.status !== first.status || candidate.contentFingerprint !== first.contentFingerprint)
    if (sourceConflict) {
      for (const entry of entries) decisions[entry.candidateIndex] = { candidate: entry.candidate, status: 'conflict', reason: 'same-week-conflict' }
      continue
    }

    const authoritative = [...entries].sort((left, right) => {
      const roleDifference = instructionalRolePriority(right.candidate.instructionalRole) - instructionalRolePriority(left.candidate.instructionalRole)
      if (roleDifference) return roleDifference
      return left.candidate.source.sourceUnitId.localeCompare(right.candidate.source.sourceUnitId)
    })[0]
    const existing = existingByDatasetId.get(datasetId)
    const existingClassification = existing ? classifyExistingDataset(existing, authoritative.candidate) : null

    if (existingClassification === 'conflict') {
      for (const entry of entries) decisions[entry.candidateIndex] = { candidate: entry.candidate, status: 'conflict', reason: 'existing-conflict' }
      continue
    }

    if (!existing) {
      decisions[authoritative.candidateIndex] = { candidate: authoritative.candidate, status: 'selected', reason: 'selected' }
      selectedCandidates.push(authoritative.candidate)
    } else if (existingClassification === 'confirmation') {
      const incomingIsCurrent = isCurrentInstructionalRole(authoritative.candidate.instructionalRole)
      decisions[authoritative.candidateIndex] = {
        candidate: authoritative.candidate,
        status: 'confirmation',
        reason: incomingIsCurrent ? 'existing-confirmation-current' : 'existing-confirmation-preview',
        refreshExistingMetadata: incomingIsCurrent,
      }
    } else {
      decisions[authoritative.candidateIndex] = { candidate: authoritative.candidate, status: 'duplicate', reason: 'existing-duplicate' }
    }

    for (const entry of entries) {
      if (entry === authoritative) continue
      const relationship = classifyCandidateCollision(authoritative.candidate, entry.candidate)
      decisions[entry.candidateIndex] = relationship === 'confirmation'
        ? { candidate: entry.candidate, status: 'confirmation', reason: 'same-week-confirmation' }
        : { candidate: entry.candidate, status: 'duplicate', reason: 'same-week-duplicate' }
    }
  }

  return {
    decisions: decisions.map((decision, index) => decision || { candidate: candidates[index], status: 'malformed', reason: 'candidate-malformed' }),
    selectedCandidates,
  }
}
