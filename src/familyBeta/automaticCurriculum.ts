import type { Dataset } from '../domain/contracts.ts'

/** Isolated review only. The canonical and frozen presentation builds stay unchanged. */
export const automaticCurriculumPreview =
  (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_AUTOMATIC_CURRICULUM_PREVIEW === 'true'
export const automaticCurriculumEndpoint = 'https://weekly-dictation-curriculum-am3afdy42a-uc.a.run.app/curriculum/beta'

export function curriculumDateKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function scheduledCurriculumWeek(datasets: readonly Dataset[], today: string, requested = '') {
  const available = datasets.filter((d) => d.startDate <= today).sort((a, b) => b.startDate.localeCompare(a.startDate))
  return (available.find((d) => d.startDate === requested) || available[0])?.startDate || ''
}

/** Requests are serialized; disposed/previous-grade responses cannot publish.
 * Keep the latest validated result pending until the owner can apply it safely.
 * The settling callback also handles midnight without another teacher edit. */
export function watchCurriculum<T>(options: {
  load: (signal: AbortSignal) => Promise<T>
  apply: (value: T) => void
  error: (error: unknown) => void
}) {
  const controller = new AbortController()
  let pending: T | undefined
  let running: Promise<void> | undefined
  function settle() {
    if (!controller.signal.aborted && pending !== undefined) options.apply(pending)
  }
  function refresh() {
    if (controller.signal.aborted) return Promise.resolve()
    if (running) return running
    running = options
      .load(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return
        pending = value
        settle()
      })
      .catch((error) => {
        if (!controller.signal.aborted) options.error(error)
      })
      .finally(() => {
        running = undefined
      })
    return running
  }
  return { refresh, settle, dispose: () => controller.abort() }
}

/** A visible menu can be replaced; an open game, pen stroke, recording, loading
 * screen or hidden menu cannot. Report/visibility pause is checked by the owner. */
export function curriculumMenuReady(frame: HTMLIFrameElement) {
  try {
    const doc = frame.contentDocument
    const view = frame.contentWindow
    if (!doc || !view) return false
    return [...doc.querySelectorAll('.learning-hub-section-grid, .learning-hub-detail')].some((menu) => {
      if (!menu.getClientRects().length) return false
      for (let node: Element | null = menu; node; node = node.parentElement) {
        const style = view.getComputedStyle(node)
        if (node.hasAttribute('hidden') || style.display === 'none' || style.visibility === 'hidden') return false
      }
      return true
    })
  } catch {
    return false
  }
}
