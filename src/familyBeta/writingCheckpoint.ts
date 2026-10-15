import { validateWritingProgress, type WritingProgress } from '../application/writingAcquisition/progress.ts'

/** Schema 2 is deliberately unreadable by the existing schema-1 recovery/client. */
export function validateWritingActivity(values: Record<string, unknown>, childId: string, activityId: string) {
  if (
    !values ||
    Object.keys(values).some(
      (key) =>
        ![
          'acquisitionProgressions',
          'acquisitionProgressEnvelopes',
          'writingAcquisitionProgress',
          'acquisitionTransitionReceipts',
          'acquisitionPendingCheckpoints',
        ].includes(key),
    )
  )
    throw new Error('The saved writing record has unsupported fields. It was preserved.')
  const items = values.writingAcquisitionProgress
  const envelopes = values.acquisitionProgressEnvelopes
  if (!Array.isArray(items) || items.length !== 1 || !Array.isArray(envelopes) || envelopes.length !== 1)
    throw new Error('The combined writing checkpoint is incomplete. Nothing was replaced.')
  validateWritingProgress(items[0], childId)
  const progress = items[0]
  if (
    progress.acquisition.id !== activityId ||
    progress.attemptId !== activityId ||
    JSON.stringify(progress.acquisition) !== JSON.stringify(envelopes[0]) ||
    !Array.isArray(values.acquisitionPendingCheckpoints) ||
    values.acquisitionPendingCheckpoints.length
  )
    throw new Error('Writing and acquisition checkpoints disagree. Both copies were preserved.')
  return progress
}

export function writingPayload(payload: string): WritingProgress | null {
  const record = JSON.parse(payload)
  return record?.schema === 2 ? validateWritingActivity(record.values, record.childId, record.activityId) : null
}

/** Confirmed teaching milestones order unfinished checkpoints, never scores. */
export function chooseWritingPayload(local: string, online: string, childId: string, referenceNow: string) {
  const a = writingPayload(local)
  const b = writingPayload(online)
  if (
    !a ||
    !b ||
    a.owner !== childId ||
    b.owner !== childId ||
    a.acquisition.id !== b.acquisition.id ||
    a.lesson.fingerprint !== b.lesson.fingerprint ||
    a.firstTeacherTargetIndex !== b.firstTeacherTargetIndex ||
    a.initialAcquisitionRevision !== b.initialAcquisitionRevision
  )
    return null
  const reference = Date.parse(referenceNow)
  if (!Number.isFinite(reference)) return null
  const confirmed = (p: WritingProgress) => (p.revision > 0 && p.lastCommand ? Date.parse(p.updatedAt) : null)
  const at = confirmed(a),
    bt = confirmed(b)
  if ((at !== null && at > reference + 300_000) || (bt !== null && bt > reference + 300_000)) return null
  if (at === null && bt === null) return null
  if (at === null) return 'online' as const
  if (bt === null) return 'local' as const
  return at === bt
    ? a.revision !== b.revision
      ? a.revision > b.revision
        ? ('local' as const)
        : ('online' as const)
      : local.localeCompare(online) >= 0
        ? ('local' as const)
        : ('online' as const)
    : at > bt
      ? ('local' as const)
      : ('online' as const)
}
