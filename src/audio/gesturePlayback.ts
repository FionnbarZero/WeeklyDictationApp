import { regressionPreview } from '../regressionPreview/policy.ts'

let player: HTMLAudioElement | undefined
let primed = false
let priming = false
let speechPrimed = false

/** Reuse the media element activated by a real tap, including for child playback.
 * Creating a new Audio element after recording finishes loses that activation. */
export function gesturePlaybackElement() {
  if (!regressionPreview || typeof Audio === 'undefined') return undefined
  player ||= new Audio()
  return player
}

function silentWave() {
  const data = new ArrayBuffer(204)
  const view = new DataView(data)
  const text = (offset: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 196, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 16000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, 160, true)
  return URL.createObjectURL(new Blob([data], { type: 'audio/wav' }))
}

export function installGesturePlayback() {
  if (!regressionPreview || typeof document === 'undefined') return
  const prime = (event: Event) => {
    if (!event.isTrusted) return
    const audio = gesturePlaybackElement()
    // Never replace an active word/recording with the silent primer.
    if (audio && !primed && !priming && (!audio.src || audio.ended)) {
      priming = true
      const url = silentWave()
      audio.src = url
      void audio
        .play()
        .then(
          () => {
            primed = true
          },
          () => {
            // A failed attempt must not prevent the next genuine tap from retrying.
            if (audio.src === url) audio.removeAttribute('src')
          },
        )
        .finally(() => {
          priming = false
          URL.revokeObjectURL(url)
        })
    }
    if (
      !speechPrimed &&
      typeof SpeechSynthesisUtterance !== 'undefined' &&
      window.speechSynthesis &&
      !window.speechSynthesis.speaking
    ) {
      speechPrimed = true
      try {
        const primer = new SpeechSynthesisUtterance('')
        primer.volume = 0
        window.speechSynthesis.speak(primer)
        window.speechSynthesis.cancel()
      } catch {
        speechPrimed = false
      }
    }
  }
  document.addEventListener('pointerdown', prime, { capture: true, passive: true })
  document.addEventListener('keydown', prime, { capture: true })
}
