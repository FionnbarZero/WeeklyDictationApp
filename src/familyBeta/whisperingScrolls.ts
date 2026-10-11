import type { AcquisitionTargetSet } from '../acquisition/contracts.ts'
import { schoolYearToken } from '../curriculum/identity.ts'
import type { Dataset } from '../domain/contracts.ts'
import type { Tier2ReadingTarget } from '../tier2/contracts.ts'
import { tier2ReadingProfileForScope } from '../tier2/registry.ts'

export const WHISPERING_SCROLLS_MODULE = 'whispering-scrolls'
export const WHISPERING_SCROLLS_TITLE = 'Whispering Scrolls'

/** The hub supplies the grade-owned acquisition cohort, never earlier game pools. */
export function whisperingScrollsLesson(datasets: readonly Dataset[]) {
  if (datasets.length !== 1) throw new Error('Whispering Scrolls needs one current reading cohort.')
  const dataset = datasets[0]
  const profile = tier2ReadingProfileForScope(dataset.grade, schoolYearToken(dataset.schoolYear))
  const targets = dataset.vocabulary?.tier2 || []
  if (
    !profile ||
    !targets.length ||
    targets.some(
      (target) =>
        target.datasetId !== dataset.id ||
        target.tier !== 'tier-2' ||
        target.activityType !== 'reading' ||
        target.language !== 'mandarin',
    )
  )
    throw new Error('This cohort has no validated Tier 2 reading targets for Whispering Scrolls.')
  const targetSet: AcquisitionTargetSet<Tier2ReadingTarget> = {
    id: dataset.id,
    targets: targets as Tier2ReadingTarget[],
  }
  return { profile, targetSet }
}
