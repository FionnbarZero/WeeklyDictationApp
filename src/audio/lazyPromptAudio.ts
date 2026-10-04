import type {
  AudioPlanOptions,
  AudioPlanSegment,
  PromptAudioAttempt,
  PromptAudioHandle,
} from './promptAudio.ts'

type PromptAudioModule = typeof import('./promptAudio.ts')

/**
 * Keep the full audio runtime outside the initial Grade 2 application bundle.
 * Practice views already load it lazily; this bridge preserves the same
 * cancellable handle for the callbacks owned by App.
 */
export function playAudioPlan(
  segments: readonly AudioPlanSegment[],
  options: AudioPlanOptions = {},
): PromptAudioHandle {
  let stopped = false
  let delegate: PromptAudioAttempt
  let audioModule: PromptAudioModule | undefined
  const loaded = import('./promptAudio.ts').then((module) => {
    audioModule = module
    if (stopped) throw new Error('Audio playback was cancelled.')
    delegate = module.playAudioPlan(segments, options)
    return module
  })

  return {
    stop() {
      stopped = true
      if (audioModule) audioModule.stopPromptAudio(delegate)
    },
    started: loaded.then((module) => module.promptAudioStarted(delegate)),
    completed: loaded.then((module) => module.promptAudioCompleted(delegate)),
  }
}

export function stopActiveAudio() {
  void import('./promptAudio.ts').then((module) => module.stopActiveAudio())
}
