import {
  browserSpeech,
  type SpeechPlayback,
  type SpeechPlaybackOptions,
  type SpeechPlaybackResult,
  type SpeechSegment,
} from './browserSpeech.ts'

type ActiveRecordedPlayback = {
  cancel: () => void
}

let activeRecordedPlayback: ActiveRecordedPlayback | null = null

export function recordedMandarinFileName(text: string) {
  return `${[...text.normalize('NFC')].map((character) => character.codePointAt(0)!.toString(16)).join('-')}.wav`
}

function recordedMandarinUrl(text: string) {
  return `${import.meta.env.BASE_URL}audio/mandarin/${recordedMandarinFileName(text)}`
}

export function cancelRecordedMandarinAudio() {
  activeRecordedPlayback?.cancel()
}

export function playRecordedMandarin(
  segments: readonly SpeechSegment[],
  options: SpeechPlaybackOptions = {},
): SpeechPlayback {
  cancelRecordedMandarinAudio()
  browserSpeech.cancel()
  const playableSegments = segments.filter((segment) => segment.text.trim().length > 0)
  let audio: HTMLAudioElement | null = null
  let fallback: SpeechPlayback | null = null
  let pauseTimer: number | undefined
  let timeoutTimer: number | undefined
  let completedSegments = 0
  let settled = false
  let resolveFinished!: (result: SpeechPlaybackResult) => void
  const finished = new Promise<SpeechPlaybackResult>((resolve) => {
    resolveFinished = resolve
  })

  const clearTimers = () => {
    if (pauseTimer !== undefined) window.clearTimeout(pauseTimer)
    if (timeoutTimer !== undefined) window.clearTimeout(timeoutTimer)
    pauseTimer = undefined
    timeoutTimer = undefined
  }
  const stopAudio = () => {
    if (!audio) return
    audio.onended = null
    audio.onerror = null
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    audio = null
  }
  const settle = (result: SpeechPlaybackResult) => {
    if (settled) return
    settled = true
    clearTimers()
    stopAudio()
    if (activeRecordedPlayback?.cancel === cancel) activeRecordedPlayback = null
    resolveFinished(result)
  }
  const cancel = () => {
    if (settled) return
    fallback?.cancel()
    settle({ status: 'cancelled', completedSegments })
  }
  const finishSegment = (index: number) => {
    if (settled) return
    clearTimers()
    stopAudio()
    completedSegments += 1
    options.onSegmentComplete?.(index)
    if (index + 1 >= playableSegments.length) {
      settle({ status: 'completed', completedSegments })
      return
    }
    pauseTimer = window.setTimeout(
      () => playSegment(index + 1),
      playableSegments[index].pauseAfterMs ?? options.pauseMs ?? 0,
    )
  }
  const useSpeechFallback = (index: number) => {
    if (settled || fallback) return
    clearTimers()
    stopAudio()
    fallback = browserSpeech.play(playableSegments.slice(index), {
      ...options,
      onSegmentComplete: (relativeIndex) => options.onSegmentComplete?.(index + relativeIndex),
    })
    void fallback.finished.then((result) => {
      settle({
        ...result,
        completedSegments: completedSegments + result.completedSegments,
      })
    })
  }
  const playSegment = (index: number) => {
    if (settled) return
    const segment = playableSegments[index]
    if (!segment) {
      settle({ status: 'completed', completedSegments })
      return
    }
    if (typeof Audio === 'undefined') {
      useSpeechFallback(index)
      return
    }
    audio = new Audio(recordedMandarinUrl(segment.text))
    audio.preload = 'auto'
    audio.playbackRate = segment.rate && segment.rate <= 0.4 ? Math.max(0.5, segment.rate / 0.25) : 1
    audio.onended = () => finishSegment(index)
    audio.onerror = () => useSpeechFallback(index)
    timeoutTimer = window.setTimeout(() => useSpeechFallback(index), options.utteranceTimeoutMs ?? 15_000)
    void audio.play().catch(() => useSpeechFallback(index))
  }

  activeRecordedPlayback = { cancel }
  if (playableSegments.length === 0) settle({ status: 'completed', completedSegments: 0 })
  else playSegment(0)
  return { cancel, finished }
}
