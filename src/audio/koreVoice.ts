import catalog from './kore/catalog.json' with { type: 'json' }
import type { AudioPlanSegment } from './promptAudio.ts'

export const KORE_VOICE = 'cmn-CN-Chirp3-HD-Kore'
export const KORE_RECORDING_RATE = 0.65
const assets: Readonly<Record<string, string>> = catalog.assets

export function koreTextKey(text: string) {
  return text.trim().replace(/[。！？.!?]+$/u, '')
}

/** One shared route covers writing, reading, tests, Warmup and every game.
 * Recordings already contain the selected slow pace. Replay controls express
 * the desired speech rate, so divide once rather than slowing the clip twice.
 * English instructions and the separate child-recording player are untouched.
 */
export function koreAudioSegments(segment: AudioPlanSegment): AudioPlanSegment[] {
  if (segment.language !== 'zh-CN') return [segment]
  const effectiveRate = segment.speechRate ?? segment.rate
  const recording = (text: string, last = true): AudioPlanSegment => ({
    ...segment,
    text,
    storagePath: assets[koreTextKey(text)],
    rate: effectiveRate / KORE_RECORDING_RATE,
    speechRate: effectiveRate,
    pauseAfterMs: last ? segment.pauseAfterMs : 350,
  })
  if (assets[koreTextKey(segment.text)]) return [recording(segment.text)]
  // Dictation games combine word, context, word, word into one owned prompt.
  // Split only complete sentences, never synthesize words by splicing characters.
  const parts =
    segment.text
      .match(/[^。！？.!?]+[。！？.!?]*/gu)
      ?.map((text) => text.trim())
      .filter(Boolean) || []
  if (parts.length > 1 && parts.every((text) => assets[koreTextKey(text)]))
    return parts.map((text, index) => recording(text, index === parts.length - 1))
  // New teacher content may arrive before a recording is generated. Retain the
  // existing visible retry/browser-speech recovery; never label old clips Kore.
  return [{ ...segment, storagePath: undefined }]
}
