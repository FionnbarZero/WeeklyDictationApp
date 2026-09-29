import type { CurriculumProgressionEvidence } from '../curriculum/model.ts'
import type { LifecycleProgressionEvent } from './contracts.ts'

export function lifecycleProgressionEventsFrom(
  evidence: readonly CurriculumProgressionEvidence[],
): LifecycleProgressionEvent[] {
  return evidence.map((item) => ({
    eventId: item.evidenceId,
    grade: item.grade,
    schoolYearKey: item.schoolYearKey,
    effectiveDate: item.effectiveDate,
    introducedDatasetId: item.introducedDatasetId,
    ...(item.confirmedDatasetId ? { confirmedDatasetId: item.confirmedDatasetId } : {}),
  }))
}
