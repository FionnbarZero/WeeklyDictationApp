import type {
  CurriculumImportResult,
  CurriculumSourceIssue,
  WeeklyDatasetCandidate,
} from './model.ts'

export function importResultFromCandidates(
  candidates: WeeklyDatasetCandidate[],
): CurriculumImportResult {
  const issues: CurriculumSourceIssue[] = candidates.flatMap((candidate) =>
    candidate.validationOutcomes.map((outcome) => ({
      ...outcome,
      source: candidate.source,
      ...(candidate.datasetId ? { datasetId: candidate.datasetId } : {}),
    })))

  return {
    candidates,
    issues,
    progressionEvidence: [],
    resources: [],
  }
}
