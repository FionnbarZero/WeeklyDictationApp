import { useEffect, useState } from 'react'
import { activityClock } from '../activity/activityLifecycle.ts'
import type { LearningHubLaunchContext, LearningHubViewModel } from '../learningHub/contracts.ts'

/** A normal activity click can open its retained source in a fresh owned frame.
 * Consume each launch token once, even when the grade remounts its menu on Exit. */
export function AutomaticLessonEntry<Launch>({
  model,
  onLaunch,
}: {
  model: LearningHubViewModel<Launch>
  onLaunch: (launch: Launch, context: LearningHubLaunchContext) => void | Promise<void>
}) {
  const [retry, setRetry] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => {
    const frame = window.frameElement as HTMLIFrameElement | null
    if (!frame) return
    const observer = new MutationObserver(() => setRetry((value) => value + 1))
    observer.observe(frame, {
      attributes: true,
      attributeFilter: [
        'data-family-auto-launch',
        'data-family-presentation',
        'data-family-active',
        'data-family-paused',
      ],
    })
    const unsubscribe = activityClock.subscribe(() => setRetry((value) => value + 1))
    return () => {
      observer.disconnect()
      unsubscribe()
    }
  }, [])
  useEffect(() => {
    const frame = window.frameElement as HTMLIFrameElement | null
    const token = frame?.dataset.familyAutoLaunch
    if (!frame || !token || frame.dataset.familyLaunchConsumed === token) return
    if (
      frame.dataset.familyActive !== 'true' ||
      frame.dataset.familyPaused === 'true' ||
      activityClock.paused ||
      (frame.dataset.familyPresentation && frame.dataset.familyPresentation !== 'ready')
    )
      return
    const channel = frame.dataset.familyResumeChannel
    const section = model.sections.find((item) =>
      item.activities.some((activity) => activity.id === `dojo-${channel}` || activity.id === `acquisition-${channel}`),
    )
    const activity = section?.activities.find(
      (item) => item.id === `dojo-${channel}` || item.id === `acquisition-${channel}`,
    )
    if (!section || activity?.action.kind !== 'launch') return
    const launch = activity.action.launch
    frame.dataset.familyLaunchConsumed = token
    document.documentElement.dataset.activityLaunchPending = 'true'
    void Promise.resolve()
      .then(() =>
        onLaunch(launch, {
          sectionId: section.id,
          cohortId: section.defaultCohortId || section.cohorts[0]?.id || null,
        }),
      )
      .catch((failure) => {
        setError(failure instanceof Error ? failure.message : 'Your lesson could not reopen. Please try again.')
      })
      .finally(() => {
        delete document.documentElement.dataset.activityLaunchPending
      })
  }, [model, onLaunch, retry])
  return error ? <p role="alert">{error}</p> : null
}
