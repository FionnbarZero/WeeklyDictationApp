import type { BetaResult } from './model.ts'

export type ResultRetentionBucket = 'detail' | 'summary' | 'unknown'

function schoolYearStart(value: string) {
  const match = value.match(/20\d{2}/)
  return match ? Number(match[0]) : null
}

/** Classifies records for a future non-destructive retention preview. */
export function resultRetentionBucket(result: BetaResult, currentSchoolYear: string): ResultRetentionBucket {
  if (!result.schoolYear) return 'unknown'
  const resultStart = schoolYearStart(result.schoolYear)
  const currentStart = schoolYearStart(currentSchoolYear)
  if (resultStart === null || currentStart === null) return 'unknown'
  return resultStart >= currentStart - 1 ? 'detail' : 'summary'
}
