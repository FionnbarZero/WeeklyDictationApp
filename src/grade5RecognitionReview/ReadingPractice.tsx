import { useRef } from 'react'
import type { Dataset } from '../domain/contracts.ts'
import { savePreviewResult } from '../familyBeta/runtime.ts'
import { Tier2ReadingPractice, type Tier2ReadingPracticeSummary } from '../readingPractice/Tier2ReadingPractice.tsx'
import type { Tier2ReadingProfile, Tier2ReadingTarget } from '../tier2/contracts.ts'

export function RecognitionReadingPractice({
  dataset,
  profile,
  onExit,
}: {
  dataset: Dataset
  profile: Tier2ReadingProfile
  onExit: () => void
}) {
  const fallbackId = useRef(crypto.randomUUID()).current
  function finish(summary: Tier2ReadingPracticeSummary) {
    if (summary.attempted > 0) {
      const saved = savePreviewResult({
        id: summary.sessionId || fallbackId,
        activity: 'Cumulative Reading Practice',
        channel: 'reading',
        datasetIds: [dataset.id],
        schoolYear: dataset.schoolYear,
        correct: summary.correct,
        attempted: summary.attempted,
      })
      if (!saved) throw new Error('The reading result could not be confirmed. Keep this lesson open and retry.')
    }
    onExit()
  }
  return (
    <Tier2ReadingPractice
      profile={profile}
      label="Read the Words · November 2–6 review"
      pathway={{
        kind: 'acquisition',
        available: true,
        cohorts: [
          { datasetId: dataset.id, available: true, targets: dataset.vocabulary!.tier2 as Tier2ReadingTarget[] },
        ],
      }}
      onExit={onExit}
      onComplete={finish}
    />
  )
}
