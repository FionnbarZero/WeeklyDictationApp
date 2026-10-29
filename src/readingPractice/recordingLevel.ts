/** Temporary, on-device playback balancing. Never uploads or retains a recording. */
export function recordingGain(samples: Float32Array) {
  let energy = 0
  let peak = 0
  for (const sample of samples) {
    if (!Number.isFinite(sample)) return 1
    energy += sample * sample
    peak = Math.max(peak, Math.abs(sample))
  }
  const rms = Math.sqrt(energy / Math.max(1, samples.length))
  // Do not amplify near-silence or already-loud speech.
  if (rms < 0.002 || peak === 0) return 1
  return Math.max(1, Math.min(6, 0.12 / rms, 0.92 / peak))
}

export function recordingWave(samples: Float32Array, sampleRate: number, gain: number) {
  const bytes = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(bytes)
  const text = (offset: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, bytes.byteLength - 8, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, i) => {
    const value = Math.max(-1, Math.min(1, sample * gain))
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true)
  })
  return new Blob([bytes], { type: 'audio/wav' })
}

export async function balanceTemporaryRecording(blob: Blob): Promise<Blob> {
  if (typeof OfflineAudioContext === 'undefined') return blob
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const normalize = async () => {
      const decoder = new OfflineAudioContext(1, 1, 44100)
      const buffer = await decoder.decodeAudioData(await blob.arrayBuffer())
      // A corrupted/long recording must not allocate an unbounded second buffer.
      if (buffer.duration > 10 || buffer.numberOfChannels < 1) return blob
      const mono = new Float32Array(buffer.length)
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const samples = buffer.getChannelData(channel)
        for (let i = 0; i < samples.length; i++) mono[i] += samples[i] / buffer.numberOfChannels
      }
      const gain = recordingGain(mono)
      return gain > 1.05 ? recordingWave(mono, buffer.sampleRate, gain) : blob
    }
    // Decoding failure must never trap the child between recording and comparison.
    return await Promise.race([
      normalize(),
      new Promise<Blob>((resolve) => {
        timer = setTimeout(() => resolve(blob), 1500)
      }),
    ])
  } catch {
    return blob
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
