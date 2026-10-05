import type { Word } from '../domain/contracts.ts'

export const DICTATION_AUDIO_GAP_MS = 750

export type PromptAudioHandle = {
  stop: () => void
  started: Promise<void>
  completed: Promise<void>
}

export type PromptAudioAttempt = void | (() => void) | PromptAudioHandle

export type AudioPlanSegment = {
  readonly text: string
  readonly language: 'zh-CN' | 'en-GB' | 'en-IE' | 'en-US'
  readonly rate: number
  readonly storagePath?: string
  readonly pauseAfterMs?: number
}

type AudioElementLike = Pick<
  HTMLAudioElement,
  | 'addEventListener'
  | 'load'
  | 'pause'
  | 'play'
  | 'playbackRate'
  | 'preload'
  | 'removeAttribute'
  | 'removeEventListener'
  | 'src'
>

export type AudioPlanOptions = {
  createAudio?: () => AudioElementLike
  createUtterance?: (text: string) => SpeechSynthesisUtterance | undefined
  pauseMs?: number
  resolveUrl?: (storagePath: string) => string
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
  speech?: SpeechSynthesis
  voiceLoadTimeoutMs?: number
}

export type CachedAudioOptions = AudioPlanOptions & {
  playbackRate?: number
  sentenceRate?: number
  instructionRate?: number
  newTargetAnnouncement?: string
  newTargetAnnouncementStoragePath?: string
}

const MANDARIN_FALLBACK_VOICE_NAMES = [
  'Tingting',
  'Google 普通话（中国大陆）',
  'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)',
  'Microsoft Huihui Desktop - Chinese (Simplified)',
] as const

const ENGLISH_FALLBACK_VOICE_NAMES = [
  'Niamh',
  'Google UK English Female',
  'Microsoft Sonia Online (Natural) - English (United Kingdom)',
] as const

let activePromptAudio: PromptAudioHandle | null = null
let activeMediaStop: (() => void) | null = null

function defaultAudioUrl(storagePath: string) {
  if (/^https?:\/\//i.test(storagePath)) return storagePath
  return new URL(storagePath.replace(/^\/+/, ''), document.baseURI).href
}

function browserSpeech() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : undefined
}

function browserUtterance(text: string) {
  return typeof SpeechSynthesisUtterance === 'undefined' ? undefined : new SpeechSynthesisUtterance(text)
}

function availableVoices(speech: SpeechSynthesis) {
  try { return speech.getVoices() } catch { return [] }
}

function preferredVoiceFor(speech: SpeechSynthesis, language: string) {
  const names = language.startsWith('zh') ? MANDARIN_FALLBACK_VOICE_NAMES : ENGLISH_FALLBACK_VOICE_NAMES
  const voices = availableVoices(speech)
  return names.map((name) => voices.find((voice) => voice.name.toLowerCase() === name.toLowerCase())).find(Boolean)
}

function voiceFor(speech: SpeechSynthesis, language: string) {
  const voices = availableVoices(speech)
  return preferredVoiceFor(speech, language)
    || voices.find((voice) => voice.lang.toLowerCase() === language.toLowerCase())
    || voices.find((voice) => voice.lang.toLowerCase().startsWith(language.slice(0, 2).toLowerCase()))
}

export function stopActiveAudio() {
  const stopMedia = activeMediaStop
  activeMediaStop = null
  stopMedia?.()
  activePromptAudio?.stop()
  activePromptAudio = null
  browserSpeech()?.cancel()
}

/**
 * Give a child recording or other existing media element the same global audio
 * focus as prompt audio. This prevents recordings, instructions, and model
 * pronunciations from overlapping across question and navigation boundaries.
 */
export function playManagedMediaElement(element: HTMLMediaElement): Promise<void> {
  stopActiveAudio()
  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      element.removeEventListener('ended', finish)
      element.removeEventListener('error', fail)
      if (activeMediaStop === cancel) activeMediaStop = null
    }
    const finish = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const fail = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('The recording could not be played.'))
    }
    const cancel = () => {
      element.pause()
      fail()
    }
    activeMediaStop = cancel
    element.addEventListener('ended', finish, { once: true })
    element.addEventListener('error', fail, { once: true })
    element.currentTime = 0
    try {
      void element.play().catch(fail)
    } catch {
      fail()
    }
  })
}

export function stopPromptAudio(attempt: PromptAudioAttempt) {
  if (typeof attempt === 'function') attempt()
  else attempt?.stop()
}

export function promptAudioStarted(attempt: PromptAudioAttempt) {
  if (!attempt) return Promise.reject(new Error('Audio is unavailable. Try again or ask a teacher for help.'))
  return typeof attempt === 'function' ? Promise.resolve() : attempt.started
}

export function promptAudioCompleted(attempt: PromptAudioAttempt) {
  if (!attempt) return Promise.reject(new Error('Audio is unavailable. Try again or ask a teacher for help.'))
  return typeof attempt === 'function' ? Promise.resolve() : attempt.completed
}

/**
 * Play one serialized, cancellable audio plan. A supplied recording is always
 * attempted first. If it fails, the same segment immediately falls back to
 * browser speech. Starting any plan stops every prior managed plan.
 */
export function playAudioPlan(
  rawSegments: readonly AudioPlanSegment[],
  options: AudioPlanOptions = {},
): PromptAudioAttempt {
  const segments = rawSegments.filter((segment) => segment.text.trim())
  if (segments.length === 0) return

  stopActiveAudio()

  const resolveUrl = options.resolveUrl || defaultAudioUrl
  const setTimer = options.setTimer || ((callback, delay) => globalThis.setTimeout(callback, delay))
  const clearTimer = options.clearTimer || ((timer) => globalThis.clearTimeout(timer))
  const speech = options.speech || browserSpeech()
  const createUtterance = options.createUtterance || browserUtterance
  let activeAudio: AudioElementLike | null = null
  let activeUtterance: SpeechSynthesisUtterance | null = null
  let cancelActiveSegment: (() => void) | undefined
  let pauseTimer: ReturnType<typeof setTimeout> | undefined
  let releasePause: (() => void) | undefined
  let cancelled = false
  let firstSegmentStarted = false
  let startedSettled = false
  let completedSettled = false
  let settleStarted!: () => void
  let failStarted!: (error: Error) => void
  let settleCompleted!: () => void
  let failCompleted!: (error: Error) => void
  const started = new Promise<void>((resolve, reject) => {
    settleStarted = () => { if (!startedSettled) { startedSettled = true; resolve() } }
    failStarted = (error) => { if (!startedSettled) { startedSettled = true; reject(error) } }
  })
  const completed = new Promise<void>((resolve, reject) => {
    settleCompleted = () => { if (!completedSettled) { completedSettled = true; resolve() } }
    failCompleted = (error) => { if (!completedSettled) { completedSettled = true; reject(error) } }
  })

  function markStarted() {
    if (firstSegmentStarted || cancelled) return
    firstSegmentStarted = true
    settleStarted()
  }

  function playbackError() {
    return new Error('Audio could not play. Try again or ask a teacher for help.')
  }

  function stopCurrentSource() {
    const shouldCancelSpeech = Boolean(activeUtterance)
    cancelActiveSegment?.()
    cancelActiveSegment = undefined
    if (activeAudio) {
      activeAudio.pause()
      activeAudio.removeAttribute('src')
      activeAudio.load()
      activeAudio = null
    }
    if (speech && shouldCancelSpeech) {
      speech.cancel()
    }
    activeUtterance = null
  }

  function cachedSegment(segment: AudioPlanSegment): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!segment.storagePath || (!options.createAudio && typeof Audio === 'undefined')) {
        reject(playbackError())
        return
      }
      const audio = options.createAudio ? options.createAudio() : new Audio()
      activeAudio = audio
      let settled = false
      const watchdog = globalThis.setTimeout(() => fail(), 15_000)
      const cleanup = () => {
        globalThis.clearTimeout(watchdog)
        audio.removeEventListener('playing', handlePlaying)
        audio.removeEventListener('ended', finish)
        audio.removeEventListener('error', fail)
        if (activeAudio === audio) activeAudio = null
        if (cancelActiveSegment === fail) cancelActiveSegment = undefined
      }
      const handlePlaying = () => markStarted()
      const finish = () => {
        if (settled) return
        settled = true
        cleanup()
        resolve()
      }
      const fail = () => {
        if (settled) return
        settled = true
        cleanup()
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
        reject(playbackError())
      }
      audio.addEventListener('playing', handlePlaying)
      audio.addEventListener('ended', finish)
      audio.addEventListener('error', fail)
      cancelActiveSegment = fail
      audio.src = resolveUrl(segment.storagePath)
      audio.playbackRate = segment.rate
      audio.preload = 'auto'
      audio.load()
      try {
        void audio.play().then(markStarted).catch(fail)
      } catch {
        fail()
      }
    })
  }

  function speechSegment(segment: AudioPlanSegment): Promise<void> {
    return new Promise((resolve, reject) => {
      const utterance = createUtterance(segment.text)
      if (!speech || !utterance) {
        reject(playbackError())
        return
      }
      const activeSpeech = speech
      const spokenUtterance = utterance
      activeUtterance = spokenUtterance
      spokenUtterance.lang = segment.language
      spokenUtterance.rate = segment.rate
      spokenUtterance.pitch = 1
      let settled = false
      let voiceTimer: ReturnType<typeof setTimeout> | undefined
      let waitingForVoices = false
      const watchdog = globalThis.setTimeout(() => finish(playbackError()), 15_000)
      const stopWaitingForVoices = () => {
        if (voiceTimer !== undefined) globalThis.clearTimeout(voiceTimer)
        voiceTimer = undefined
        if (waitingForVoices) activeSpeech.removeEventListener?.('voiceschanged', beginWithPreferredVoice)
        waitingForVoices = false
      }
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        globalThis.clearTimeout(watchdog)
        stopWaitingForVoices()
        if (activeUtterance === spokenUtterance) activeUtterance = null
        if (cancelActiveSegment === cancel) cancelActiveSegment = undefined
        if (error) reject(error)
        else resolve()
      }
      const cancel = () => finish(new Error('Audio playback was cancelled.'))
      spokenUtterance.onstart = markStarted
      spokenUtterance.onend = () => finish()
      spokenUtterance.onerror = () => finish(playbackError())
      cancelActiveSegment = cancel

      function begin(voice = voiceFor(activeSpeech, segment.language)) {
        if (settled || cancelled) return
        stopWaitingForVoices()
        spokenUtterance.voice = voice || null
        activeSpeech.resume()
        try {
          activeSpeech.speak(spokenUtterance)
        } catch {
          finish(playbackError())
        }
      }

      function beginWithPreferredVoice() {
        const preferred = preferredVoiceFor(activeSpeech, segment.language)
        if (preferred) begin(preferred)
      }

      const preferred = preferredVoiceFor(activeSpeech, segment.language)
      const waitMs = options.voiceLoadTimeoutMs ?? 350
      if (preferred || waitMs <= 0) begin(preferred)
      else {
        waitingForVoices = true
        activeSpeech.addEventListener?.('voiceschanged', beginWithPreferredVoice)
        voiceTimer = globalThis.setTimeout(() => begin(), waitMs)
      }
    })
  }

  function wait(delay: number) {
    if (delay <= 0) return Promise.resolve()
    return new Promise<void>((resolve) => {
      releasePause = resolve
      pauseTimer = setTimer(() => {
        pauseTimer = undefined
        releasePause = undefined
        resolve()
      }, delay)
    })
  }

  async function run() {
    try {
      for (let index = 0; index < segments.length; index += 1) {
        if (cancelled) return
        const segment = segments[index]
        try {
          await cachedSegment(segment)
        } catch {
          if (cancelled) return
          await speechSegment(segment)
        }
        if (cancelled) return
        if (index < segments.length - 1) await wait(segment.pauseAfterMs ?? options.pauseMs ?? DICTATION_AUDIO_GAP_MS)
      }
      if (!cancelled) {
        settleCompleted()
        if (activePromptAudio === handle) activePromptAudio = null
      }
    } catch {
      if (cancelled) return
      const error = playbackError()
      if (!firstSegmentStarted) failStarted(error)
      failCompleted(error)
      if (activePromptAudio === handle) activePromptAudio = null
    }
  }

  const handle: PromptAudioHandle = {
    started,
    completed,
    stop: () => {
      if (cancelled) return
      cancelled = true
      if (pauseTimer !== undefined) clearTimer(pauseTimer)
      releasePause?.()
      releasePause = undefined
      stopCurrentSource()
      const cancellation = new Error('Audio playback was cancelled.')
      if (!firstSegmentStarted) failStarted(cancellation)
      failCompleted(cancellation)
      if (activePromptAudio === handle) activePromptAudio = null
    },
  }
  activePromptAudio = handle
  void started.catch(() => undefined)
  void completed.catch(() => undefined)
  void run()
  return handle
}

function dictationSegments(word: Word, playbackRate: number, sentenceRate: number): AudioPlanSegment[] {
  const storagePath = word.audio?.storagePath
  const contextStoragePath = word.audio?.contextStoragePath
  return [
    { text: word.text, language: 'zh-CN', rate: playbackRate, storagePath },
    ...(word.sentence.trim()
      ? [{ text: word.sentence, language: 'zh-CN' as const, rate: sentenceRate, storagePath: contextStoragePath }]
      : []),
    { text: word.text, language: 'zh-CN', rate: playbackRate, storagePath },
    { text: word.text, language: 'zh-CN', rate: playbackRate, storagePath },
  ]
}

export function playCachedWordAudio(word: Word, _warmup = false, options: CachedAudioOptions = {}): PromptAudioAttempt {
  const playbackRate = options.playbackRate ?? 1
  const sentenceRate = options.sentenceRate ?? playbackRate
  return playAudioPlan(dictationSegments(word, playbackRate, sentenceRate), options)
}

export function playCachedWordAudioOnce(word: Word, options: CachedAudioOptions = {}): Promise<void> {
  const playback = playAudioPlan([{
    text: word.text,
    language: 'zh-CN',
    rate: options.playbackRate ?? 1,
    storagePath: word.audio?.storagePath,
  }], options)
  return promptAudioCompleted(playback)
}

export function playReadingTeachingSequence(word: Word, options: CachedAudioOptions = {}): Promise<void> {
  const playbackRate = options.playbackRate ?? 1
  const playback = playAudioPlan([
    {
      text: options.newTargetAnnouncement || 'Read and record',
      language: 'en-GB',
      rate: options.instructionRate ?? 0.9,
      storagePath: options.newTargetAnnouncementStoragePath,
      pauseAfterMs: 0,
    },
    ...dictationSegments(word, playbackRate, options.sentenceRate ?? playbackRate),
  ], options)
  return promptAudioCompleted(playback)
}
