import { openAcquisitionStore } from '../familyBeta/acquisitionStore.ts'
import { tier2ReadingAcquisitionTargetSet } from '../tier2/pathway.ts'
import { grade5Tier2ReadingProfile } from '../tier2/profiles/grade5.ts'
import { PROTOTYPE_OWNER, readingPathway } from '../grade5Oct23Prototype/content.ts'
import { deviceWriter } from '../familyBeta/deviceWriter.ts'

/** A fixed synthetic owner on the isolated origin, with the normal validated
 * acquisition checkpoint engine. No account, cloud or real learner identity. */
export function openGrade5PreviewReading() {
  return openAcquisitionStore(
    localStorage,
    {
      identity: {
        childId: PROTOTYPE_OWNER,
        grade: 'Grade 5',
        datasetId: readingPathway.cohorts[0].datasetId,
        schoolYear: '2026-27',
        activityModule: 'grade5-pdf-reading-preview',
        tier: 'tier-2',
      },
      lifecycleStage: { kind: 'acquisition' },
      applicationVersion: 'grade5-regression-preview-v2',
      targetSet: tier2ReadingAcquisitionTargetSet(readingPathway),
      strategy: grade5Tier2ReadingProfile.acquisitionStrategy,
    },
    { writerId: deviceWriter(localStorage) },
  )
}
