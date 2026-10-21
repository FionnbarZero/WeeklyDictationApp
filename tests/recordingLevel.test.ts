import assert from 'node:assert/strict'
import test from 'node:test'
import { balanceTemporaryRecording, recordingGain, recordingWave } from '../src/readingPractice/recordingLevel.ts'

test('temporary voice balancing boosts quiet speech but not silence or loud peaks', () => {
  assert.equal(recordingGain(new Float32Array([0, 0, 0])), 1)
  assert.equal(recordingGain(new Float32Array([0.0001, -0.0001])), 1)
  assert.equal(recordingGain(new Float32Array([0.01, -0.01])), 6)
  assert.equal(recordingGain(new Float32Array([0.95, -0.95])), 1)
  const samples = new Float32Array(1000).fill(0.01)
  samples[0] = 0.5
  assert.ok(recordingGain(samples) <= 1.84)
  assert.equal(recordingGain(new Float32Array([Number.NaN])), 1)
})

test('balanced playback is bounded mono WAV and decoding absence preserves original clip', async () => {
  const wave = recordingWave(new Float32Array([0.1, -0.1]), 44100, 2)
  const bytes = new DataView(await wave.arrayBuffer())
  assert.equal(wave.type, 'audio/wav')
  assert.equal(bytes.byteLength, 48)
  assert.equal(bytes.getUint16(22, true), 1)
  assert.equal(bytes.getUint32(24, true), 44100)
  assert.ok(Math.abs(bytes.getInt16(44, true) - 6553) <= 1)
  assert.equal(await balanceTemporaryRecording(wave), wave)
})
