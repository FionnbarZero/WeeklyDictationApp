/** Called synchronously by the isolated preview's Start tap, before storage awaits.
 * WebKit unlocks subsequent speech when speak() runs inside a user gesture.
 * An empty, silent utterance enables that session without adding a teaching cue.
 * This is not proof of audible playback; normal prompt completion/error handling
 * still owns the lesson and timer. Retry on every Start/resume, never persist it.
 */
export function enablePreviewSpeechFromTap() {
  if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined')
    return
  try {
    const speech = window.speechSynthesis
    const primer = new SpeechSynthesisUtterance('')
    primer.volume = 0
    speech.speak(primer)
    speech.cancel()
  } catch {
    // Let the existing visible prompt-audio retry handle unavailable speech.
  }
}
