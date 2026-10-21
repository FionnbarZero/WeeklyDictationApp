import { useState } from 'react'
import { Tier2ReadingPractice, type Tier2ReadingPracticeProps } from '../readingPractice/Tier2ReadingPractice.tsx'
import { openGrade5PreviewReading } from './readingStore.ts'

function open() {
  try {
    return { store: openGrade5PreviewReading(), error: '' }
  } catch (failure) {
    return { store: null, error: failure instanceof Error ? failure.message : String(failure) }
  }
}

/** Keep the store owned by this mounted visit. Initialization errors remain
 * inside the activity so the surrounding Report controls and menu still work. */
export function Grade5PreviewReading(props: Tier2ReadingPracticeProps) {
  const [opened, setOpened] = useState(open)
  if (!opened.store)
    return (
      <main className="oct23-test">
        <p role="alert">Reading could not open: {opened.error}. Nothing was deleted.</p>
        <button type="button" onClick={() => setOpened(open())}>
          Retry opening reading
        </button>
        <button type="button" onClick={props.onExit}>
          Return to Grade 5 menu
        </button>
      </main>
    )
  const store = opened.store
  return (
    <Tier2ReadingPractice
      {...props}
      persistAcquisition
      openSavedAcquisition={() => store}
      sessionNote="Teaching position saves in this browser. Recordings remain temporary."
      onComplete={(summary) => {
        // The original store's compare-and-swap rejects a stale tab. Reopening
        // here would adopt and finalize another visit's newer reviewed work.
        store.finishSession()
        props.onComplete(summary)
      }}
    />
  )
}
