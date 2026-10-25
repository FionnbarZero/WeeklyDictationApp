import { activityClock } from '../activity/activityLifecycle.ts'

/** Small, public game effects only. Decode complete bytes, activate the context
 * on a real tap, and release every buffer/listener when the game closes. */
export function createRecordedEffects(urls: Readonly<Record<string, string>>, volume: number) {
  const context = new AudioContext()
  const loading = new AbortController()
  const buffers = new Map<string, Promise<AudioBuffer>>()
  let disposed = false
  let request = 0
  let active: AudioBufferSourceNode | undefined
  const stop = () => {
    request += 1
    active?.stop()
    active = undefined
  }
  const prime = (event: Event) => {
    if (event.isTrusted && !disposed && !activityClock.paused && context.state === 'suspended') {
      void context.resume().catch(() => undefined)
    }
  }
  document.addEventListener('pointerdown', prime, { capture: true, passive: true })
  document.addEventListener('keydown', prime, { capture: true })
  const unsubscribe = activityClock.subscribe((paused) => {
    if (paused) stop()
  })
  const bufferFor = (name: string) => {
    const cached = buffers.get(name)
    if (cached) return cached
    const url = urls[name]
    if (!url) return Promise.reject(new Error('Unknown game sound.'))
    const pending = fetch(url, { signal: loading.signal, credentials: 'same-origin' }).then(async (response) => {
      if (!response.ok) throw new Error('Game sound unavailable.')
      return context.decodeAudioData(await response.arrayBuffer())
    })
    buffers.set(name, pending)
    void pending.catch(() => {
      if (buffers.get(name) === pending) buffers.delete(name)
    })
    return pending
  }
  for (const name of Object.keys(urls)) void bufferFor(name).catch(() => undefined)
  return {
    async play(name: string) {
      if (disposed || activityClock.paused) return
      stop()
      const current = request
      try {
        const buffer = await bufferFor(name)
        if (disposed || current !== request || activityClock.paused) return
        if (context.state === 'suspended') await context.resume()
        if (disposed || current !== request || activityClock.paused) return
        const source = context.createBufferSource()
        const gain = context.createGain()
        source.buffer = buffer
        gain.gain.value = volume
        source.connect(gain)
        gain.connect(context.destination)
        source.onended = () => {
          source.disconnect()
          gain.disconnect()
          if (active === source) active = undefined
        }
        try {
          source.start()
          active = source
        } catch (error) {
          source.disconnect()
          gain.disconnect()
          throw error
        }
      } catch {
        // Effects are optional; a failed fetch can retry on the next turn.
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      stop()
      loading.abort()
      buffers.clear()
      unsubscribe()
      document.removeEventListener('pointerdown', prime, true)
      document.removeEventListener('keydown', prime, true)
      void context.close().catch(() => undefined)
    },
  }
}
