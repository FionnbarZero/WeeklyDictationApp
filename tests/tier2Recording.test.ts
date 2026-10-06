import assert from 'node:assert/strict'
import test from 'node:test'
import {
  selectReadingAudioMimeType,
  startEphemeralAudioRecording,
  type AudioMediaRecorder,
  type AudioRecorderDependencies,
} from '../src/readingPractice/audioRecorder.ts'
import { readingShowCopyInstruction, ReadingRecorderError } from '../src/readingPractice/contracts.ts'

type RecorderHarness = {
  dependencies: AudioRecorderDependencies
  recorder: AudioMediaRecorder
  stopCount: () => number
  revoked: string[]
  runTimeLimit: () => void
}

function recorderHarness(): RecorderHarness {
  let trackStops = 0
  let timeLimit: (() => void) | undefined
  const revoked: string[] = []
  const recorder: AudioMediaRecorder = {
    state: 'inactive',
    mimeType: 'audio/webm',
    ondataavailable: null,
    onerror: null,
    onstop: null,
    start() { this.state = 'recording' },
    stop() {
      this.state = 'inactive'
      this.ondataavailable?.({ data: new Blob(['reading'], { type: this.mimeType }) })
      this.onstop?.()
    },
  }
  return {
    recorder,
    stopCount: () => trackStops,
    revoked,
    runTimeLimit: () => timeLimit?.(),
    dependencies: {
      getUserMedia: async () => ({ getTracks: () => [{ stop: () => { trackStops += 1 } }] }),
      createRecorder: () => recorder,
      createObjectURL: () => 'blob:reading-1',
      revokeObjectURL: (url) => revoked.push(url),
      schedule: (callback) => {
        timeLimit = callback
        return 1 as unknown as ReturnType<typeof setTimeout>
      },
      cancelSchedule: () => { timeLimit = undefined },
    },
  }
}

test('audio MIME selection uses the first browser-supported candidate without assuming one format', () => {
  assert.equal(selectReadingAudioMimeType((candidate) => candidate === 'audio/mp4'), 'audio/mp4')
  assert.equal(selectReadingAudioMimeType(() => false), undefined)
})

test('every reading show-copy trial owns the same bilingual teaching instruction', () => {
  assert.deepEqual(readingShowCopyInstruction({ text: '妈妈', sentence: '这是妈妈' }), [
    { text: 'Read and record', language: 'en-GB', rate: 0.9 },
    { text: '妈妈', language: 'zh-CN', rate: 0.55 },
    { text: '这是妈妈', language: 'zh-CN', rate: 0.55 },
    { text: '妈妈', language: 'zh-CN', rate: 0.55 },
    { text: '妈妈', language: 'zh-CN', rate: 0.55 },
  ])
})

test('an ephemeral reading recording releases the microphone and revokes its playback URL exactly once', async () => {
  const harness = recorderHarness()
  const active = await startEphemeralAudioRecording(harness.dependencies)
  assert.equal(harness.recorder.state, 'recording')

  active.stop()
  const clip = await active.finished
  assert.equal(clip.url, 'blob:reading-1')
  assert.equal(clip.mimeType, 'audio/webm')
  assert.ok(clip.size > 0)
  assert.equal(harness.stopCount(), 1)

  clip.dispose()
  clip.dispose()
  assert.deepEqual(harness.revoked, ['blob:reading-1'])
})

test('the recording safety limit stops and finalizes the current recording', async () => {
  const harness = recorderHarness()
  const active = await startEphemeralAudioRecording(harness.dependencies)
  harness.runTimeLimit()
  const clip = await active.finished
  assert.equal(harness.recorder.state, 'inactive')
  assert.equal(harness.stopCount(), 1)
  clip.dispose()
})

test('cancelling a prompt releases the microphone without creating a retained audio URL', async () => {
  const harness = recorderHarness()
  const active = await startEphemeralAudioRecording(harness.dependencies)
  const finished = active.finished.catch((error: unknown) => error)
  active.cancel()
  const error = await finished
  assert.ok(error instanceof ReadingRecorderError)
  assert.equal(harness.stopCount(), 1)
  assert.deepEqual(harness.revoked, [])
})

test('microphone permission denial is exposed as a child-recoverable recorder error', async () => {
  const harness = recorderHarness()
  harness.dependencies.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError') }
  await assert.rejects(
    () => startEphemeralAudioRecording(harness.dependencies),
    (error: unknown) => error instanceof ReadingRecorderError && error.code === 'permission-denied',
  )
})

test('recorder construction failure releases an already-open microphone stream', async () => {
  const harness = recorderHarness()
  harness.dependencies.createRecorder = () => { throw new Error('construction failed') }
  await assert.rejects(
    () => startEphemeralAudioRecording(harness.dependencies),
    (error: unknown) => error instanceof ReadingRecorderError && error.code === 'recording-failed',
  )
  assert.equal(harness.stopCount(), 1)
})

test('recorder start failure releases the microphone without leaving an unreachable rejected completion', async () => {
  const harness = recorderHarness()
  harness.recorder.start = () => { throw new Error('start failed') }
  await assert.rejects(
    () => startEphemeralAudioRecording(harness.dependencies),
    (error: unknown) => error instanceof ReadingRecorderError && error.code === 'recording-failed',
  )
  assert.equal(harness.stopCount(), 1)
})
