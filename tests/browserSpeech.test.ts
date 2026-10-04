import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  SpeechController,
  type SpeechPlatform,
  type SpeechPlaybackResult,
} from '../src/audio/browserSpeech.ts'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function sourceFilesUnder(path: string): string[] {
  const absolute = join(repositoryRoot, path)
  return readdirSync(absolute).flatMap((entry) => {
    const child = join(absolute, entry)
    return statSync(child).isDirectory()
      ? sourceFilesUnder(relative(repositoryRoot, child))
      : /\.tsx?$/.test(entry) ? [relative(repositoryRoot, child)] : []
  })
}

type FakeUtterance = ReturnType<typeof createFakeUtterance>

function createFakeUtterance(text: string) {
  return {
    text,
    lang: '',
    rate: 1,
    pitch: 1,
    voice: null as { lang: string } | null,
    onend: null as null | (() => void),
    onerror: null as null | (() => void),
  }
}

function speechHarness(available = true) {
  const spoken: FakeUtterance[] = []
  let cancellations = 0
  let timerId = 0
  const timers = new Map<number, () => void>()
  const synthesis = available ? {
    addEventListener() {},
    cancel() { cancellations += 1 },
    getVoices() { return [{ lang: 'zh-CN' }] },
    removeEventListener() {},
    resume() {},
    speak(utterance: FakeUtterance) { spoken.push(utterance) },
  } : undefined
  const platform: SpeechPlatform = {
    synthesis: () => synthesis,
    createUtterance: available ? createFakeUtterance : () => undefined,
    setTimer: (callback) => {
      timerId += 1
      timers.set(timerId, callback)
      return timerId
    },
    clearTimer: (id) => { timers.delete(id) },
  }
  return {
    controller: new SpeechController(platform),
    spoken,
    cancellations: () => cancellations,
    runTimers: () => {
      for (const [id, callback] of [...timers]) {
        timers.delete(id)
        callback()
      }
    },
  }
}

test('the shared speech controller plays a sequence and reports segment completion in order', async () => {
  const harness = speechHarness()
  const completed: number[] = []
  const playback = harness.controller.play([
    { text: '需要', language: 'zh-CN', rate: 0.25 },
    { text: '我需要一本书。', language: 'zh-CN', rate: 0.55 },
  ], { onSegmentComplete: (index) => completed.push(index) })

  assert.deepEqual(harness.spoken.map((item) => item.text), ['需要'])
  harness.spoken[0].onend?.()
  assert.deepEqual(completed, [0])
  assert.deepEqual(harness.spoken.map((item) => item.text), ['需要', '我需要一本书。'])
  harness.spoken[1].onend?.()

  assert.deepEqual(await playback.finished, { status: 'completed', completedSegments: 2 })
  assert.deepEqual(completed, [0, 1])
})

test('starting a new playback cancels the old owner while a stale cancel cannot stop the replacement', async () => {
  const harness = speechHarness()
  const first = harness.controller.play([{ text: '第一' }])
  const second = harness.controller.play([{ text: '第二' }])

  assert.equal((await first.finished).status, 'cancelled')
  assert.equal(harness.cancellations(), 1)
  first.cancel()
  assert.equal(harness.cancellations(), 1)

  harness.spoken.at(-1)?.onend?.()
  assert.equal((await second.finished).status, 'completed')
})

test('unavailable and failed speech settle explicitly instead of hanging the caller', async () => {
  const unavailable = speechHarness(false)
  const unavailableResult = await unavailable.controller.play([{ text: '需要' }]).finished
  assert.equal(unavailableResult.status, 'unavailable')
  assert.match(unavailableResult.error?.message || '', /unavailable/i)

  const failed = speechHarness()
  const playback = failed.controller.play([{ text: '需要' }])
  failed.spoken[0].onerror?.()
  const result: SpeechPlaybackResult = await playback.finished
  assert.equal(result.status, 'error')
  assert.match(result.error?.message || '', /failed/i)
})

test('a stalled utterance times out and releases the active browser speech owner', async () => {
  const harness = speechHarness()
  const playback = harness.controller.play([{ text: '需要' }])
  harness.runTimers()

  assert.equal((await playback.finished).status, 'timed-out')
  assert.equal(harness.cancellations(), 1)
})

test('browser speech APIs stay behind the shared audio boundary', () => {
  const directSpeechUsers = sourceFilesUnder('src').filter((path) => {
    if (path === 'src/audio/browserSpeech.ts') return false
    return /\b(?:speechSynthesis|SpeechSynthesisUtterance)\b/.test(readFileSync(join(repositoryRoot, path), 'utf8'))
  })

  assert.deepEqual(directSpeechUsers, [])
})
