import { useState } from 'react'
import { familyAcquisitionStore } from '../familyBeta/acquisitionRuntime.ts'
import {
  type ReadingAcquisitionStore,
  Tier2ReadingPractice,
  type Tier2ReadingPracticeProps,
} from '../readingPractice/Tier2ReadingPractice.tsx'
import type { Tier2ReadingTarget } from '../tier2/contracts.ts'
import { tier2ReadingAcquisitionTargetSet } from '../tier2/pathway.ts'

type OpenedReading = { store: ReadingAcquisitionStore | null; error: string }

function openReading(props: Tier2ReadingPracticeProps): OpenedReading {
  try {
    const store = props.openSavedAcquisition
      ? props.openSavedAcquisition()
      : familyAcquisitionStore<Tier2ReadingTarget, 'recording-comparison'>(
          tier2ReadingAcquisitionTargetSet(props.pathway),
          props.profile.acquisitionStrategy,
          'reading-dojo',
          'tier-2',
        )
    if (!store) throw new Error('Open reading from the Grade 5 menu with an active profile.')
    return { store, error: '' }
  } catch (failure) {
    return { store: null, error: failure instanceof Error ? failure.message : String(failure) }
  }
}

function SavedGrade5Reading(props: Tier2ReadingPracticeProps) {
  const [opened, setOpened] = useState(() => openReading(props))
  if (!opened.store)
    return (
      <main
        className="reading-practice-page practice-page"
        data-report-activity="Reading practice"
        data-report-phase="opening"
      >
        <section className="prompt-card">
          <p role="alert">Reading could not open: {opened.error}. Nothing was deleted.</p>
          <button type="button" className="primary-button" onClick={() => setOpened(openReading(props))}>
            Retry opening reading
          </button>
          <button type="button" className="secondary-button" onClick={props.onExit}>
            Return to Grade 5 menu
          </button>
        </section>
      </main>
    )

  // Retain this visit's native profile-owned store. Its assertActive/prepareResult
  // checks reject stale tabs; the native completion handler must confirm the
  // immutable result before a later opening can finish the saved session.
  const store = opened.store
  return (
    <Tier2ReadingPractice
      {...props}
      persistAcquisition
      openSavedAcquisition={() => store}
      onComplete={(summary) => {
        // The shared view prepares a result only after a scored response. A
        // zero-score Done still needs the original store's compare-and-swap;
        // assertActive alone checks retirement, not another tab's newer work.
        if (summary.attempted === 0) store.prepareResult()
        props.onComplete(summary)
      }}
    />
  )
}

/** Initialization failure stays inside the activity, leaving Report and Exit usable. */
export function Grade5PresentationReading(props: Tier2ReadingPracticeProps) {
  if (props.pathway.kind !== 'acquisition' || props.persistAcquisition === false)
    return <Tier2ReadingPractice {...props} />
  return <SavedGrade5Reading {...props} />
}
