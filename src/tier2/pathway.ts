import type { AcquisitionTargetSet } from '../acquisition/contracts.ts'
import type { Tier2ReadingPathway, Tier2ReadingTarget } from './contracts.ts'

export function tier2ReadingPathwayTargets(pathway: Tier2ReadingPathway): Tier2ReadingTarget[] {
  return pathway.cohorts.flatMap((cohort) => cohort.targets)
}

export function tier2ReadingAcquisitionTargetSet(
  pathway: Tier2ReadingPathway,
): AcquisitionTargetSet<Tier2ReadingTarget> {
  if (pathway.kind !== 'acquisition' || pathway.cohorts.length !== 1 || !pathway.available) {
    throw new Error('Tier 2 Acquisition requires one available curriculum cohort.')
  }
  const cohort = pathway.cohorts[0]
  return { id: cohort.datasetId, targets: cohort.targets }
}
