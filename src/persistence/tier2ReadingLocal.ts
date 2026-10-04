import { isTier2ReadingProgressRecord } from '../application/readingPersistence.ts'
import type { Tier2ReadingProgressRecord } from '../readingPractice/contracts.ts'

export const TIER2_READING_LOCAL_STORAGE_KEY = 'weekly-dictation-tier2-reading-v1'

export function readLocalTier2ReadingProgress(storage: Storage): Tier2ReadingProgressRecord[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(TIER2_READING_LOCAL_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(isTier2ReadingProgressRecord) : []
  } catch {
    return []
  }
}

export function writeLocalTier2ReadingProgress(storage: Storage, progress: readonly Tier2ReadingProgressRecord[]) {
  try {
    storage.setItem(TIER2_READING_LOCAL_STORAGE_KEY, JSON.stringify(progress))
    return true
  } catch {
    return false
  }
}
