import { activityClock } from '../../../activity/activityLifecycle.ts'
export type GameSound = 'select' | 'flip' | 'correct' | 'incorrect' | 'progress' | 'victory'

let audioContext: AudioContext | null = null
activityClock.subscribe((paused) => {
  if (!paused || !audioContext) return
  void audioContext.close().catch(() => undefined)
  audioContext = null
})

function tone(
  context: AudioContext,
  frequency: number,
  startsAt: number,
  duration: number,
  gainValue: number,
  type: OscillatorType = 'sine',
) {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, startsAt)
  gain.gain.setValueAtTime(0.0001, startsAt)
  gain.gain.exponentialRampToValueAtTime(gainValue, startsAt + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.onended = () => {
    oscillator.disconnect()
    gain.disconnect()
  }
  oscillator.start(startsAt)
  oscillator.stop(startsAt + duration + 0.02)
}

export function playGameSound(sound: GameSound) {
  if (typeof window === 'undefined' || activityClock.paused) return
  const AudioContextClass = window.AudioContext
  if (!AudioContextClass) return

  try {
    audioContext ||= new AudioContextClass()
    const now = audioContext.currentTime
    if (audioContext.state === 'suspended') void audioContext.resume().catch(() => undefined)

    if (sound === 'select') tone(audioContext, 330, now, 0.08, 0.035, 'triangle')
    if (sound === 'flip') {
      tone(audioContext, 220, now, 0.09, 0.035, 'triangle')
      tone(audioContext, 430, now + 0.045, 0.11, 0.025, 'sine')
    }
    if (sound === 'correct' || sound === 'progress') {
      tone(audioContext, 440, now, 0.12, 0.045, 'triangle')
      tone(audioContext, 660, now + 0.075, 0.16, 0.04, 'triangle')
      tone(audioContext, 880, now + 0.15, 0.19, 0.032, 'sine')
    }
    if (sound === 'incorrect') {
      tone(audioContext, 185, now, 0.14, 0.045, 'sawtooth')
      tone(audioContext, 145, now + 0.09, 0.2, 0.035, 'sawtooth')
    }
    if (sound === 'victory') {
      ;[523, 659, 784, 1047].forEach((frequency, index) =>
        tone(audioContext!, frequency, now + index * 0.08, 0.28, 0.038, index === 3 ? 'sine' : 'triangle'),
      )
    }
    if ('vibrate' in navigator) {
      if (sound === 'incorrect') navigator.vibrate?.([35, 45, 35])
      else if (sound === 'correct' || sound === 'progress') navigator.vibrate?.(25)
      else if (sound === 'victory') navigator.vibrate?.([25, 35, 25, 35, 50])
    }
  } catch {
    // Sound and vibration are enhancements; gameplay never depends on them.
  }
}
