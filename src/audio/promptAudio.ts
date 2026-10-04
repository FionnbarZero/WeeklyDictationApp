import type { Word } from '../domain/contracts.ts'

export type PromptAudioHandle = {
  stop: () => void
  started: Promise<void>
}

export type PromptAudioAttempt = void | (() => void) | PromptAudioHandle

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

type CachedAudioOptions = {
  createAudio?: () => AudioElementLike
  pauseMs?: number
  resolveUrl?: (storagePath: string) => string
  setTimer?: (callback: () => void, delay: number) => number
  clearTimer?: (timer: number) => void
}

function defaultAudioUrl(storagePath: string) {
  if (/^https?:\/\//i.test(storagePath)) return storagePath
  return new URL(storagePath.replace(/^\/+/, ''), document.baseURI).href
}

export function stopPromptAudio(attempt: PromptAudioAttempt) {
  if (typeof attempt === 'function') attempt()
  else attempt?.stop()
}

export function promptAudioStarted(attempt: PromptAudioAttempt) {
  if (!attempt) return Promise.reject(new Error('No approved audio recording is available for this prompt.'))
  return typeof attempt === 'function' ? Promise.resolve() : attempt.started
}

export function playCachedWordAudio(word: Word, warmup = false, options: CachedAudioOptions = {}): PromptAudioAttempt {
  const storagePath = word.audio?.storagePath
  if (!storagePath || (!options.createAudio && typeof Audio === 'undefined')) return

  const createAudio = options.createAudio || (() => new Audio())
  const resolveUrl = options.resolveUrl || defaultAudioUrl
  const setTimer = options.setTimer || ((callback, delay) => globalThis.setTimeout(callback, delay))
  const clearTimer = options.clearTimer || ((timer) => globalThis.clearTimeout(timer))
  const pauseMs = options.pauseMs ?? 1000
  const audio = createAudio()
  const sources = [storagePath, storagePath, storagePath]
  let sourceIndex = 0
  let pauseTimer: number | undefined
  let cancelled = false
  let settled = false
  let resolveStarted: () => void = () => undefined
  let rejectStarted: (error: Error) => void = () => undefined
  const started = new Promise<void>((resolve, reject) => {
    resolveStarted = resolve
    rejectStarted = reject
  })

  const markStarted = () => {
    if (settled || cancelled) return
    settled = true
    resolveStarted()
  }
  const fail = () => {
    if (settled || cancelled) return
    settled = true
    rejectStarted(new Error('The Mandarin recording could not play. Tap Replay sequence to try again.'))
  }
  const playNext = () => {
    if (cancelled || sourceIndex >= sources.length) return
    audio.src = resolveUrl(sources[sourceIndex])
    sourceIndex += 1
    audio.playbackRate = warmup ? 1.5 : 1
    audio.preload = 'auto'
    audio.load()
    void audio.play().then(markStarted).catch(fail)
  }
  const handleEnded = () => {
    if (!cancelled && sourceIndex < sources.length) pauseTimer = setTimer(playNext, pauseMs)
  }
  audio.addEventListener('playing', markStarted)
  audio.addEventListener('ended', handleEnded)
  audio.addEventListener('error', fail)
  playNext()

  return {
    started,
    stop: () => {
      cancelled = true
      if (pauseTimer !== undefined) clearTimer(pauseTimer)
      audio.pause()
      audio.removeEventListener('playing', markStarted)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', fail)
      audio.removeAttribute('src')
      audio.load()
    },
  }
}

export function playCachedWordAudioOnce(word: Word, options: CachedAudioOptions = {}): Promise<void> {
  const storagePath = word.audio?.storagePath
  if (!storagePath || (!options.createAudio && typeof Audio === 'undefined')) {
    return Promise.reject(new Error('No approved audio recording is available for this prompt.'))
  }

  const createAudio = options.createAudio || (() => new Audio())
  const resolveUrl = options.resolveUrl || defaultAudioUrl
  const audio = createAudio()

  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      audio.removeEventListener('ended', finish)
      audio.removeEventListener('error', fail)
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
      reject(new Error('The correct Mandarin pronunciation could not play. Tap the headphones to try again.'))
    }

    audio.addEventListener('ended', finish)
    audio.addEventListener('error', fail)
    audio.src = resolveUrl(storagePath)
    audio.playbackRate = 1
    audio.preload = 'auto'
    audio.load()
    void audio.play().catch(fail)
  })
}
