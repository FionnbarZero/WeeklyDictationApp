import type {
  AudioPlanOptions,
  AudioPlanSegment,
  CachedAudioOptions,
  PromptAudioAttempt,
  PromptAudioHandle,
} from './promptAudio.ts'
import type { Word } from '../domain/contracts.ts'

type PromptAudioModule = typeof import('./promptAudio.ts')

/**
 * Keep the full audio runtime outside the initial Grade 2 application bundle.
 * Practice views already load it lazily; this bridge preserves the same
 * cancellable handle for the callbacks owned by App.
 */
function lazyPromptAudio(start: (module: PromptAudioModule) => PromptAudioAttempt): PromptAudioHandle {
  let stopped = false
  let delegate: PromptAudioAttempt
  let audioModule: PromptAudioModule | undefined
  const loaded = import('./promptAudio.ts').then((module) => {
    audioModule = module
    if (stopped) throw new Error('Audio playback was cancelled.')
    delegate = start(module)
    return module
  })
  const started = loaded.then((module) => module.promptAudioStarted(delegate))
  const completed = loaded.then((module) => module.promptAudioCompleted(delegate))
  void started.catch(() => undefined)
  void completed.catch(() => undefined)

  return {
    stop() {
      stopped = true
      if (audioModule) audioModule.stopPromptAudio(delegate)
    },
    started,
    completed,
  }
}

export function playAudioPlan(
  segments: readonly AudioPlanSegment[],
  options: AudioPlanOptions = {},
): PromptAudioHandle {
  return lazyPromptAudio((module) => module.playAudioPlan(segments, options))
}

export function playCachedWordAudio(
  word: Word,
  warmup = false,
  options: CachedAudioOptions = {},
): PromptAudioHandle {
  return lazyPromptAudio((module) => module.playCachedWordAudio(word, warmup, options))
}

export function stopActiveAudio() {
  void import('./promptAudio.ts').then((module) => module.stopActiveAudio())
}
