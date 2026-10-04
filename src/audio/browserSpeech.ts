export type SpeechSegment = {
  readonly text: string
  readonly language?: string
  readonly rate?: number
  readonly pitch?: number
  readonly pauseAfterMs?: number
}

export type SpeechPlaybackStatus = 'completed' | 'cancelled' | 'unavailable' | 'error' | 'timed-out'

export type SpeechPlaybackResult = {
  readonly status: SpeechPlaybackStatus
  readonly completedSegments: number
  readonly error?: Error
}

export type SpeechPlayback = {
  readonly finished: Promise<SpeechPlaybackResult>
  cancel: () => void
}

export type SpeechPlaybackOptions = {
  readonly pauseMs?: number
  readonly voiceWaitMs?: number
  readonly utteranceTimeoutMs?: number
  readonly onSegmentComplete?: (index: number) => void
}

type SpeechVoiceLike = { readonly lang: string }

type SpeechUtteranceLike = {
  readonly text: string
  lang: string
  rate: number
  pitch: number
  voice: SpeechVoiceLike | null
  onend: null | (() => void)
  onerror: null | (() => void)
}

type SpeechSynthesisLike = {
  addEventListener?: (type: 'voiceschanged', listener: () => void) => void
  cancel: () => void
  getVoices?: () => readonly SpeechVoiceLike[]
  removeEventListener?: (type: 'voiceschanged', listener: () => void) => void
  resume?: () => void
  speak: (utterance: SpeechUtteranceLike) => void
}

export type SpeechPlatform = {
  synthesis: () => SpeechSynthesisLike | undefined
  createUtterance: (text: string) => SpeechUtteranceLike | undefined
  setTimer: (callback: () => void, delayMs: number) => number
  clearTimer: (timer: number) => void
}

type ActivePlayback = {
  readonly id: symbol
  cancel: () => void
}

const defaultVoiceWaitMs = 400
const defaultUtteranceTimeoutMs = 15_000

function playbackError(status: SpeechPlaybackStatus) {
  if (status === 'unavailable') return new Error('Speech playback is unavailable in this browser.')
  if (status === 'timed-out') return new Error('Speech playback timed out.')
  return new Error('Speech playback failed.')
}

export class SpeechController {
  private active: ActivePlayback | null = null
  private readonly platform: SpeechPlatform

  constructor(platform: SpeechPlatform) {
    this.platform = platform
  }

  unlock() {
    try {
      this.platform.synthesis()?.resume?.()
    } catch {
      // A later user-initiated play can still succeed.
    }
  }

  cancel() {
    this.active?.cancel()
  }

  play(input: readonly SpeechSegment[], options: SpeechPlaybackOptions = {}): SpeechPlayback {
    this.cancel()
    const id = Symbol('speech-playback')
    const segments = input.filter((segment) => segment.text.trim().length > 0)
    const synthesis = this.platform.synthesis()
    let completedSegments = 0
    let settled = false
    let voiceTimer: number | undefined
    let pauseTimer: number | undefined
    let utteranceTimer: number | undefined
    let listeningForVoices = false
    let startWhenReady = () => undefined
    let resolveFinished!: (result: SpeechPlaybackResult) => void
    const finished = new Promise<SpeechPlaybackResult>((resolve) => {
      resolveFinished = resolve
    })

    const clearTimers = () => {
      if (voiceTimer !== undefined) this.platform.clearTimer(voiceTimer)
      if (pauseTimer !== undefined) this.platform.clearTimer(pauseTimer)
      if (utteranceTimer !== undefined) this.platform.clearTimer(utteranceTimer)
      voiceTimer = undefined
      pauseTimer = undefined
      utteranceTimer = undefined
    }
    const stopListeningForVoices = () => {
      if (!listeningForVoices || !synthesis) return
      synthesis.removeEventListener?.('voiceschanged', startWhenReady)
      listeningForVoices = false
    }
    const settle = (status: SpeechPlaybackStatus, error?: Error, cancelNative = false) => {
      if (settled) return
      settled = true
      clearTimers()
      stopListeningForVoices()
      if (this.active?.id === id) {
        this.active = null
        if (cancelNative && synthesis) {
          try {
            synthesis.cancel()
          } catch {
            // The playback is already settled locally.
          }
        }
      }
      resolveFinished({ status, completedSegments, ...(error ? { error } : {}) })
    }
    const cancel = () => settle('cancelled', undefined, true)
    this.active = { id, cancel }

    const playSegment = (index: number) => {
      if (settled) return
      const segment = segments[index]
      if (!segment) {
        settle('completed')
        return
      }
      const utterance = this.platform.createUtterance(segment.text)
      if (!utterance || !synthesis) {
        settle('unavailable', playbackError('unavailable'))
        return
      }
      const language = segment.language || 'zh-CN'
      utterance.lang = language
      utterance.rate = segment.rate ?? 0.55
      utterance.pitch = segment.pitch ?? 1
      try {
        utterance.voice =
          synthesis
            .getVoices?.()
            .find((voice) => voice.lang.toLowerCase().startsWith(language.slice(0, 2).toLowerCase())) || null
      } catch {
        utterance.voice = null
      }
      const finishSegment = () => {
        if (settled) return
        if (utteranceTimer !== undefined) this.platform.clearTimer(utteranceTimer)
        utteranceTimer = undefined
        completedSegments += 1
        options.onSegmentComplete?.(index)
        if (index + 1 >= segments.length) {
          settle('completed')
          return
        }
        const pauseMs = segment.pauseAfterMs ?? options.pauseMs ?? 0
        if (pauseMs > 0) pauseTimer = this.platform.setTimer(() => playSegment(index + 1), pauseMs)
        else playSegment(index + 1)
      }
      utterance.onend = finishSegment
      utterance.onerror = () => settle('error', playbackError('error'))
      utteranceTimer = this.platform.setTimer(
        () => settle('timed-out', playbackError('timed-out'), true),
        options.utteranceTimeoutMs ?? defaultUtteranceTimeoutMs,
      )
      try {
        synthesis.resume?.()
        synthesis.speak(utterance)
      } catch {
        settle('error', playbackError('error'), true)
      }
    }
    startWhenReady = () => {
      if (settled) return
      if (voiceTimer !== undefined) {
        this.platform.clearTimer(voiceTimer)
        voiceTimer = undefined
      }
      stopListeningForVoices()
      playSegment(0)
    }

    if (!synthesis || segments.length === 0) {
      settle(synthesis ? 'completed' : 'unavailable', synthesis ? undefined : playbackError('unavailable'))
    } else {
      let hasVoices = false
      try {
        hasVoices = synthesis.getVoices?.().length ? true : false
      } catch {
        // Speaking with the browser default voice can still work.
      }
      if (hasVoices || !synthesis.getVoices || !synthesis.addEventListener || !synthesis.removeEventListener) {
        playSegment(0)
      } else {
        listeningForVoices = true
        synthesis.addEventListener('voiceschanged', startWhenReady)
        voiceTimer = this.platform.setTimer(startWhenReady, options.voiceWaitMs ?? defaultVoiceWaitMs)
      }
    }

    return { cancel, finished }
  }
}

const browserPlatform: SpeechPlatform = {
  synthesis: () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined
    return window.speechSynthesis as unknown as SpeechSynthesisLike
  },
  createUtterance: (text) => {
    if (typeof SpeechSynthesisUtterance === 'undefined') return undefined
    return new SpeechSynthesisUtterance(text) as unknown as SpeechUtteranceLike
  },
  setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimer: (timer) => window.clearTimeout(timer),
}

export const browserSpeech = new SpeechController(browserPlatform)

export async function requireCompletedSpeech(playback: SpeechPlayback): Promise<void> {
  const result = await playback.finished
  if (result.status !== 'completed') throw result.error || playbackError(result.status)
}
