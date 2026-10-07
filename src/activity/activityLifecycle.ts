import { ActivityClock } from './ActivityClock.ts'

export const activityClock = new ActivityClock()
let reportId = 0

/** Each kept-alive activity owns a document, clock and fixed child/week scope. */
function installDocumentBoundary() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  let owner: Element | null = null
  try {
    if (window.parent !== window && window.parent.document.body.dataset.familyContext === 'family')
      owner = window.frameElement
  } catch {
    /* A foreign parent cannot control this document's activity. */
  }

  const ownedAnimations = new Set<Animation>()
  const apply = (paused: boolean) => {
    document.documentElement.dataset.activityPaused = String(paused)
    if (paused) {
      for (const animation of document.getAnimations?.() || []) {
        if (animation.playState === 'running') {
          ownedAnimations.add(animation)
          animation.pause()
        }
      }
    } else {
      for (const animation of ownedAnimations) if (animation.playState === 'paused') animation.play()
      ownedAnimations.clear()
    }
    for (const frame of document.querySelectorAll('iframe[data-family-slot]')) {
      frame.setAttribute('data-family-owner-paused', String(paused))
      // Notify synchronously too: a native confirmation blocks mutation delivery.
      try {
        ;(frame as HTMLIFrameElement).contentWindow?.dispatchEvent(new Event('family-activity-owner-state'))
      } catch {
        /* The initial owner read covers loading documents. */
      }
    }
  }
  activityClock.subscribe(apply)
  const refreshOwner = () => {
    activityClock.setPaused('navigation', owner?.getAttribute('data-family-paused') === 'true')
    activityClock.setPaused('owner', owner?.getAttribute('data-family-owner-paused') === 'true')
  }
  window.addEventListener('family-activity-owner-state', refreshOwner)
  if (owner)
    new MutationObserver(refreshOwner).observe(owner, {
      attributes: true,
      attributeFilter: ['data-family-paused', 'data-family-owner-paused'],
    })
  const visibility = () => activityClock.setPaused('visibility', document.hidden)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('pagehide', () => activityClock.setPaused('pagehide', true))
  window.addEventListener('pageshow', () => activityClock.setPaused('pagehide', false))
  new MutationObserver(() => {
    if (activityClock.paused) apply(true)
  }).observe(document.documentElement, { childList: true, subtree: true })
  const style = document.createElement('style')
  style.textContent =
    'html[data-activity-paused="true"] *,html[data-activity-paused="true"] *::before,html[data-activity-paused="true"] *::after{animation-play-state:paused!important}'
  document.head.append(style)
  refreshOwner()
  visibility()
  apply(activityClock.paused)
}

installDocumentBoundary()

export function pauseForReport() {
  const reason = `report-${++reportId}`
  activityClock.setPaused(reason, true)
  return () => activityClock.setPaused(reason, false)
}

/** An inner exit returns to the family navigation while retaining this document. */
export function hasFamilyActivityOwner() {
  try {
    return Boolean(
      window.frameElement?.hasAttribute('data-family-slot') &&
        window.parent.document.body.dataset.familyContext === 'family',
    )
  } catch {
    return false
  }
}

export function pauseToFamilyHub() {
  try {
    if (!hasFamilyActivityOwner()) return false
    activityClock.setPaused('navigation', true)
    window.parent.postMessage({ type: 'family-beta-activity-paused' }, location.origin)
    return true
  } catch {
    return false
  }
}

export function confirmActivityDiscard() {
  const release = pauseForReport()
  try {
    return window.confirm(
      'Discard this unfinished attempt? Completed scores and reviewed saved practice stay in history.',
    )
  } finally {
    release()
  }
}
