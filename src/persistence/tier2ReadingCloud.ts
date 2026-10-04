import { isTier2ReadingProgressRecord, tier2ReadingMetadataOnly } from '../application/readingPersistence.ts'
import type { Tier2ReadingProgressRecord } from '../readingPractice/contracts.ts'

export type Tier2ReadingCloudMetadataRecord = Omit<Tier2ReadingProgressRecord, 'run'> & {
  readonly runJson: string
}

/**
 * Creates the only Tier 2 reading shape allowed to cross the cloud boundary.
 * Prompt-local microphone clips and curriculum audio hints are removed at every
 * nesting level; lifecycle identity, target IDs, attempts, and self-assessments remain.
 */
export function encodeTier2ReadingCloudProgress(progress: Tier2ReadingProgressRecord) {
  const sanitized = tier2ReadingMetadataOnly(progress)
  if (!isTier2ReadingProgressRecord(sanitized)) {
    throw new Error('Tier 2 reading cloud metadata failed validation.')
  }
  const { run, ...metadata } = sanitized
  return { ...metadata, runJson: JSON.stringify(run) } satisfies Tier2ReadingCloudMetadataRecord
}

export function decodeTier2ReadingCloudProgress(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const cloud = value as Record<string, unknown>
  if (typeof cloud.runJson !== 'string') return null
  let run: unknown
  try {
    run = JSON.parse(cloud.runJson)
  } catch {
    return null
  }
  const { runJson: _, ...metadata } = cloud
  const decoded = tier2ReadingMetadataOnly({ ...metadata, run })
  return isTier2ReadingProgressRecord(decoded) ? decoded : null
}
